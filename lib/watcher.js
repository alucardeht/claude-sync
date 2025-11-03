const chokidar = require('chokidar');
const path = require('path');
const config = require('./config');
const syncer = require('./syncer');
const chalk = require('chalk');

class Watcher {
  constructor() {
    this.watcher = null;
    this.configWatcher = null;
    this.isWatching = false;
    this.currentWorkspaces = [];
  }

  async start() {
    if (this.isWatching) {
      throw new Error('Watcher is already running');
    }

    await this.setupWatchers();
    this.isWatching = true;

    return new Promise((resolve) => {
      process.on('SIGINT', () => {
        this.stop();
        resolve();
      });

      process.on('SIGTERM', () => {
        this.stop();
        resolve();
      });
    });
  }

  async setupWatchers() {
    const workspaces = config.listWorkspaces();

    if (!workspaces || workspaces.length === 0) {
      throw new Error('No workspaces registered. Use "claude-sync add <path>" to add workspaces.');
    }

    const syncRules = config.get('syncRules');
    const watchPaths = [];
    const os = require('os');
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

    for (const workspace of workspaces) {
      watchPaths.push(path.join(workspace.path, syncRules.globalFile));
      watchPaths.push(path.join(workspace.path, syncRules.projectFile));
      watchPaths.push(path.join(workspace.path, '.claude', 'skills', '**', '[Ss][Kk][Ii][Ll][Ll].md'));
      watchPaths.push(path.join(workspace.path, '.claude', 'agents', '**', '*.md'));
    }

    watchPaths.push(path.join(globalSkillsPath, '**', '[Ss][Kk][Ii][Ll][Ll].md'));
    watchPaths.push(path.join(globalAgentsPath, '**', '*.md'));

    console.log(chalk.blue('\n📡 Starting file watcher...\n'));
    console.log(chalk.gray('Watching files:'));
    watchPaths.forEach(p => console.log(chalk.gray(`  - ${p}`)));
    console.log(chalk.gray('\nPress Ctrl+C to stop\n'));

    this.currentWorkspaces = workspaces;

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    console.log(chalk.gray('🔍 Scanning for existing skills and agents to sync...\n'));
    this.syncExistingSkills();
    this.syncExistingAgents();

    this.watcher.on('change', async (filePath) => {
      console.log(chalk.yellow(`\n⚡ Change detected: ${path.basename(filePath)}`));

      try {
        const workspacePath = path.dirname(filePath);
        const fileName = path.basename(filePath);
        const os = require('os');
        const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
        const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

        if (fileName.toLowerCase() === 'skill.md') {
          const isGlobalSkill = filePath.startsWith(globalSkillsPath);

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
          const isGlobalAgent = filePath.startsWith(globalAgentsPath);

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
          // CLAUDE-GLOBAL.md changed - sync to all workspaces and GitHub
          console.log(chalk.blue('🔄 Syncing CLAUDE-GLOBAL.md...'));

          // 1. Regenerate local CLAUDE.md
          const result = await syncer.syncWorkspace(workspacePath);

          if (result.success) {
            console.log(chalk.green('✓ Local CLAUDE.md regenerated'));

            // 2. Push CLAUDE-GLOBAL.md to GitHub as CLAUDE.md
            const globalFile = path.join(workspacePath, syncRules.globalFile);
            console.log(chalk.blue('📤 Pushing to GitHub...'));

            const gitResult = await syncer.syncGlobalToGitHub(globalFile);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed to GitHub'));

              // 3. Propagate to other workspaces
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
          // CLAUDE-PROJECT.md changed - only regenerate local CLAUDE.md
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
      }

      console.log(chalk.gray('\nWatching for changes...\n'));
    });

    this.watcher.on('add', async (filePath) => {
      console.log(chalk.yellow(`\n⚡ New file detected: ${path.basename(filePath)}`));

      try {
        const fileName = path.basename(filePath);
        const os = require('os');
        const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
        const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

        if (fileName.toLowerCase() === 'skill.md') {
          const isGlobalSkill = filePath.startsWith(globalSkillsPath);

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
          const isGlobalAgent = filePath.startsWith(globalAgentsPath);

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

    this.watcher.on('error', (error) => {
      console.error(chalk.red(`Watcher error: ${error.message}`));
    });

    // Watch config file for changes (new workspaces added)
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
      // Force reload config from disk
      config.config = null;
      const newWorkspaces = config.listWorkspaces();

      // Check if workspaces actually changed
      const oldPaths = this.currentWorkspaces.map(w => w.path).sort();
      const newPaths = newWorkspaces.map(w => w.path).sort();

      if (JSON.stringify(oldPaths) === JSON.stringify(newPaths)) {
        console.log(chalk.gray('No workspace changes detected, continuing...'));
        return;
      }

      console.log(chalk.blue(`\nWorkspaces changed: ${oldPaths.length} → ${newPaths.length}`));

      // Close old watcher
      if (this.watcher) {
        await this.watcher.close();
        console.log(chalk.gray('Closed old watchers'));
      }

      // Setup new watchers with updated workspace list
      const syncRules = config.get('syncRules');
      const watchPaths = [];
      const os = require('os');
      const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
      const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

      for (const workspace of newWorkspaces) {
        watchPaths.push(path.join(workspace.path, syncRules.globalFile));
        watchPaths.push(path.join(workspace.path, syncRules.projectFile));
        watchPaths.push(path.join(workspace.path, '.claude', 'skills', '**', '[Ss][Kk][Ii][Ll][Ll].md'));
        watchPaths.push(path.join(workspace.path, '.claude', 'agents', '**', '*.md'));
      }

      watchPaths.push(path.join(globalSkillsPath, '**', '[Ss][Kk][Ii][Ll][Ll].md'));
      watchPaths.push(path.join(globalAgentsPath, '**', '*.md'));

      console.log(chalk.blue('\n📡 Reloading file watchers...\n'));
      console.log(chalk.gray('Now watching:'));
      watchPaths.forEach(p => console.log(chalk.gray(`  - ${p}`)));
      console.log();

      this.currentWorkspaces = newWorkspaces;

      this.watcher = chokidar.watch(watchPaths, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100,
        },
      });

      // Re-attach event handlers
      this.watcher.on('change', async (filePath) => {
        console.log(chalk.yellow(`\n⚡ Change detected: ${path.basename(filePath)}`));

        try {
          const workspacePath = path.dirname(filePath);
          const fileName = path.basename(filePath);
          const os = require('os');
          const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
          const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

          if (fileName.toLowerCase() === 'skill.md') {
            const isGlobalSkill = filePath.startsWith(globalSkillsPath);

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
            const isGlobalAgent = filePath.startsWith(globalAgentsPath);

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
            // CLAUDE-GLOBAL.md changed - sync to all workspaces and GitHub
            console.log(chalk.blue('🔄 Syncing CLAUDE-GLOBAL.md...'));

            // 1. Regenerate local CLAUDE.md
            const result = await syncer.syncWorkspace(workspacePath);

            if (result.success) {
              console.log(chalk.green('✓ Local CLAUDE.md regenerated'));

              // 2. Push CLAUDE-GLOBAL.md to GitHub as CLAUDE.md
              const globalFile = path.join(workspacePath, syncRules.globalFile);
              console.log(chalk.blue('📤 Pushing to GitHub...'));

              const gitResult = await syncer.syncGlobalToGitHub(globalFile);

              if (gitResult.pushed) {
                console.log(chalk.green('✓ Successfully pushed to GitHub'));

                // 3. Propagate to other workspaces
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
            // CLAUDE-PROJECT.md changed - only regenerate local CLAUDE.md
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
        }

        console.log(chalk.gray('\nWatching for changes...\n'));
      });

      this.watcher.on('add', async (filePath) => {
        console.log(chalk.yellow(`\n⚡ New file detected: ${path.basename(filePath)}`));

        try {
          const fileName = path.basename(filePath);
          const os = require('os');
          const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
          const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

          if (fileName.toLowerCase() === 'skill.md') {
            const isGlobalSkill = filePath.startsWith(globalSkillsPath);

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
            const isGlobalAgent = filePath.startsWith(globalAgentsPath);

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

      this.watcher.on('error', (error) => {
        console.error(chalk.red(`Watcher error: ${error.message}`));
      });

      console.log(chalk.green('✓ Watchers reloaded successfully\n'));
      console.log(chalk.gray('Watching for changes...\n'));

    } catch (error) {
      console.error(chalk.red(`Failed to reload watchers: ${error.message}`));
    }
  }

  stop() {
    console.log(chalk.yellow('\n\n👋 Stopping watcher...'));

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = null;
    }

    this.isWatching = false;
    console.log(chalk.green('✓ Watcher stopped\n'));
    process.exit(0);
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
