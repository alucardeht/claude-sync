const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCK_DIR = path.join(os.homedir(), '.config', 'claude-sync');
const LOCK_FILE = path.join(LOCK_DIR, 'git.lock');
const LOCK_TIMEOUT_MS = 60000;
const LOCK_RETRY_INTERVAL_MS = 200;
const LOCK_MAX_RETRIES = 150;

class GitLock {
  async acquire() {
    for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
      if (this._tryAcquire()) {
        return true;
      }

      if (this._isStale()) {
        console.log('[lock] Removing stale lock file');
        this.release();
        continue;
      }

      await this._sleep(LOCK_RETRY_INTERVAL_MS);
    }

    throw new Error(
      'Could not acquire git lock after 30 seconds. ' +
      'Another claude-sync process may be stuck. ' +
      `Delete ${LOCK_FILE} manually if this persists.`
    );
  }

  release() {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
      }
    } catch (error) {
      // Ignore errors on release
    }
  }

  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  _tryAcquire() {
    try {
      if (!fs.existsSync(LOCK_DIR)) {
        fs.mkdirSync(LOCK_DIR, { recursive: true });
      }

      const lockData = JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
        hostname: os.hostname(),
      });

      fs.writeFileSync(LOCK_FILE, lockData, { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        return false;
      }
      throw error;
    }
  }

  _isStale() {
    try {
      const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const elapsed = Date.now() - data.timestamp;

      if (elapsed > LOCK_TIMEOUT_MS) {
        return true;
      }

      if (data.hostname === os.hostname()) {
        try {
          process.kill(data.pid, 0);
          return false;
        } catch (e) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return true;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new GitLock();
