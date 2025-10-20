const { execSync } = require('child_process');
const path = require('path');

function isDaemonRunning() {
  try {
    const pm2Path = path.join(__dirname, '..', 'node_modules', '.bin', 'pm2');
    const output = execSync(`${pm2Path} jlist`, { encoding: 'utf8' });
    const processes = JSON.parse(output);

    const claudeSync = processes.find(p => p.name === 'claude-sync');
    return claudeSync && claudeSync.pm2_env.status === 'online';
  } catch (error) {
    return false;
  }
}

module.exports = { isDaemonRunning };
