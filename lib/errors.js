const chalk = require('chalk');

const ERROR_SUGGESTIONS = [
  {
    pattern: /Configuration not found/i,
    suggestion: 'Run "claude-sync init" to set up your configuration.',
  },
  {
    pattern: /SSH authentication failed|Permission denied \(publickey\)/i,
    suggestion: [
      'Check your SSH key setup:',
      '  1. Verify key exists: ls ~/.ssh/id_*',
      '  2. Test connection: ssh -T git@github.com',
      '  3. Add key to agent: ssh-add ~/.ssh/id_ed25519',
    ].join('\n'),
  },
  {
    pattern: /Could not resolve host|ENOTFOUND/i,
    suggestion: 'Check your internet connection. GitHub may also be experiencing an outage (https://githubstatus.com).',
  },
  {
    pattern: /ETIMEDOUT|Connection timed out|Connection refused|ECONNREFUSED/i,
    suggestion: 'Connection timed out. Check your network, firewall, or proxy settings.',
  },
  {
    pattern: /Repository not found|404/i,
    suggestion: [
      'The repository was not found. Possible causes:',
      '  - The repository does not exist (check owner/repo spelling)',
      '  - You do not have access (check permissions)',
      '  - The repository is private and your token lacks "repo" scope',
    ].join('\n'),
  },
  {
    pattern: /failed to push|rejected.*non-fast-forward/i,
    suggestion: [
      'Push was rejected. This usually means the remote has newer commits.',
      '  Try: claude-sync pull   (to get latest changes first)',
      '  Then: claude-sync sync  (to push again)',
    ].join('\n'),
  },
  {
    pattern: /Workspace path does not exist/i,
    suggestion: 'The specified directory does not exist. Check the path and try again.',
  },
  {
    pattern: /Workspace already registered/i,
    suggestion: 'This workspace is already in your sync list. Use "claude-sync list" to see all workspaces.',
  },
  {
    pattern: /Workspace not found/i,
    suggestion: 'This workspace is not in your sync list. Use "claude-sync list" to see registered workspaces.',
  },
  {
    pattern: /lock.*stuck|Could not acquire git lock/i,
    suggestion: [
      'The git lock file may be stale from a previous interrupted operation.',
      '  Delete it manually: rm ~/.config/claude-sync/git.lock',
      '  Then retry your command.',
    ].join('\n'),
  },
  {
    pattern: /CONFLICT|merge conflict/i,
    suggestion: [
      'There are merge conflicts in the local repository.',
      '  1. cd ~/.config/claude-sync/repo',
      '  2. Resolve conflicts manually',
      '  3. git add . && git commit',
      '  4. Retry your claude-sync command',
    ].join('\n'),
  },
  {
    pattern: /stash pop failed/i,
    suggestion: 'A git stash pop failed. Your changes are safe in the stash. See the error details above for recovery steps.',
  },
  {
    pattern: /No workspaces registered/i,
    suggestion: 'Add a workspace first: claude-sync add <path-to-your-project>',
  },
  {
    pattern: /PM2|daemon|pm2/i,
    suggestion: [
      'There was an issue with the background daemon (PM2).',
      '  Try: claude-sync stop && claude-sync start',
      '  Or use foreground mode: claude-sync watch',
    ].join('\n'),
  },
];

function enrichError(error) {
  const message = error instanceof Error ? error.message : String(error);

  for (const entry of ERROR_SUGGESTIONS) {
    if (entry.pattern.test(message)) {
      return { message, suggestion: entry.suggestion };
    }
  }

  return { message, suggestion: null };
}

function printError(error, prefix = 'Error') {
  const { message, suggestion } = enrichError(error);

  console.error(chalk.red(`\n✗ ${prefix}: ${message}`));

  if (suggestion) {
    console.error('');
    console.error(chalk.yellow('  Suggestion:'));
    suggestion.split('\n').forEach(line => {
      console.error(chalk.gray(`  ${line}`));
    });
  }

  console.error('');
}

module.exports = { enrichError, printError, ERROR_SUGGESTIONS };
