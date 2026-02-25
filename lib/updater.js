const https = require('https');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const boxen = require('boxen');
const os = require('os');

const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const SUPPRESSED_RECHECK_INTERVAL = 7 * 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT = 2000;

function getCacheFilePath() {
  const configDir = path.join(os.homedir(), '.config', 'claude-sync');
  return path.join(configDir, 'last-update-check.json');
}

function readCache() {
  try {
    const cacheFile = getCacheFilePath();
    if (!fs.existsSync(cacheFile)) {
      return null;
    }
    const data = fs.readFileSync(cacheFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function writeCache(data) {
  try {
    const cacheFile = getCacheFilePath();
    const cacheDir = path.dirname(cacheFile);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  } catch (error) {
    // Silently fail
  }
}

function shouldCheckForUpdates(currentVersion) {
  const cache = readCache();

  if (!cache) {
    return true;
  }

  const now = new Date();
  const lastCheck = new Date(cache.lastCheck);
  const timeSinceLastCheck = now - lastCheck;

  if (!cache.lastNotifiedVersion ||
      compareVersions(cache.lastNotifiedVersion, currentVersion) <= 0) {
    return timeSinceLastCheck > UPDATE_CHECK_INTERVAL;
  }

  return timeSinceLastCheck > SUPPRESSED_RECHECK_INTERVAL;
}

function fetchLatestVersion() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout'));
    }, CHECK_TIMEOUT);

    const options = {
      hostname: 'registry.npmjs.org',
      path: '/@alucardeht/claude-sync',
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    https.get(options, (res) => {
      clearTimeout(timeout);

      if (res.statusCode !== 200) {
        reject(new Error(`NPM Registry returned ${res.statusCode}`));
        return;
      }

      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed['dist-tags'].latest);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function compareVersions(current, latest) {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) {
      return 1;
    }
    if (latestParts[i] < currentParts[i]) {
      return -1;
    }
  }

  return 0;
}

async function checkForUpdates(currentVersion) {
  try {
    const latestVersion = await fetchLatestVersion();

    const cache = readCache() || {};
    writeCache({
      lastCheck: new Date().toISOString(),
      lastNotifiedVersion: cache.lastNotifiedVersion || null
    });

    const isNewer = compareVersions(currentVersion, latestVersion) > 0;

    return {
      updateAvailable: isNewer,
      currentVersion,
      latestVersion
    };
  } catch (error) {
    throw error;
  }
}

function displayUpdateNotification(updateInfo) {
  const message = [
    chalk.yellow.bold('🎉 New version available!'),
    '',
    `${chalk.gray('Current version:')}  ${chalk.white(updateInfo.currentVersion)}`,
    `${chalk.gray('Latest version:')}   ${chalk.green.bold(updateInfo.latestVersion)}`,
    '',
    chalk.cyan('Run to update:'),
    chalk.white.bold('npm update -g @alucardeht/claude-sync')
  ].join('\n');

  const box = boxen(message, {
    padding: 1,
    margin: { top: 1, bottom: 1 },
    borderStyle: 'round',
    borderColor: 'yellow',
    align: 'center'
  });

  console.log(box);
}

function updateNotifiedVersion(version) {
  const cache = readCache() || {};
  writeCache({
    lastCheck: cache.lastCheck || new Date().toISOString(),
    lastNotifiedVersion: version
  });
}

module.exports = {
  shouldCheckForUpdates,
  checkForUpdates,
  displayUpdateNotification,
  updateNotifiedVersion
};
