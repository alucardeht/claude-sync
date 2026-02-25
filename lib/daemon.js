#!/usr/bin/env node

const watcher = require('./watcher');
const syncer = require('./syncer');
const chalk = require('chalk');
const git = require('./git');
const lock = require('./lock');

async function startDaemon() {
  try {
    console.log(chalk.blue('🔄 Pulling latest changes from GitHub...'));

    try {
      // Single git pull upfront to avoid triple stash/unstash cycles
      await git.pull();

      await syncer.propagateFromGitHub({ skipPull: true });
      await syncer.propagateSkillsFromGitHub({ skipPull: true });
      await syncer.propagateAgentsFromGitHub({ skipPull: true });
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

process.on('exit', () => lock.release());
process.on('SIGINT', () => { lock.release(); process.exit(0); });
process.on('SIGTERM', () => { lock.release(); process.exit(0); });

startDaemon();
