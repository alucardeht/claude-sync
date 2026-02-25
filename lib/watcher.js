const chokidar = require('chokidar');
const path = require('path');
const config = require('./config');
const syncer = require('./syncer');
const chalk = require('chalk');
const { pathStartsWith } = require('./pathUtils');
const fs = require('fs');
const os = require('os');

class Watcher {
  constructor() {
    this.watcher = null;
    this.configWatcher = null;
    this.isWatching = false;
    this.currentWorkspaces = [];
    this.processingFiles = new Set();
    this.debounceTimers = new Map();
  }

  async start() {
    if (this.isWatching) {
      throw new Error('Watcher is already running');
    }

    await this.setupWatchers();
    this.isWatching = true;

    return new Promise((resolve) => {
      process.on('SIGINT', async () => {
        await this.stop();
        resolve();
      });

      process.on('SIGTERM', async () => {
        await this.stop();
        resolve();
      });
    });
  }

  async setupWatchers() {
    const allWorkspaces = config.listWorkspaces();

    if (!allWorkspaces || allWorkspaces.length === 0) {
      throw new Error('No workspaces registered. Use "claude-sync add <path>" to add workspaces.');
    }

    const validWorkspaces = [];
    const skippedWorkspaces = [];

    for (const workspace of allWorkspaces) {
      if (fs.existsSync(workspace.path)) {
        validWorkspaces.push(workspace);
      } else {
        skippedWorkspaces.push(workspace);
        console.log(chalk.yellow(`⚠ Skipping missing workspace: ${workspace.name} (${workspace.path})`));
      }
    }

    if (skippedWorkspaces.length > 0) {
      console.log(chalk.gray(`Skipped ${skippedWorkspaces.length} missing workspace(s) (not removed from config)`));
      console.log(chalk.gray(`Use "claude-sync remove <path>" to permanently remove them\n`));
    }

    if (validWorkspaces.length === 0) {
      throw new Error(
        'No valid workspaces found on disk. All registered workspaces are missing.\n' +
        'If directories were moved, update paths with "claude-sync remove" and "claude-sync add".'
      );
    }

    const watchPaths = this._buildWatchPaths(validWorkspaces);

    console.log(chalk.blue('\n📡 Starting file watcher...\n'));
    console.log(chalk.gray('Watching files:'));
    watchPaths.forEach(p => console.log(chalk.gray(`  - ${p}`)));
    console.log(chalk.gray('\nPress Ctrl+C to stop\n'));

    this.currentWorkspaces = validWorkspaces;

    this.watcher = this._createChokidarWatcher(watchPaths);

    console.log(chalk.gray('🔍 Scanning for existing skills and agents to sync...\n'));
    await this.syncExistingSkills();
    await this.syncExistingAgents();

    console.log(chalk.green('✓ Initial scan complete'));
    console.log(chalk.gray('Watching for changes...\n'));

    this._attachEventHandlers();

    this.setupConfigWatcher();
  }

  setupConfigWatcher() {
    const configPath = config.getConfigPath();

    console.log(chalk.gray(`Watching config: ${configPath}\n`));

    this.configWatcher = chokidar.watch(configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    this.configWatcher.on('change', async () => {
      console.log(chalk.yellow('\n⚡ Config file changed, reloading workspaces...'));
      await this.reload();
    });

    this.configWatcher.on('error', (error) => {
      console.error(chalk.red(`Config watcher error: ${error.message}`));
    });
  }

  async reload() {
    try {
      config.reload();
      const newWorkspaces = config.listWorkspaces();

      const validNewWorkspaces = newWorkspaces.filter(w => {
        if (fs.existsSync(w.path)) return true;
        console.log(chalk.yellow(`⚠ Skipping missing workspace: ${w.name} (${w.path})`));
        return false;
      });

      if (validNewWorkspaces.length === 0) {
        console.log(chalk.yellow('No valid workspaces available, keeping current watchers'));
        return;
      }

      const oldPaths = this.currentWorkspaces.map(w => w.path).sort();
      const newPaths = validNewWorkspaces.map(w => w.path).sort();

      if (JSON.stringify(oldPaths) === JSON.stringify(newPaths)) {
        console.log(chalk.gray('No workspace changes detected, continuing...'));
        return;
      }

      console.log(chalk.blue(`\nWorkspaces changed: ${oldPaths.length} → ${newPaths.length}`));

      if (this.watcher) {
        await this.watcher.close();
        console.log(chalk.gray('Closed old watchers'));
      }

      const watchPaths = this._buildWatchPaths(validNewWorkspaces);

      console.log(chalk.blue('\n📡 Reloading file watchers...\n'));
      console.log(chalk.gray('Now watching:'));
      watchPaths.forEach(p => console.log(chalk.gray(`  - ${p}`)));
      console.log();

      this.currentWorkspaces = validNewWorkspaces;

      this.watcher = this._createChokidarWatcher(watchPaths);

      this._attachEventHandlers();

      console.log(chalk.green('✓ Watchers reloaded successfully\n'));
      console.log(chalk.gray('Watching for changes...\n'));

    } catch (error) {
      console.error(chalk.red(`Failed to reload watchers: ${error.message}`));
    }
  }

  async stop() {
    console.log(chalk.yellow('\n\n  Stopping watcher...'));

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.configWatcher) {
      await this.configWatcher.close();
      this.configWatcher = null;
    }

    this.isWatching = false;
    console.log(chalk.green('  Watcher stopped\n'));
  }

  _buildWatchPaths(workspaces) {
    const syncRules = config.get('syncRules');
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');
    const watchPaths = [];

    for (const workspace of workspaces) {
      watchPaths.push(path.join(workspace.path, syncRules.globalFile));
      watchPaths.push(path.join(workspace.path, syncRules.projectFile));
      watchPaths.push(path.join(workspace.path, '.claude', 'skills', '**', '[Ss][Kk][Ii][Ll][Ll].md'));
      watchPaths.push(path.join(workspace.path, '.claude', 'agents', '**', '*.md'));
    }

    watchPaths.push(path.join(globalSkillsPath, '**', '[Ss][Kk][Ii][Ll][Ll].md'));
    watchPaths.push(path.join(globalAgentsPath, '**', '*.md'));

    return watchPaths;
  }

  _createChokidarWatcher(watchPaths) {
    return chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      ignorePermissionErrors: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });
  }

  _attachEventHandlers() {
    const syncRules = config.get('syncRules');

    this.watcher.on('change', async (filePath) => {
      if (this.processingFiles.has(filePath)) {
        console.log(chalk.gray(`⏭️  Skipping ${path.basename(filePath)} (already processing)`));
        return;
      }

      if (this.debounceTimers.has(filePath)) {
        clearTimeout(this.debounceTimers.get(filePath));
      }

      const timer = setTimeout(async () => {
        this.debounceTimers.delete(filePath);

        console.log(chalk.yellow(`\n⚡ Change detected: ${path.basename(filePath)}`));

        this.processingFiles.add(filePath);

        try {
          const workspacePath = this._findWorkspaceForFile(filePath);
          const fileName = path.basename(filePath);
          const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
          const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

        if (fileName.toLowerCase() === 'skill.md') {
          const isGlobalSkill = pathStartsWith(filePath, globalSkillsPath);

          if (isGlobalSkill) {
            console.log(chalk.blue('🔄 Syncing global skill...'));

            const gitResult = await syncer.syncSkillToGitHub(filePath);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed skill to GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.blue('ℹ️  Project-specific skill detected (not synced to GitHub)'));
          }

        } else if (fileName.endsWith('.md') && filePath.includes(path.join('.claude', 'agents'))) {
          const isGlobalAgent = pathStartsWith(filePath, globalAgentsPath);

          if (isGlobalAgent) {
            console.log(chalk.blue('🔄 Syncing global agent...'));

            const gitResult = await syncer.syncAgentToGitHub(filePath);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed agent to GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.blue('ℹ️  Project-specific agent detected (not synced to GitHub)'));
          }

        } else if (fileName === syncRules.globalFile) {
          console.log(chalk.blue('🔄 Syncing CLAUDE-GLOBAL.md...'));

          const result = await syncer.syncWorkspace(workspacePath);

          if (result.success) {
            console.log(chalk.green('✓ Local CLAUDE.md regenerated'));

            const globalFile = path.join(workspacePath, syncRules.globalFile);
            console.log(chalk.blue('📤 Pushing to GitHub...'));

            const gitResult = await syncer.syncGlobalToGitHub(globalFile);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed to GitHub'));

              console.log(chalk.blue('🔄 Propagating to other workspaces...'));
              const propagateResults = await syncer.propagateGlobalToWorkspaces(workspacePath);

              const successCount = propagateResults.filter(r => r.success).length;
              if (successCount > 0) {
                console.log(chalk.green(`✓ Propagated to ${successCount} workspace(s)`));
              }
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.red(`✗ Sync failed: ${result.message}`));
          }

        } else if (fileName === syncRules.projectFile) {
          console.log(chalk.blue('🔄 Syncing CLAUDE-PROJECT.md (local only)...'));

          const result = await syncer.syncWorkspace(workspacePath);

          if (result.success) {
            console.log(chalk.green('✓ Local CLAUDE.md regenerated'));
            console.log(chalk.gray('  (Project-specific rules are not pushed to GitHub)'));
          } else {
            console.log(chalk.red(`✗ Sync failed: ${result.message}`));
          }
        }
      } catch (error) {
        console.log(chalk.red(`✗ Error: ${error.message}`));
      } finally {
        this.processingFiles.delete(filePath);
      }

      console.log(chalk.gray('\nWatching for changes...\n'));
      }, 500);

      this.debounceTimers.set(filePath, timer);
    });

    this.watcher.on('add', async (filePath) => {
      console.log(chalk.yellow(`\n⚡ New file detected: ${path.basename(filePath)}`));

      try {
        const fileName = path.basename(filePath);
        const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
        const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

        if (fileName.toLowerCase() === 'skill.md') {
          const isGlobalSkill = pathStartsWith(filePath, globalSkillsPath);

          if (isGlobalSkill) {
            console.log(chalk.blue('🔄 Syncing new global skill...'));

            const gitResult = await syncer.syncSkillToGitHub(filePath);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed new skill to GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.blue('ℹ️  Project-specific skill detected (not synced to GitHub)'));
          }
        } else if (fileName.endsWith('.md') && filePath.includes(path.join('.claude', 'agents'))) {
          const isGlobalAgent = pathStartsWith(filePath, globalAgentsPath);

          if (isGlobalAgent) {
            console.log(chalk.blue('🔄 Syncing new global agent...'));

            const gitResult = await syncer.syncAgentToGitHub(filePath);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed new agent to GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.blue('ℹ️  Project-specific agent detected (not synced to GitHub)'));
          }
        }
      } catch (error) {
        console.log(chalk.red(`✗ Error: ${error.message}`));
      }

      console.log(chalk.gray('\nWatching for changes...\n'));
    });

    this.watcher.on('unlink', async (filePath) => {
      console.log(chalk.yellow(`\n⚡ File deleted: ${path.basename(filePath)}`));

      try {
        const fileName = path.basename(filePath);
        const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
        const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

        if (fileName.toLowerCase() === 'skill.md') {
          const isGlobalSkill = pathStartsWith(filePath, globalSkillsPath);

          if (isGlobalSkill) {
            console.log(chalk.blue('🔄 Removing global skill from GitHub...'));

            const gitResult = await syncer.removeSkillFromGitHub(filePath);

            if (gitResult.removed) {
              console.log(chalk.green('✓ Successfully removed skill from GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.blue('ℹ️  Project-specific skill deleted (not synced to GitHub)'));
          }
        } else if (fileName.endsWith('.md') && filePath.includes(path.join('.claude', 'agents'))) {
          const isGlobalAgent = pathStartsWith(filePath, globalAgentsPath);

          if (isGlobalAgent) {
            console.log(chalk.blue('🔄 Removing global agent from GitHub...'));

            const gitResult = await syncer.removeAgentFromGitHub(filePath);

            if (gitResult.removed) {
              console.log(chalk.green('✓ Successfully removed agent from GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.blue('ℹ️  Project-specific agent deleted (not synced to GitHub)'));
          }
        }
      } catch (error) {
        console.log(chalk.red(`✗ Error: ${error.message}`));
      }

      console.log(chalk.gray('\nWatching for changes...\n'));
    });

    this.watcher.on('error', (error) => {
      console.error(chalk.red(`Watcher error: ${error.message}`));
    });
  }

  _findWorkspaceForFile(filePath) {
    const normalizedFile = path.resolve(filePath);

    for (const workspace of this.currentWorkspaces) {
      if (pathStartsWith(normalizedFile, workspace.path)) {
        return path.resolve(workspace.path);
      }
    }

    return path.dirname(filePath);
  }

  async syncExistingSkills() {
    try {
      const result = await syncer.syncAllGlobalSkills();

      if (result.synced > 0) {
        console.log(chalk.green(`✓ Synced ${result.synced} existing skill(s) to GitHub`));
      }

      if (result.failed > 0) {
        console.log(chalk.red(`✗ Failed to sync ${result.failed} skill(s)`));
      }

      if (result.details && result.details.length > 0) {
        const skipped = result.details.filter(d => d.status === 'skipped');
        if (skipped.length > 0) {
          console.log(chalk.gray(`○ Skipped ${skipped.length} skill(s) (already synced or empty)`));
        }
      }

      console.log();
    } catch (error) {
      console.log(chalk.yellow(`⚠ Warning: Could not sync existing skills: ${error.message}\n`));
    }
  }

  async syncExistingAgents() {
    try {
      const result = await syncer.syncAllGlobalAgents();

      if (result.synced > 0) {
        console.log(chalk.green(`✓ Synced ${result.synced} existing agent(s) to GitHub`));
      }

      if (result.failed > 0) {
        console.log(chalk.red(`✗ Failed to sync ${result.failed} agent(s)`));
      }

      if (result.details && result.details.length > 0) {
        const skipped = result.details.filter(d => d.status === 'skipped');
        if (skipped.length > 0) {
          console.log(chalk.gray(`○ Skipped ${skipped.length} agent(s) (already synced or empty)`));
        }
      }

      console.log();
    } catch (error) {
      console.log(chalk.yellow(`⚠ Warning: Could not sync existing agents: ${error.message}\n`));
    }
  }

  getStatus() {
    return {
      isWatching: this.isWatching,
      workspaces: config.listWorkspaces().length,
    };
  }
}

module.exports = new Watcher();
