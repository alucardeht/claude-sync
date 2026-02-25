const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');
const lock = require('./lock');

const REPO_DIR = path.join(os.homedir(), '.config', 'claude-sync', 'repo');

/**
 * Convert a path to forward slashes for git operations.
 * On Windows, path.join() produces backslashes which git may not handle correctly.
 */
function toGitPath(p) {
  return p.replace(/\\/g, '/');
}

class GitManager {
  constructor() {
    this.git = null;
    this.repoPath = REPO_DIR;
  }

  ensureRepoDir() {
    if (!fs.existsSync(this.repoPath)) {
      fs.mkdirSync(this.repoPath, { recursive: true });
    }
  }

  async _retryWithBackoff(fn, { maxRetries = 3, baseDelayMs = 1000, operationName = 'operation' } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        const msg = error.message || String(error);
        const isTransient = (
          msg.includes('Could not resolve host') ||
          msg.includes('Connection refused') ||
          msg.includes('Connection reset') ||
          msg.includes('Connection timed out') ||
          msg.includes('unable to access') ||
          msg.includes('SSL') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('ECONNRESET') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('ENOTFOUND') ||
          msg.includes('fetch first') ||
          msg.includes('failed to push') ||
          msg.includes('Could not read from remote')
        );

        if (!isTransient) {
          break;
        }

        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.log(`  Retry ${attempt + 1}/${maxRetries} for ${operationName} in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  async isInitialized() {
    try {
      this.ensureRepoDir();
      this.git = simpleGit(this.repoPath);
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  async init(repoUrl, authMethod = 'ssh', token = null) {
    return lock.withLock(async () => {
      this.ensureRepoDir();

      const isEmpty = fs.readdirSync(this.repoPath).length === 0;

      if (!isEmpty) {
        const gitExists = fs.existsSync(path.join(this.repoPath, '.git'));
        if (gitExists) {
          throw new Error('Git repository already initialized');
        }
      }

      this.git = simpleGit(this.repoPath);

      try {
        let cloneUrl = repoUrl;

        if (authMethod === 'https' && token) {
          const urlParts = repoUrl.replace('https://', '').split('/');
          cloneUrl = `https://${token}@${urlParts.join('/')}`;
        }

        await this.git.clone(cloneUrl, this.repoPath);
        this.git = simpleGit(this.repoPath);

        return true;
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('not empty')) {
          try {
            let cloneUrl = repoUrl;
            if (authMethod === 'https' && token) {
              const urlParts = repoUrl.replace('https://', '').split('/');
              cloneUrl = `https://${token}@${urlParts.join('/')}`;
            }

            await this.git.init();
            await this.git.addRemote('origin', cloneUrl);

            // Try to fetch from remote to detect existing history
            let remoteHasHistory = false;
            try {
              await this.git.fetch('origin');
              const branches = await this.git.branch(['-r']);
              remoteHasHistory = branches.all.includes('origin/main');
            } catch (fetchError) {
              // Remote is empty or unreachable - proceed with fresh init
            }

            if (remoteHasHistory) {
              // Remote has commits - align local with remote instead of creating orphan
              await this.git.checkout(['-b', 'main']);
              await this.git.reset(['--mixed', 'origin/main']);
            }

            const readmePath = path.join(this.repoPath, 'README.md');
            if (!fs.existsSync(readmePath)) {
              fs.writeFileSync(
                readmePath,
                '# Claude Sync Repository\n\nThis repository contains:\n- Global CLAUDE.md rules synchronized across all projects\n- Global Skills from ~/.claude/skills/\n- Global Agents from ~/.claude/agents/\n',
                'utf8'
              );
            }

            // Create agents directory structure
            const agentsPath = path.join(this.repoPath, 'agents');
            if (!fs.existsSync(agentsPath)) {
              fs.mkdirSync(agentsPath, { recursive: true });
            }

            // Create skills directory structure
            const skillsPath = path.join(this.repoPath, 'skills');
            if (!fs.existsSync(skillsPath)) {
              fs.mkdirSync(skillsPath, { recursive: true });
            }

            await this.git.add('.');

            const status = await this.git.status();
            if (status.files.length > 0) {
              await this.git.commit('Initial commit');
              await this._retryWithBackoff(
                () => this.git.push('origin', 'main'),
                { operationName: 'git push' }
              );
            }

            return true;
          } catch (initError) {
            throw new Error(`Failed to initialize repository: ${initError.message}`);
          }
        }

        throw new Error(`Failed to clone repository: ${error.message}`);
      }
    });
  }

  async syncFile(filePath, commitMessage = 'Update CLAUDE.md', targetFileName = null, isDelete = false) {
    return lock.withLock(async () => {
      if (!this.git) {
        this.git = simpleGit(this.repoPath);
      }

      // Use custom filename if provided, otherwise use original filename
      const fileName = targetFileName || path.basename(filePath);
      const targetPath = path.join(this.repoPath, fileName);

      // Prevent syncing CLAUDE-PROJECT.md to GitHub
      if (!isDelete && path.basename(filePath) === 'CLAUDE-PROJECT.md') {
        throw new Error('CLAUDE-PROJECT.md should never be pushed to GitHub. Only CLAUDE-GLOBAL.md can be synced.');
      }

      if (!isDelete) {
        // Ensure directory exists for nested paths (e.g., skills/skill-name/SKILL.md)
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.copyFileSync(filePath, targetPath);
        await this.git.add(toGitPath(fileName));
      } else {
        await this.git.rm(toGitPath(fileName));
      }

      const status = await this.git.status();
      if (status.files.length === 0) {
        return { pushed: false, message: 'No changes to commit' };
      }

      await this.git.commit(commitMessage);
      await this._retryWithBackoff(
        () => this.git.push('origin', 'main'),
        { operationName: 'git push' }
      );

      return { pushed: true, message: 'Successfully pushed to GitHub' };
    });
  }

  async pull() {
    return lock.withLock(async () => {
      if (!this.git) {
        this.git = simpleGit(this.repoPath);
      }

      const status = await this.git.status();
      const hasChanges = status.files.length > 0;

      if (hasChanges) {
        await this.git.stash();
      }

      try {
        await this._retryWithBackoff(
          () => this.git.pull('origin', 'main'),
          { operationName: 'git pull' }
        );
      } finally {
        if (hasChanges) {
          try {
            await this.git.stash(['pop']);
          } catch (stashError) {
            const conflictMsg = stashError.message || String(stashError);
            if (conflictMsg.includes('CONFLICT') || conflictMsg.includes('could not restore')) {
              throw new Error(
                `Stash pop failed due to merge conflicts. Your local changes are still saved in the stash.\n` +
                `To resolve manually:\n` +
                `  cd ${this.repoPath}\n` +
                `  git stash pop    (re-attempt, will show conflicts)\n` +
                `  # resolve conflicts, then: git add . && git stash drop\n` +
                `Original error: ${conflictMsg}`
              );
            }
            throw new Error(
              `Failed to restore stashed changes after pull. Your changes are still in the stash.\n` +
              `To recover: cd ${this.repoPath} && git stash pop\n` +
              `Original error: ${conflictMsg}`
            );
          }
        }
      }
    });
  }

  async getStatus() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    return await this.git.status();
  }

  async getLastCommit() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log && log.latest) {
        return {
          message: log.latest.message,
          date: log.latest.date,
          hash: log.latest.hash,
        };
      }
    } catch (e) {
      // No commits yet
    }

    return null;
  }

  getRepoPath() {
    return this.repoPath;
  }

  async hasUnpushedCommits() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    try {
      const status = await this.git.status();
      const hasUncommitted = status.files.length > 0;

      let hasUnpushed = false;
      try {
        const log = await this.git.log(['origin/main..HEAD']);
        hasUnpushed = log.total > 0;
      } catch (e) {
        // No remote tracking or no commits yet - assume no unpushed
      }

      return {
        hasUncommitted,
        hasUnpushed,
        uncommittedFiles: status.files.map(f => f.path),
        hasUnsafeState: hasUncommitted || hasUnpushed,
      };
    } catch (error) {
      return {
        hasUncommitted: false,
        hasUnpushed: false,
        uncommittedFiles: [],
        hasUnsafeState: false,
      };
    }
  }

  async backupRepo() {
    if (!fs.existsSync(this.repoPath)) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(os.homedir(), '.config', 'claude-sync', 'backups');
    const backupPath = path.join(backupDir, `repo-backup-${timestamp}`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    fs.cpSync(this.repoPath, backupPath, { recursive: true });

    return backupPath;
  }

  async reset() {
    if (fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
    this.git = null;
  }
}

module.exports = new GitManager();
