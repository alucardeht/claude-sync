#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const setup = require('../lib/setup');
const config = require('../lib/config');
const syncer = require('../lib/syncer');
const watcher = require('../lib/watcher');
const updater = require('../lib/updater');
const { printError } = require('../lib/errors');
const packageJson = require('../package.json');

const program = new Command();

async function checkAndNotifyUpdate() {
  if (!updater.shouldCheckForUpdates(packageJson.version)) {
    return;
  }

  try {
    const updateInfo = await updater.checkForUpdates(packageJson.version);
    if (updateInfo.updateAvailable) {
      updater.displayUpdateNotification(updateInfo);
      updater.updateNotifiedVersion(updateInfo.latestVersion);
    }
  } catch (error) {
    // Silently ignore errors
  }
}

program
  .name('claude-sync')
  .description('Cross-platform CLI tool for automatic synchronization of CLAUDE.md files')
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize claude-sync with interactive setup wizard')
  .action(async () => {
    try {
      await setup.run();
    } catch (error) {
      printError(error, 'Setup failed');
      process.exit(1);
    }
  });

program
  .command('add <workspace>')
  .description('Add a workspace to the sync list')
  .action(async (workspace) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const fs = require('fs');
      const path = require('path');
      const git = require('../lib/git');
      const resolvedPath = path.resolve(workspace);
      const globalPath = path.join(resolvedPath, 'CLAUDE-GLOBAL.md');
      const projectPath = path.join(resolvedPath, 'CLAUDE-PROJECT.md');
      const globalTemplate = path.join(__dirname, '..', 'templates', 'CLAUDE-GLOBAL.template.md');
      const projectTemplate = path.join(__dirname, '..', 'templates', 'CLAUDE-PROJECT.template.md');

      const spinner = ora('Adding workspace...').start();

      const added = config.addWorkspace(workspace);

      spinner.text = 'Setting up workspace files...';

      const actions = [];

      // Check if GitHub has CLAUDE.md
      const repoPath = git.getRepoPath();
      const githubClaudeFile = path.join(repoPath, 'CLAUDE.md');
      const hasGithubClaude = fs.existsSync(githubClaudeFile);

      // Handle CLAUDE-GLOBAL.md
      if (!fs.existsSync(globalPath)) {
        if (hasGithubClaude) {
          // Download from GitHub
          fs.copyFileSync(githubClaudeFile, globalPath);
          actions.push('Downloaded CLAUDE-GLOBAL.md from GitHub');
        } else {
          // Create from template
          fs.copyFileSync(globalTemplate, globalPath);
          actions.push('Created CLAUDE-GLOBAL.md from template');
        }
      } else {
        actions.push('CLAUDE-GLOBAL.md already exists');
      }

      // Handle CLAUDE-PROJECT.md
      if (!fs.existsSync(projectPath)) {
        // Always create from template if doesn't exist
        fs.copyFileSync(projectTemplate, projectPath);
        actions.push('Created CLAUDE-PROJECT.md from template');
      } else {
        actions.push('CLAUDE-PROJECT.md already exists');
      }

      // Download skills from GitHub
      spinner.text = 'Downloading global skills...';
      const skillsResult = await syncer.propagateSkillsFromGitHub();
      if (skillsResult.success) {
        actions.push('Downloaded global skills from GitHub');
      }

      // Download agents from GitHub
      spinner.text = 'Downloading global agents...';
      const agentsResult = await syncer.propagateAgentsFromGitHub();
      if (agentsResult.success) {
        actions.push('Downloaded global agents from GitHub');
      }

      // Generate merged CLAUDE.md
      spinner.text = 'Generating merged CLAUDE.md...';
      await syncer.syncWorkspace(resolvedPath);
      actions.push('Generated merged CLAUDE.md');

      spinner.succeed(`Workspace added: ${added}`);

      console.log(chalk.blue('\n✓ Workspace ready\n'));
      actions.forEach(action => {
        console.log(chalk.gray(`  • ${action}`));
      });

      console.log(chalk.gray('\n💡 Tips:'));
      console.log(chalk.gray('  • Edit CLAUDE-GLOBAL.md for rules shared across ALL projects'));
      console.log(chalk.gray('  • Edit CLAUDE-PROJECT.md for project-specific rules'));
      console.log(chalk.gray('  • Changes are auto-synced if daemon is running (claude-sync start)\n'));
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  });

program
  .command('remove <workspace>')
  .description('Remove a workspace from the sync list')
  .option('--clean', 'Also remove auto-generated CLAUDE.md from the workspace')
  .option('--dry-run', 'Preview what would be removed without making changes')
  .action(async (workspace, options) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const fs = require('fs');
      const path = require('path');
      const resolvedPath = path.resolve(workspace);
      const syncRules = config.get('syncRules');
      const targetFile = path.join(resolvedPath, syncRules.targetFile);

      if (options.dryRun) {
        console.log(
          boxen(chalk.bold.yellow('Dry Run - Remove Preview'), {
            padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow',
          })
        );

        console.log(chalk.blue('Would remove from config:'));
        console.log(chalk.gray(`  ${resolvedPath}\n`));

        if (fs.existsSync(targetFile)) {
          if (options.clean) {
            console.log(chalk.blue('Would delete:'));
            console.log(chalk.gray(`  ${targetFile}`));
          } else {
            console.log(chalk.yellow('Leftover file (use --clean to remove):'));
            console.log(chalk.gray(`  ${targetFile}`));
          }
        }

        console.log(chalk.yellow('\nNo changes were made (dry run).\n'));
        return;
      }

      const spinner = ora('Removing workspace...').start();

      const removed = config.removeWorkspace(workspace);

      spinner.succeed(`Workspace removed: ${removed}`);

      // Handle generated CLAUDE.md cleanup
      if (fs.existsSync(targetFile)) {
        if (options.clean) {
          fs.unlinkSync(targetFile);
          console.log(chalk.green(`  Removed generated ${syncRules.targetFile}`));
        } else {
          console.log(chalk.yellow(`\n  Note: ${syncRules.targetFile} still exists in ${resolvedPath}`));
          console.log(chalk.gray('  This auto-generated file will not be updated anymore.'));
          console.log(chalk.gray('  You can delete it manually or re-run with --clean'));
        }
      }

      // Inform about files we do NOT touch
      const globalFile = path.join(resolvedPath, syncRules.globalFile);
      const projectFile = path.join(resolvedPath, syncRules.projectFile);
      const preserved = [];

      if (fs.existsSync(globalFile)) preserved.push(syncRules.globalFile);
      if (fs.existsSync(projectFile)) preserved.push(syncRules.projectFile);

      if (preserved.length > 0) {
        console.log(chalk.gray(`  Preserved (your content): ${preserved.join(', ')}`));
      }

    } catch (error) {
      printError(error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all registered workspaces with health status')
  .action(() => {
    try {
      if (!config.exists()) {
        printError(new Error('Configuration not found'));
        process.exit(1);
      }

      const fs = require('fs');
      const path = require('path');
      const workspaces = config.listWorkspaces();

      if (!workspaces || workspaces.length === 0) {
        console.log(chalk.yellow('\nNo workspaces registered\n'));
        console.log(chalk.gray('Use "claude-sync add <path>" to add workspaces\n'));
        return;
      }

      const syncRules = config.get('syncRules');

      console.log(
        boxen(chalk.bold.blue(`Registered Workspaces (${workspaces.length})`), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      workspaces.forEach((workspace, index) => {
        const dirExists = fs.existsSync(workspace.path);

        if (!dirExists) {
          console.log(chalk.red(`${index + 1}. ${workspace.name}  [MISSING]`));
          console.log(chalk.gray(`   ${workspace.path}`));
          console.log(chalk.red('   Directory does not exist. Use "claude-sync remove" to clean up.'));
          console.log();
          return;
        }

        const globalFile = path.join(workspace.path, syncRules.globalFile);
        const projectFile = path.join(workspace.path, syncRules.projectFile);
        const targetFile = path.join(workspace.path, syncRules.targetFile);

        const hasGlobal = fs.existsSync(globalFile);
        const hasProject = fs.existsSync(projectFile);
        const hasTarget = fs.existsSync(targetFile);

        let isStale = false;
        if (hasTarget) {
          const targetMtime = fs.statSync(targetFile).mtimeMs;
          if (hasGlobal && fs.statSync(globalFile).mtimeMs > targetMtime) isStale = true;
          if (hasProject && fs.statSync(projectFile).mtimeMs > targetMtime) isStale = true;
        }

        const indicators = [];
        indicators.push(hasGlobal ? chalk.green('GLOBAL') : chalk.red('GLOBAL'));
        indicators.push(hasProject ? chalk.green('PROJECT') : chalk.yellow('PROJECT'));

        if (hasTarget) {
          indicators.push(isStale ? chalk.yellow('CLAUDE.md (stale)') : chalk.green('CLAUDE.md'));
        } else {
          indicators.push(chalk.red('CLAUDE.md'));
        }

        console.log(chalk.blue(`${index + 1}. ${workspace.name}`));
        console.log(chalk.gray(`   ${workspace.path}`));
        console.log(`   Files: ${indicators.join(' | ')}`);
        console.log(chalk.gray(`   Added: ${new Date(workspace.addedAt).toLocaleString()}`));

        if (isStale) {
          console.log(chalk.yellow('   Run "claude-sync sync" to regenerate CLAUDE.md'));
        }

        if (!hasGlobal && !hasProject) {
          console.log(chalk.red('   No source files found. Run "claude-sync add" again or create files manually.'));
        }

        console.log();
      });

      const validCount = workspaces.filter(w => fs.existsSync(w.path)).length;
      const missingCount = workspaces.length - validCount;

      if (missingCount > 0) {
        console.log(chalk.yellow(`${missingCount} workspace(s) have missing directories.\n`));
      }
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Manually sync all workspaces and push to GitHub')
  .option('--dry-run', 'Preview what would be synced without making changes')
  .action(async (options) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      if (options.dryRun) {
        const spinner = ora('Analyzing sync...').start();
        const result = await syncer.dryRunSyncAll();
        spinner.stop();

        console.log(
          boxen(chalk.bold.yellow('Dry Run - Sync Preview'), {
            padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow',
          })
        );

        if (result.actions.length === 0) {
          console.log(chalk.gray('No actions to perform'));
        } else {
          result.actions.forEach((action) => {
            const icon = action.action === 'skip' ? chalk.gray('--') : action.action === 'push' ? chalk.blue('>>') : chalk.green('~~');
            const color = action.action === 'skip' ? chalk.gray : action.action === 'push' ? chalk.blue : chalk.green;
            console.log(color(`${icon} ${action.workspace}`));
            console.log(chalk.gray(`   ${action.reason}`));
          });
        }

        console.log(chalk.yellow('\nNo changes were made (dry run).\n'));
        return;
      }

      const spinner = ora('Syncing workspaces...').start();

      const results = await syncer.syncAll();

      spinner.stop();

      console.log(
        boxen(chalk.bold.blue('Sync Results'), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      results.forEach((result) => {
        if (result.success !== false && result.pushed !== false) {
          console.log(chalk.green(`✓ ${result.workspace}`));
          if (result.message) {
            console.log(chalk.gray(`  ${result.message}`));
          }
        } else {
          console.log(chalk.red(`✗ ${result.workspace}`));
          console.log(chalk.gray(`  ${result.error || result.message}`));
        }
      });

      console.log();
      console.log(chalk.gray('Tip: Use "claude-sync sync-all" to also sync skills and agents\n'));
    } catch (error) {
      printError(error, 'Sync failed');
      process.exit(1);
    }
  });

program
  .command('sync-skills')
  .description('Manually sync all global skills to GitHub')
  .option('--dry-run', 'Preview what would be synced without making changes')
  .action(async (options) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      if (options.dryRun) {
        const spinner = ora('Analyzing sync...').start();
        const result = await syncer.dryRunSyncSkills();
        spinner.stop();

        console.log(
          boxen(chalk.bold.yellow('Dry Run - Skills Sync Preview'), {
            padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow',
          })
        );

        if (result.actions.length === 0) {
          console.log(chalk.gray('No skills found'));
        } else {
          result.actions.forEach((action) => {
            const icon = action.action === 'skip' ? chalk.gray('--') : chalk.blue('>>');
            const color = action.action === 'skip' ? chalk.gray : chalk.blue;
            console.log(color(`${icon} ${action.skill}`));
            console.log(chalk.gray(`   ${action.reason}`));
          });
        }

        console.log(chalk.yellow('\nNo changes were made (dry run).\n'));
        return;
      }

      const spinner = ora('Syncing global skills...').start();

      const result = await syncer.syncAllGlobalSkills();

      spinner.stop();

      console.log(
        boxen(chalk.bold.blue('Skills Sync Results'), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      if (result.details && result.details.length > 0) {
        result.details.forEach((detail) => {
          const icon = detail.status === 'synced' ? '✓' : detail.status === 'failed' ? '✗' : '○';
          const color = detail.status === 'synced' ? chalk.green : detail.status === 'failed' ? chalk.red : chalk.yellow;

          console.log(color(`${icon} ${detail.skill}`));
          console.log(chalk.gray(`  ${detail.message}`));
        });
      }

      console.log();
      console.log(chalk.bold(`Summary: ${chalk.green(result.synced)} synced, ${chalk.red(result.failed)} failed`));
      console.log();
    } catch (error) {
      printError(error, 'Skills sync failed');
      process.exit(1);
    }
  });

program
  .command('sync-agents')
  .description('Manually sync all global agents to GitHub')
  .option('--dry-run', 'Preview what would be synced without making changes')
  .action(async (options) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      if (options.dryRun) {
        const spinner = ora('Analyzing sync...').start();
        const result = await syncer.dryRunSyncAgents();
        spinner.stop();

        console.log(
          boxen(chalk.bold.yellow('Dry Run - Agents Sync Preview'), {
            padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow',
          })
        );

        if (result.actions.length === 0) {
          console.log(chalk.gray('No agents found'));
        } else {
          result.actions.forEach((action) => {
            const icon = action.action === 'skip' ? chalk.gray('--') : chalk.blue('>>');
            const color = action.action === 'skip' ? chalk.gray : chalk.blue;
            console.log(color(`${icon} ${action.agent}`));
            console.log(chalk.gray(`   ${action.reason}`));
          });
        }

        console.log(chalk.yellow('\nNo changes were made (dry run).\n'));
        return;
      }

      const spinner = ora('Syncing global agents...').start();

      const result = await syncer.syncAllGlobalAgents();

      spinner.stop();

      console.log(
        boxen(chalk.bold.blue('Agents Sync Results'), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      if (result.details && result.details.length > 0) {
        result.details.forEach((detail) => {
          const icon = detail.status === 'synced' ? '✓' : detail.status === 'failed' ? '✗' : '○';
          const color = detail.status === 'synced' ? chalk.green : detail.status === 'failed' ? chalk.red : chalk.yellow;

          console.log(color(`${icon} ${detail.agent}`));
          console.log(chalk.gray(`  ${detail.message}`));
        });
      }

      console.log();
      console.log(chalk.bold(`Summary: ${chalk.green(result.synced)} synced, ${chalk.red(result.failed)} failed`));
      console.log();
    } catch (error) {
      printError(error, 'Agents sync failed');
      process.exit(1);
    }
  });

program
  .command('sync-all')
  .description('Sync everything: rules, skills, and agents to GitHub')
  .option('--dry-run', 'Preview what would be synced without making changes')
  .action(async (options) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      if (options.dryRun) {
        const spinner = ora('Analyzing sync...').start();
        const rulesResult = await syncer.dryRunSyncAll();
        const skillsResult = await syncer.dryRunSyncSkills();
        const agentsResult = await syncer.dryRunSyncAgents();
        spinner.stop();

        console.log(
          boxen(chalk.bold.yellow('Dry Run - Sync All Preview'), {
            padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow',
          })
        );

        console.log(chalk.blue.bold('Rules:'));
        if (rulesResult.actions.length === 0) {
          console.log(chalk.gray('  No actions'));
        } else {
          rulesResult.actions.forEach(a => {
            const icon = a.action === 'skip' ? '--' : a.action === 'push' ? '>>' : '~~';
            const color = a.action === 'skip' ? chalk.gray : a.action === 'push' ? chalk.blue : chalk.green;
            console.log(color(`  ${icon} ${a.workspace}`));
            console.log(chalk.gray(`     ${a.reason}`));
          });
        }

        console.log(chalk.blue.bold('\nSkills:'));
        if (skillsResult.actions.length === 0) {
          console.log(chalk.gray('  No skills found'));
        } else {
          skillsResult.actions.forEach(a => {
            const icon = a.action === 'skip' ? '--' : '>>';
            const color = a.action === 'skip' ? chalk.gray : chalk.blue;
            console.log(color(`  ${icon} ${a.skill}`));
            console.log(chalk.gray(`     ${a.reason}`));
          });
        }

        console.log(chalk.blue.bold('\nAgents:'));
        if (agentsResult.actions.length === 0) {
          console.log(chalk.gray('  No agents found'));
        } else {
          agentsResult.actions.forEach(a => {
            const icon = a.action === 'skip' ? '--' : '>>';
            const color = a.action === 'skip' ? chalk.gray : chalk.blue;
            console.log(color(`  ${icon} ${a.agent}`));
            console.log(chalk.gray(`     ${a.reason}`));
          });
        }

        console.log(chalk.yellow('\nNo changes were made (dry run).\n'));
        return;
      }

      const spinner = ora('Syncing everything...').start();

      // 1. Sync rules (workspaces + push global to GitHub)
      spinner.text = 'Syncing workspace rules...';
      let rulesResults = [];
      try {
        rulesResults = await syncer.syncAll();
      } catch (error) {
        rulesResults = [{ workspace: 'Rules', success: false, error: error.message }];
      }

      // 2. Sync skills
      spinner.text = 'Syncing global skills...';
      let skillsResult = { synced: 0, failed: 0, details: [] };
      try {
        skillsResult = await syncer.syncAllGlobalSkills();
      } catch (error) {
        skillsResult = { synced: 0, failed: 1, details: [{ skill: 'all', status: 'failed', message: error.message }] };
      }

      // 3. Sync agents
      spinner.text = 'Syncing global agents...';
      let agentsResult = { synced: 0, failed: 0, details: [] };
      try {
        agentsResult = await syncer.syncAllGlobalAgents();
      } catch (error) {
        agentsResult = { synced: 0, failed: 1, details: [{ agent: 'all', status: 'failed', message: error.message }] };
      }

      spinner.stop();

      console.log(
        boxen(chalk.bold.blue('Sync All Results'), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      // Rules results
      console.log(chalk.blue.bold('Rules:'));
      rulesResults.forEach((result) => {
        if (result.success !== false && result.pushed !== false) {
          console.log(chalk.green(`  ✓ ${result.workspace}`));
          if (result.message) {
            console.log(chalk.gray(`    ${result.message}`));
          }
        } else {
          console.log(chalk.red(`  ✗ ${result.workspace}`));
          console.log(chalk.gray(`    ${result.error || result.message}`));
        }
      });

      // Skills results
      console.log(chalk.blue.bold('\nSkills:'));
      if (skillsResult.details && skillsResult.details.length > 0) {
        skillsResult.details.forEach((detail) => {
          const icon = detail.status === 'synced' ? '✓' : detail.status === 'failed' ? '✗' : '○';
          const color = detail.status === 'synced' ? chalk.green : detail.status === 'failed' ? chalk.red : chalk.yellow;
          console.log(color(`  ${icon} ${detail.skill}`));
        });
      } else {
        console.log(chalk.gray('  No skills found'));
      }

      // Agents results
      console.log(chalk.blue.bold('\nAgents:'));
      if (agentsResult.details && agentsResult.details.length > 0) {
        agentsResult.details.forEach((detail) => {
          const icon = detail.status === 'synced' ? '✓' : detail.status === 'failed' ? '✗' : '○';
          const color = detail.status === 'synced' ? chalk.green : detail.status === 'failed' ? chalk.red : chalk.yellow;
          console.log(color(`  ${icon} ${detail.agent}`));
        });
      } else {
        console.log(chalk.gray('  No agents found'));
      }

      // Summary
      const rulesSuccess = rulesResults.filter(r => r.success !== false && r.pushed !== false).length;
      const rulesFailed = rulesResults.length - rulesSuccess;

      console.log(chalk.bold('\n——— Summary ———'));
      console.log(chalk.bold(`Rules:  ${chalk.green(rulesSuccess)} synced, ${chalk.red(rulesFailed)} failed`));
      console.log(chalk.bold(`Skills: ${chalk.green(skillsResult.synced)} synced, ${chalk.red(skillsResult.failed)} failed`));
      console.log(chalk.bold(`Agents: ${chalk.green(agentsResult.synced)} synced, ${chalk.red(agentsResult.failed)} failed`));
      console.log();
    } catch (error) {
      printError(error, 'Sync-all failed');
      process.exit(1);
    }
  });

program
  .command('pull')
  .description('Pull CLAUDE-GLOBAL.md, skills, and agents from GitHub and update all workspaces')
  .option('--force', 'Overwrite local files even if they are newer than remote')
  .action(async (options) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const spinner = ora('Pulling from GitHub...').start();

      // Single git pull upfront to avoid triple stash/unstash cycles
      const git = require('../lib/git');
      await git.pull();

      const results = await syncer.propagateFromGitHub({ skipPull: true });
      const skillsResult = await syncer.propagateSkillsFromGitHub({ skipPull: true, force: options.force || false });
      const agentsResult = await syncer.propagateAgentsFromGitHub({ skipPull: true, force: options.force || false });

      spinner.stop();

      console.log(
        boxen(chalk.bold.blue('Pull Results'), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      results.forEach((result) => {
        if (result.success) {
          console.log(chalk.green(`✓ ${result.workspace}`));
          if (result.message) {
            console.log(chalk.gray(`  ${result.message}`));
          }
        } else {
          console.log(chalk.red(`✗ ${result.workspace}`));
          console.log(chalk.gray(`  ${result.error}`));
        }
      });

      if (skillsResult.success) {
        console.log(chalk.green(`✓ Skills`));
        console.log(chalk.gray(`  ${skillsResult.message}`));
        if (skillsResult.skippedFiles?.length > 0) {
          console.log(chalk.yellow(`  Skipped ${skillsResult.skippedFiles.length} skill(s) (local is newer)`));
          skillsResult.skippedFiles.forEach(s => {
            console.log(chalk.gray(`    - ${s.file}: ${s.reason}`));
          });
          console.log(chalk.gray('  Use --force to overwrite local changes'));
        }
      }

      if (agentsResult.success) {
        console.log(chalk.green(`✓ Agents`));
        console.log(chalk.gray(`  ${agentsResult.message}`));
        if (agentsResult.skippedFiles?.length > 0) {
          console.log(chalk.yellow(`  Skipped ${agentsResult.skippedFiles.length} agent(s) (local is newer)`));
          agentsResult.skippedFiles.forEach(s => {
            console.log(chalk.gray(`    - ${s.file}: ${s.reason}`));
          });
          console.log(chalk.gray('  Use --force to overwrite local changes'));
        }
      }

      console.log();
    } catch (error) {
      printError(error, 'Pull failed');
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch for file changes and auto-sync (foreground)')
  .action(async () => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      await watcher.start();
    } catch (error) {
      printError(error, 'Watcher failed');
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start file watcher in background (daemon)')
  .action(async () => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const pm2 = require('pm2');
      const path = require('path');

      pm2.connect((err) => {
        if (err) {
          console.error(chalk.red(`\n✗ Failed to connect to PM2: ${err.message}\n`));
          process.exit(1);
        }

        pm2.start(
          {
            script: path.join(__dirname, '..', 'lib', 'daemon.js'),
            name: 'claude-sync',
            autorestart: true,
            max_restarts: 10,
            min_uptime: '10s',
          },
          (err) => {
            pm2.disconnect();

            if (err) {
              if (err.message && err.message.includes('already exists')) {
                console.log(chalk.yellow('\n⚠ Claude Sync is already running\n'));
                console.log(chalk.gray('Use "claude-sync stop" to stop it first\n'));
              } else {
                console.error(chalk.red(`\n✗ Failed to start: ${err.message}\n`));
              }
              process.exit(1);
            }

            console.log(chalk.green('\n✓ Claude Sync started in background\n'));

            // Windows autostart setup
            if (process.platform === 'win32') {
              const autostart = require('../lib/autostart-win');
              const result = autostart.enableAutostart();

              if (result.success) {
                if (!result.skipped) {
                  if (result.method === 'task-scheduler') {
                    console.log(chalk.green('  Autostart enabled (Task Scheduler)'));
                  } else if (result.method === 'startup-folder') {
                    console.log(chalk.green('  Autostart enabled (Startup folder)'));
                    if (result.warning) {
                      console.log(chalk.yellow(`  ${result.warning}`));
                    }
                  }
                  console.log(chalk.gray('  Claude Sync will start automatically on login\n'));
                }
              } else {
                console.log(chalk.yellow(`  Could not enable autostart: ${result.error}`));
                console.log(chalk.gray('  Run as Administrator for Task Scheduler, or check Startup folder permissions\n'));
              }
            }

            console.log(chalk.gray('Commands:'));
            console.log(chalk.gray('  claude-sync stop     Stop the daemon'));
            console.log(chalk.gray('  claude-sync restart  Restart the daemon'));
            console.log(chalk.gray('  claude-sync logs     View logs\n'));
          }
        );
      });
    } catch (error) {
      printError(error, 'Start failed');
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the background daemon')
  .action(() => {
    const pm2 = require('pm2');

    pm2.connect((err) => {
      if (err) {
        console.error(chalk.red(`\n✗ Failed to connect to PM2: ${err.message}\n`));
        process.exit(1);
      }

      pm2.stop('claude-sync', (err) => {
        if (err) {
          pm2.disconnect();
          console.error(chalk.red(`\n✗ Failed to stop: ${err.message}\n`));
          process.exit(1);
        }

        pm2.delete('claude-sync', (err) => {
          pm2.disconnect();

          if (err) {
            console.error(chalk.red(`\n✗ Failed to remove: ${err.message}\n`));
            process.exit(1);
          }

          console.log(chalk.green('\n✓ Claude Sync stopped\n'));

          // Windows autostart cleanup
          if (process.platform === 'win32') {
            const autostart = require('../lib/autostart-win');
            const result = autostart.disableAutostart();

            if (result.warnings && result.warnings.length > 0) {
              result.warnings.forEach((w) => {
                console.log(chalk.yellow(`  ${w}`));
              });
            } else {
              console.log(chalk.gray('  Autostart disabled\n'));
            }
          }
        });
      });
    });
  });

program
  .command('restart')
  .description('Restart the background daemon')
  .action(() => {
    const pm2 = require('pm2');

    pm2.connect((err) => {
      if (err) {
        console.error(chalk.red(`\n✗ Failed to connect to PM2: ${err.message}\n`));
        process.exit(1);
      }

      pm2.restart('claude-sync', (err) => {
        pm2.disconnect();

        if (err) {
          console.error(chalk.red(`\n✗ Failed to restart: ${err.message}\n`));
          console.log(chalk.gray('Try "claude-sync start" if the daemon is not running\n'));
          process.exit(1);
        }

        console.log(chalk.green('\n✓ Claude Sync restarted\n'));
      });
    });
  });

program
  .command('logs')
  .description('View daemon logs')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .action((options) => {
    const pm2 = require('pm2');

    pm2.connect((err) => {
      if (err) {
        console.error(chalk.red(`\n✗ Failed to connect to PM2: ${err.message}\n`));
        process.exit(1);
      }

      if (options.follow) {
        pm2.launchBus((err, bus) => {
          if (err) {
            console.error(chalk.red(`\n✗ Failed to launch bus: ${err.message}\n`));
            process.exit(1);
          }

          console.log(chalk.blue('📋 Streaming logs (Ctrl+C to stop)...\n'));

          bus.on('log:out', (packet) => {
            if (packet.process.name === 'claude-sync') {
              console.log(chalk.gray(`[${new Date().toLocaleTimeString()}]`), packet.data);
            }
          });

          bus.on('log:err', (packet) => {
            if (packet.process.name === 'claude-sync') {
              console.log(chalk.red(`[${new Date().toLocaleTimeString()}]`), packet.data);
            }
          });
        });
      } else {
        const { execSync } = require('child_process');
        const path = require('path');
        const pm2Bin = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
        const pm2Path = path.join(__dirname, '..', 'node_modules', '.bin', pm2Bin);

        try {
          const output = execSync(`"${pm2Path}" logs claude-sync --nostream --lines ${options.lines}`, {
            encoding: 'utf8',
          });
          console.log(output);
        } catch (err) {
          console.error(chalk.red('\n✗ Failed to get logs\n'));
          console.log(chalk.gray('Make sure claude-sync is running with "claude-sync start"\n'));
        }
        pm2.disconnect();
      }
    });
  });

program
  .command('status')
  .description('Show comprehensive sync status and health')
  .action(async () => {
    try {
      if (!config.exists()) {
        printError(new Error('Configuration not found'));
        process.exit(1);
      }

      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const cfg = config.get();
      const git = require('../lib/git');
      const pm2 = require('pm2');

      console.log(
        boxen(chalk.bold.blue(`Claude Sync Status  v${packageJson.version}`), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      console.log(chalk.blue.bold('Configuration'));
      console.log(chalk.gray(`  Location:    ${config.getConfigPath()}`));
      console.log(chalk.gray(`  GitHub Repo: ${cfg.github.owner}/${cfg.github.repo}`));
      console.log(chalk.gray(`  Auth Method: ${(cfg.github?.authMethod || 'unknown').toUpperCase()}`));

      console.log(chalk.blue.bold('\nSync Status'));
      const lastSync = cfg.lastSync
        ? new Date(cfg.lastSync).toLocaleString()
        : chalk.yellow('Never');
      console.log(chalk.gray(`  Last Sync:   ${lastSync}`));

      if (cfg.lastSync) {
        const elapsed = Date.now() - new Date(cfg.lastSync).getTime();
        const hours = Math.floor(elapsed / (1000 * 60 * 60));
        const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
        let agoStr;
        if (hours > 24) {
          const days = Math.floor(hours / 24);
          agoStr = `${days} day(s) ago`;
        } else if (hours > 0) {
          agoStr = `${hours}h ${minutes}m ago`;
        } else {
          agoStr = `${minutes}m ago`;
        }
        console.log(chalk.gray(`               (${agoStr})`));
      }

      try {
        const unsafeState = await git.hasUnpushedCommits();
        if (unsafeState.hasUnpushed) {
          console.log(chalk.yellow('  Unpushed:    Yes (run "claude-sync sync" to push)'));
        } else {
          console.log(chalk.green('  Unpushed:    None'));
        }
        if (unsafeState.hasUncommitted) {
          console.log(chalk.yellow(`  Uncommitted: ${unsafeState.uncommittedFiles.length} file(s)`));
        }
      } catch (e) {
        console.log(chalk.gray('  Git State:   Could not determine'));
      }

      try {
        const lastCommit = await git.getLastCommit();
        if (lastCommit) {
          const commitDate = new Date(lastCommit.date).toLocaleString();
          const shortMsg = lastCommit.message.length > 60
            ? lastCommit.message.substring(0, 57) + '...'
            : lastCommit.message;
          console.log(chalk.gray(`  Last Commit: ${shortMsg}`));
          console.log(chalk.gray(`               ${commitDate}`));
        }
      } catch (e) {
        // No commits yet
      }

      const workspaces = config.listWorkspaces();
      const syncRules = config.get('syncRules');

      console.log(chalk.blue.bold(`\nWorkspaces (${workspaces.length})`));

      if (workspaces.length === 0) {
        console.log(chalk.yellow('  None registered. Use "claude-sync add <path>" to add one.'));
      } else {
        let healthyCount = 0;
        let staleCount = 0;
        let missingCount = 0;

        for (const ws of workspaces) {
          if (!fs.existsSync(ws.path)) {
            missingCount++;
            console.log(chalk.red(`  ✗ ${ws.name} (directory missing)`));
            continue;
          }

          const globalFile = path.join(ws.path, syncRules.globalFile);
          const projectFile = path.join(ws.path, syncRules.projectFile);
          const targetFile = path.join(ws.path, syncRules.targetFile);
          const hasTarget = fs.existsSync(targetFile);
          const hasGlobal = fs.existsSync(globalFile);
          const hasProject = fs.existsSync(projectFile);

          let isStale = false;
          if (hasTarget) {
            const targetMtime = fs.statSync(targetFile).mtimeMs;
            if (hasGlobal && fs.statSync(globalFile).mtimeMs > targetMtime) isStale = true;
            if (hasProject && fs.statSync(projectFile).mtimeMs > targetMtime) isStale = true;
          }

          if (!hasTarget || isStale) {
            staleCount++;
            const reason = !hasTarget ? 'no CLAUDE.md' : 'CLAUDE.md stale';
            console.log(chalk.yellow(`  ~ ${ws.name} (${reason})`));
          } else {
            healthyCount++;
            console.log(chalk.green(`  ✓ ${ws.name}`));
          }
        }

        if (workspaces.length > 3) {
          console.log(chalk.gray(`\n  Summary: ${healthyCount} healthy, ${staleCount} stale, ${missingCount} missing`));
        }

        if (staleCount > 0) {
          console.log(chalk.yellow('\n  Run "claude-sync sync" to update stale workspaces.'));
        }
      }

      console.log(chalk.blue.bold('\nResources'));

      const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
      const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

      let skillCount = 0;
      if (fs.existsSync(globalSkillsPath)) {
        skillCount = fs.readdirSync(globalSkillsPath, { withFileTypes: true })
          .filter(e => e.isDirectory()).length;
      }

      let agentCount = 0;
      if (fs.existsSync(globalAgentsPath)) {
        agentCount = fs.readdirSync(globalAgentsPath)
          .filter(f => f.endsWith('.md')).length;
      }

      console.log(chalk.gray(`  Global Skills: ${skillCount}`));
      console.log(chalk.gray(`  Global Agents: ${agentCount}`));

      console.log(chalk.blue.bold('\nDaemon'));

      await new Promise((resolve) => {
        pm2.connect((err) => {
          if (err) {
            console.log(chalk.gray('  Status: Stopped'));
            console.log(chalk.gray('  Start with: claude-sync start'));
            resolve();
            return;
          }

          pm2.describe('claude-sync', (err, processDescription) => {
            pm2.disconnect();

            if (err || !processDescription || processDescription.length === 0) {
              console.log(chalk.yellow('  Status: Stopped'));
              console.log(chalk.gray('  Start with: claude-sync start'));
            } else {
              const proc = processDescription[0];
              const status = proc.pm2_env?.status;
              if (status === 'online') {
                const uptimeMs = Date.now() - proc.pm2_env.pm_uptime;
                const uptimeH = Math.floor(uptimeMs / (1000 * 60 * 60));
                const uptimeM = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
                const uptimeStr = uptimeH > 0 ? `${uptimeH}h ${uptimeM}m` : `${uptimeM}m`;

                console.log(chalk.green('  Status:  Running'));
                console.log(chalk.gray(`  PID:     ${proc.pid}`));
                console.log(chalk.gray(`  Uptime:  ${uptimeStr}`));
                console.log(chalk.gray(`  Restarts: ${proc.pm2_env.restart_time}`));
              } else {
                console.log(chalk.yellow(`  Status: ${status || 'Stopped'}`));
                console.log(chalk.gray('  Start with: claude-sync start'));
              }
            }

            console.log();
            resolve();
          });
        });
      });
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Run comprehensive health checks on your claude-sync setup')
  .action(async () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const git = require('../lib/git');

    console.log(
      boxen(chalk.bold.blue('Claude Sync Doctor'), {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })
    );

    const checks = [];
    let hasErrors = false;
    let hasWarnings = false;

    function pass(name, detail) {
      checks.push({ status: 'pass', name, detail });
    }
    function warn(name, detail) {
      checks.push({ status: 'warn', name, detail });
      hasWarnings = true;
    }
    function fail(name, detail) {
      checks.push({ status: 'fail', name, detail });
      hasErrors = true;
    }

    function printChecks() {
      checks.forEach(c => {
        const icon = c.status === 'pass' ? chalk.green('✓') : c.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
        console.log(`${icon} ${c.name}`);
        console.log(chalk.gray(`  ${c.detail}\n`));
      });
    }

    // Check 1: Configuration exists
    if (config.exists()) {
      pass('Configuration file', `Found at ${config.getConfigPath()}`);
    } else {
      fail('Configuration file', 'Not found. Run "claude-sync init" to set up.');
      printChecks();
      process.exit(1);
    }

    // Check 2: Configuration is valid / loadable
    let cfg;
    try {
      cfg = config.get();
      if (cfg.github && cfg.github.owner && cfg.github.repo) {
        pass('Configuration valid', `Repo: ${cfg.github.owner}/${cfg.github.repo}`);
      } else {
        fail('Configuration valid', 'Missing github.owner or github.repo in config');
      }
    } catch (error) {
      fail('Configuration valid', `Cannot load config: ${error.message}`);
    }

    // Check 3: Git repo exists and is initialized
    const repoPath = git.getRepoPath();
    try {
      const initialized = await git.isInitialized();
      if (initialized) {
        pass('Git repository', `Initialized at ${repoPath}`);
      } else {
        fail('Git repository', `Not initialized at ${repoPath}. Run "claude-sync init" again.`);
      }
    } catch (error) {
      fail('Git repository', `Error checking git: ${error.message}`);
    }

    // Check 4: Remote is reachable
    try {
      const simpleGit = require('simple-git');
      const gitInstance = simpleGit(repoPath);
      const remotes = await gitInstance.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      if (origin) {
        pass('Git remote configured', `origin -> ${origin.refs.fetch}`);

        try {
          await gitInstance.raw(['fetch', 'origin', '--dry-run']);
          pass('Git remote reachable', 'Successfully connected to remote');
        } catch (fetchErr) {
          warn('Git remote reachable', `Cannot reach remote: ${fetchErr.message}. Check your SSH keys or token.`);
        }
      } else {
        fail('Git remote configured', 'No "origin" remote found');
      }
    } catch (error) {
      warn('Git remote check', `Could not check remotes: ${error.message}`);
    }

    // Check 5: Unpushed commits
    try {
      const unsafeState = await git.hasUnpushedCommits();
      if (unsafeState.hasUnpushed) {
        warn('Unpushed commits', 'You have local commits not pushed to GitHub. Run "claude-sync sync" to push.');
      } else {
        pass('Unpushed commits', 'All commits are pushed');
      }
      if (unsafeState.hasUncommitted) {
        warn('Uncommitted changes', `${unsafeState.uncommittedFiles.length} uncommitted file(s) in local repo`);
      } else {
        pass('Uncommitted changes', 'Working tree is clean');
      }
    } catch (error) {
      warn('Git state', `Could not check: ${error.message}`);
    }

    // Check 6: PM2 daemon status
    try {
      const { isDaemonRunning } = require('../lib/daemon-status');
      if (isDaemonRunning()) {
        pass('Daemon (PM2)', 'Running');
      } else {
        warn('Daemon (PM2)', 'Not running. Start with "claude-sync start" for auto-sync.');
      }
    } catch (error) {
      warn('Daemon (PM2)', `Could not check: ${error.message}`);
    }

    // Check 7: Workspaces exist on disk
    const workspaces = config.listWorkspaces();
    if (workspaces.length === 0) {
      warn('Workspaces', 'No workspaces registered. Add one with "claude-sync add <path>".');
    } else {
      let validCount = 0;
      let invalidCount = 0;
      const invalidPaths = [];

      for (const ws of workspaces) {
        if (fs.existsSync(ws.path)) {
          validCount++;
        } else {
          invalidCount++;
          invalidPaths.push(ws.path);
        }
      }

      if (invalidCount === 0) {
        pass('Workspaces', `All ${validCount} workspace(s) exist on disk`);
      } else {
        warn('Workspaces', `${invalidCount} workspace(s) not found on disk: ${invalidPaths.join(', ')}`);
      }
    }

    // Check 8: Workspace files (CLAUDE-GLOBAL.md, CLAUDE-PROJECT.md, CLAUDE.md)
    const syncRules = cfg?.syncRules;
    if (syncRules && workspaces.length > 0) {
      let allGood = true;
      const issues = [];

      for (const ws of workspaces) {
        if (!fs.existsSync(ws.path)) continue;

        const globalFile = path.join(ws.path, syncRules.globalFile);
        const projectFile = path.join(ws.path, syncRules.projectFile);
        const targetFile = path.join(ws.path, syncRules.targetFile);

        if (!fs.existsSync(globalFile)) {
          issues.push(`${ws.name}: missing ${syncRules.globalFile}`);
          allGood = false;
        }
        if (!fs.existsSync(projectFile)) {
          issues.push(`${ws.name}: missing ${syncRules.projectFile}`);
          allGood = false;
        }
        if (!fs.existsSync(targetFile)) {
          issues.push(`${ws.name}: missing ${syncRules.targetFile} (run "claude-sync sync")`);
          allGood = false;
        }
      }

      if (allGood) {
        pass('Workspace files', 'All workspaces have GLOBAL, PROJECT, and merged CLAUDE.md');
      } else {
        warn('Workspace files', issues.join('; '));
      }
    }

    // Check 9: Global skills directory
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
    if (fs.existsSync(globalSkillsPath)) {
      const skillDirs = fs.readdirSync(globalSkillsPath, { withFileTypes: true })
        .filter(e => e.isDirectory());
      pass('Global skills directory', `Found ${skillDirs.length} skill(s) in ${globalSkillsPath}`);
    } else {
      warn('Global skills directory', `Not found at ${globalSkillsPath}. Skills sync will have nothing to push.`);
    }

    // Check 10: Global agents directory
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');
    if (fs.existsSync(globalAgentsPath)) {
      const agentFiles = fs.readdirSync(globalAgentsPath)
        .filter(f => f.endsWith('.md'));
      pass('Global agents directory', `Found ${agentFiles.length} agent(s) in ${globalAgentsPath}`);
    } else {
      warn('Global agents directory', `Not found at ${globalAgentsPath}. Agents sync will have nothing to push.`);
    }

    // Check 11: GitHub repo has CLAUDE.md
    const githubClaudeFile = path.join(repoPath, 'CLAUDE.md');
    if (fs.existsSync(githubClaudeFile)) {
      const stat = fs.statSync(githubClaudeFile);
      const size = (stat.size / 1024).toFixed(1);
      pass('GitHub CLAUDE.md', `Present (${size} KB, last modified: ${stat.mtime.toLocaleString()})`);
    } else {
      warn('GitHub CLAUDE.md', 'Not found in local repo. Run "claude-sync sync" to push your global rules.');
    }

    // Check 12: Node.js version
    const nodeVersion = process.versions.node;
    const [major] = nodeVersion.split('.').map(Number);
    if (major >= 16) {
      pass('Node.js version', `v${nodeVersion} (>= 16 required)`);
    } else {
      fail('Node.js version', `v${nodeVersion} - requires >= 16.0.0`);
    }

    // Print all results
    console.log();
    printChecks();

    // Summary
    const passes = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    const failures = checks.filter(c => c.status === 'fail').length;

    console.log(chalk.bold('——— Summary ———'));
    console.log(`${chalk.green(passes)} passed, ${chalk.yellow(warnings)} warnings, ${chalk.red(failures)} failures`);

    if (hasErrors) {
      console.log(chalk.red('\nSome checks failed. Fix the issues above before using claude-sync.\n'));
      process.exit(1);
    } else if (hasWarnings) {
      console.log(chalk.yellow('\nSetup looks OK but there are warnings. Consider fixing them.\n'));
    } else {
      console.log(chalk.green('\nEverything looks great! Your setup is healthy.\n'));
    }
  });

program
  .command('migrate <workspace>')
  .description('Help migrate existing CLAUDE.md to GLOBAL/PROJECT structure')
  .action(async (workspace) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const inquirer = require('inquirer');

      const resolvedPath = path.resolve(workspace);
      const claudeMdPath = path.join(resolvedPath, 'CLAUDE.md');
      const globalPath = path.join(resolvedPath, 'CLAUDE-GLOBAL.md');
      const projectPath = path.join(resolvedPath, 'CLAUDE-PROJECT.md');

      if (!fs.existsSync(claudeMdPath)) {
        console.error(chalk.red('\n✗ No CLAUDE.md found in this workspace\n'));
        process.exit(1);
      }

      if (fs.existsSync(globalPath) || fs.existsSync(projectPath)) {
        console.error(chalk.red('\n✗ CLAUDE-GLOBAL.md or CLAUDE-PROJECT.md already exists\n'));
        console.log(chalk.gray('Migration already completed or in progress\n'));
        process.exit(1);
      }

      console.log(boxen(
        chalk.blue.bold('📋 Migration Helper\n\n') +
        chalk.gray('This will help you migrate your existing CLAUDE.md\n') +
        chalk.gray('into the new structure:\n\n') +
        chalk.white('  • CLAUDE-GLOBAL.md ') + chalk.gray('→ Shared rules (all projects)\n') +
        chalk.white('  • CLAUDE-PROJECT.md ') + chalk.gray('→ Project-specific rules\n'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue'
        }
      ));

      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Start migration?',
          default: true,
        },
      ]);

      if (!proceed) {
        console.log(chalk.yellow('\n⚠ Migration cancelled\n'));
        return;
      }

      const spinner = ora('Creating files...').start();

      const globalTemplate = `# Global Rules - Shared Across All Projects

## Instructions
Edit this file to add rules that apply to ALL your projects.
Examples: commit patterns, code style, naming conventions, etc.

---

# TODO: Move global rules from CLAUDE-PROJECT.md to here

`;

      fs.writeFileSync(globalPath, globalTemplate, 'utf8');

      const existingContent = fs.readFileSync(claudeMdPath, 'utf8');
      fs.writeFileSync(projectPath, existingContent, 'utf8');

      fs.renameSync(claudeMdPath, path.join(resolvedPath, 'CLAUDE.md.backup'));

      spinner.succeed('Migration files created');

      const { isDaemonRunning } = require('../lib/daemon-status');
      const daemonRunning = isDaemonRunning();

      let nextSteps = '';
      if (daemonRunning) {
        nextSteps = chalk.green.bold('✓ Daemon is running\n') +
                   chalk.gray('Changes will be automatically synced when you save files\n\n');
      } else {
        nextSteps = chalk.yellow.bold('⚠ Daemon not running\n') +
                   chalk.gray('Start it with: ') + chalk.cyan('claude-sync start') + chalk.gray('\n') +
                   chalk.gray('Or manually sync: ') + chalk.cyan('claude-sync sync') + chalk.gray('\n\n');
      }

      console.log(boxen(
        chalk.green.bold('✓ Migration Complete!\n\n') +
        chalk.gray('Files created:\n') +
        chalk.blue('  ✓ CLAUDE-GLOBAL.md ') + chalk.gray('(template)\n') +
        chalk.blue('  ✓ CLAUDE-PROJECT.md ') + chalk.gray('(copy of original)\n') +
        chalk.blue('  ✓ CLAUDE.md.backup ') + chalk.gray('(original backup)\n\n') +
        chalk.yellow.bold('📝 Manual Curation Required:\n\n') +
        chalk.white('1. ') + chalk.gray('Open CLAUDE-PROJECT.md\n') +
        chalk.white('2. ') + chalk.gray('Identify rules that apply to ALL projects\n') +
        chalk.white('3. ') + chalk.gray('Move those rules to CLAUDE-GLOBAL.md\n') +
        chalk.white('4. ') + chalk.gray('Keep project-specific rules in CLAUDE-PROJECT.md\n\n') +
        nextSteps,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green'
        }
      ));

    } catch (error) {
      printError(error, 'Migration failed');
      process.exit(1);
    }
  });

program
  .command('reset')
  .description('Reset configuration and remove all data (DESTRUCTIVE)')
  .option('--no-backup', 'Skip creating backup of local repository')
  .action(async (options) => {
    const inquirer = require('inquirer');
    const git = require('../lib/git');

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('This will delete all configuration and local repository data. Are you sure?'),
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n  Reset cancelled\n'));
      return;
    }

    try {
      let unsafeState = null;
      const isInitialized = await git.isInitialized();

      if (isInitialized) {
        unsafeState = await git.hasUnpushedCommits();

        if (unsafeState.hasUnsafeState) {
          console.log(chalk.red('\n  WARNING: Your local repository has unsaved work!\n'));

          if (unsafeState.hasUnpushed) {
            console.log(chalk.yellow('  Commits NOT pushed to GitHub'));
          }

          if (unsafeState.hasUncommitted) {
            console.log(chalk.yellow('  Uncommitted changes:'));
            unsafeState.uncommittedFiles.slice(0, 10).forEach(f => {
              console.log(chalk.gray(`    - ${f}`));
            });
            if (unsafeState.uncommittedFiles.length > 10) {
              console.log(chalk.gray(`    ... and ${unsafeState.uncommittedFiles.length - 10} more`));
            }
          }

          console.log(chalk.red('\n  This data will be PERMANENTLY LOST if not backed up.\n'));

          const { confirmUnsafe } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmUnsafe',
              message: chalk.red.bold('You have unpushed work. Proceed with reset anyway?'),
              default: false,
            },
          ]);

          if (!confirmUnsafe) {
            console.log(chalk.yellow('\n  Reset cancelled\n'));
            console.log(chalk.gray('  Tip: Run "claude-sync sync" to push your changes before resetting\n'));
            return;
          }
        }
      }

      let backupPath = null;
      if (options.backup !== false && isInitialized) {
        const backupSpinner = ora('Creating backup of local repository...').start();
        try {
          backupPath = await git.backupRepo();
          if (backupPath) {
            backupSpinner.succeed(`Backup created: ${backupPath}`);
          } else {
            backupSpinner.info('No repository to back up');
          }
        } catch (backupError) {
          backupSpinner.warn(`Backup failed: ${backupError.message} (proceeding with reset)`);
        }
      }

      const spinner = ora('Resetting configuration...').start();

      config.reset();
      await git.reset();

      spinner.succeed('Configuration reset successfully');

      if (backupPath) {
        console.log(chalk.blue(`\n  Backup saved to: ${backupPath}`));
        console.log(chalk.gray('  You can restore it manually if needed\n'));
      }

      console.log(chalk.gray('Run "claude-sync init" to set up again\n'));
    } catch (error) {
      printError(error, 'Reset failed');
      process.exit(1);
    }
  });

checkAndNotifyUpdate().then(() => {
  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
});
