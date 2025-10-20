const chokidar = require('chokidar');
const path = require('path');
const config = require('./config');
const syncer = require('./syncer');
const chalk = require('chalk');

class Watcher {
  constructor() {
    this.watcher = null;
    this.isWatching = false;
  }

  async start() {
    if (this.isWatching) {
      throw new Error('Watcher is already running');
    }

    const workspaces = config.listWorkspaces();

    if (!workspaces || workspaces.length === 0) {
      throw new Error('No workspaces registered. Use "claude-sync add <path>" to add workspaces.');
    }

    const syncRules = config.get('syncRules');
    const watchPaths = [];

    for (const workspace of workspaces) {
      watchPaths.push(path.join(workspace.path, syncRules.globalFile));
      watchPaths.push(path.join(workspace.path, syncRules.projectFile));
    }

    console.log(chalk.blue('\n📡 Starting file watcher...\n'));
    console.log(chalk.gray('Watching files:'));
    watchPaths.forEach(p => console.log(chalk.gray(`  - ${p}`)));
    console.log(chalk.gray('\nPress Ctrl+C to stop\n'));

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', async (filePath) => {
      console.log(chalk.yellow(`\n⚡ Change detected: ${path.basename(filePath)}`));

      try {
        const workspacePath = path.dirname(filePath);
        const fileName = path.basename(filePath);

        if (fileName === syncRules.globalFile || fileName === syncRules.projectFile) {
          console.log(chalk.blue('🔄 Syncing workspace...'));

          const result = await syncer.syncWorkspace(workspacePath);

          if (result.success) {
            console.log(chalk.green('✓ Workspace synced successfully'));

            const targetFile = path.join(workspacePath, syncRules.targetFile);
            console.log(chalk.blue('📤 Pushing to GitHub...'));

            const gitResult = await syncer.syncToGitHub(targetFile);

            if (gitResult.pushed) {
              console.log(chalk.green('✓ Successfully pushed to GitHub'));
            } else {
              console.log(chalk.yellow(`⚠ ${gitResult.message}`));
            }
          } else {
            console.log(chalk.red(`✗ Sync failed: ${result.message}`));
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

  stop() {
    if (this.watcher) {
      console.log(chalk.yellow('\n\n👋 Stopping watcher...'));
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      console.log(chalk.green('✓ Watcher stopped\n'));
      process.exit(0);
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
