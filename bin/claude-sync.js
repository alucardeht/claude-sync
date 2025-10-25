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
      console.error(chalk.red(`\n✗ Setup failed: ${error.message}\n`));
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
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('remove <workspace>')
  .description('Remove a workspace from the sync list')
  .action(async (workspace) => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const spinner = ora('Removing workspace...').start();

      const removed = config.removeWorkspace(workspace);

      spinner.succeed(`Workspace removed: ${removed}`);
    } catch (error) {
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all registered workspaces')
  .action(() => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const workspaces = config.listWorkspaces();

      if (!workspaces || workspaces.length === 0) {
        console.log(chalk.yellow('\n⚠ No workspaces registered\n'));
        console.log(chalk.gray('Use "claude-sync add <path>" to add workspaces\n'));
        return;
      }

      console.log(
        boxen(chalk.bold.blue(`Registered Workspaces (${workspaces.length})`), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      workspaces.forEach((workspace, index) => {
        console.log(chalk.blue(`${index + 1}. ${workspace.name}`));
        console.log(chalk.gray(`   ${workspace.path}`));
        console.log(chalk.gray(`   Added: ${new Date(workspace.addedAt).toLocaleString()}\n`));
      });
    } catch (error) {
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Manually sync all workspaces and push to GitHub')
  .action(async () => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
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
    } catch (error) {
      console.error(chalk.red(`\n✗ Sync failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('sync-skills')
  .description('Manually sync all global skills to GitHub')
  .action(async () => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
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
      console.error(chalk.red(`\n✗ Skills sync failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('pull')
  .description('Pull CLAUDE-GLOBAL.md and skills from GitHub and update all workspaces')
  .action(async () => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const spinner = ora('Pulling from GitHub...').start();

      const results = await syncer.propagateFromGitHub();
      const skillsResult = await syncer.propagateSkillsFromGitHub();

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
      }

      console.log();
    } catch (error) {
      console.error(chalk.red(`\n✗ Pull failed: ${error.message}\n`));
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
      console.error(chalk.red(`\n✗ Watcher failed: ${error.message}\n`));
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
            console.log(chalk.gray('Commands:'));
            console.log(chalk.gray('  claude-sync stop     Stop the daemon'));
            console.log(chalk.gray('  claude-sync restart  Restart the daemon'));
            console.log(chalk.gray('  claude-sync logs     View logs\n'));
          }
        );
      });
    } catch (error) {
      console.error(chalk.red(`\n✗ Start failed: ${error.message}\n`));
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
        const pm2Path = path.join(__dirname, '..', 'node_modules', '.bin', 'pm2');

        try {
          const output = execSync(`${pm2Path} logs claude-sync --nostream --lines ${options.lines}`, {
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
  .description('Show configuration and sync status')
  .action(() => {
    try {
      if (!config.exists()) {
        console.error(chalk.red('\n✗ Configuration not found. Run "claude-sync init" first.\n'));
        process.exit(1);
      }

      const cfg = config.get();
      const watcherStatus = watcher.getStatus();

      console.log(
        boxen(chalk.bold.blue('Claude Sync Status'), {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      );

      console.log(chalk.blue('Configuration:'));
      console.log(chalk.gray(`  Location: ${config.getConfigPath()}`));
      console.log(chalk.gray(`  GitHub Repo: ${cfg.github.owner}/${cfg.github.repo}`));
      console.log(chalk.gray(`  Auth Method: ${cfg.github.authMethod.toUpperCase()}`));
      console.log(chalk.gray(`  Workspaces: ${cfg.workspaces?.length || 0}`));
      console.log(chalk.gray(`  Last Sync: ${cfg.lastSync ? new Date(cfg.lastSync).toLocaleString() : 'Never'}`));

      console.log(chalk.blue('\nWatcher:'));
      console.log(chalk.gray(`  Status: ${watcherStatus.isWatching ? 'Running' : 'Stopped'}`));

      console.log();
    } catch (error) {
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
      process.exit(1);
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
      console.error(chalk.red(`\n✗ Migration failed: ${error.message}\n`));
      process.exit(1);
    }
  });

program
  .command('reset')
  .description('Reset configuration and remove all data (DESTRUCTIVE)')
  .action(async () => {
    const inquirer = require('inquirer');

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('This will delete all configuration and local repository data. Are you sure?'),
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n⚠ Reset cancelled\n'));
      return;
    }

    try {
      const spinner = ora('Resetting configuration...').start();

      config.reset();

      const git = require('../lib/git');
      await git.reset();

      spinner.succeed('Configuration reset successfully');

      console.log(chalk.gray('\nRun "claude-sync init" to set up again\n'));
    } catch (error) {
      console.error(chalk.red(`\n✗ Reset failed: ${error.message}\n`));
      process.exit(1);
    }
  });

checkAndNotifyUpdate().then(() => {
  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
});
