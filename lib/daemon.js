#!/usr/bin/env node

const watcher = require('./watcher');

async function startDaemon() {
  try {
    await watcher.start();
  } catch (error) {
    console.error('Daemon error:', error.message);
    process.exit(1);
  }
}

startDaemon();
