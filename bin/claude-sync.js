#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const setup = require('../lib/setup');
const config = require('../lib/config');
const syncer = require('../lib/syncer');
const watcher = require('../lib/watcher');
const packageJson = require('../package.json');

const program = new Command();

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

      const spinner = ora('Adding workspace...').start();

      const added = config.addWorkspace(workspace);

      spinner.succeed(`Workspace added: ${added}`);

      console.log(chalk.gray('\nTip: Run "claude-sync sync" to sync all workspaces\n'));
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
  .command('watch')
  .description('Watch for file changes and auto-sync')
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

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
