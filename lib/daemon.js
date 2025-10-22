#!/usr/bin/env node

const watcher = require('./watcher');
const syncer = require('./syncer');
const chalk = require('chalk');

async function startDaemon() {
  try {
    console.log(chalk.blue('🔄 Pulling latest changes from GitHub...'));

    try {
      await syncer.propagateFromGitHub();
      await syncer.propagateSkillsFromGitHub();
      console.log(chalk.green('✓ Successfully pulled latest changes\n'));
    } catch (error) {
      console.log(chalk.yellow(`⚠ Could not pull from GitHub: ${error.message}`));
      console.log(chalk.gray('Continuing with local files...\n'));
    }

    await watcher.start();
  } catch (error) {
    console.error('Daemon error:', error.message);
    process.exit(1);
  }
}

startDaemon();
