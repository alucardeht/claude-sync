const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_DIR = path.join(os.homedir(), '.config', 'claude-sync', 'repo');

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
          await this.git.init();
          await this.git.addRemote('origin', repoUrl);

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
          await this.git.commit('Initial commit');
          await this.git.push('origin', 'main');

          return true;
        } catch (initError) {
          throw new Error(`Failed to initialize repository: ${initError.message}`);
        }
      }

      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  async syncFile(filePath, commitMessage = 'Update CLAUDE.md', targetFileName = null) {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    // Use custom filename if provided, otherwise use original filename
    const fileName = targetFileName || path.basename(filePath);
    const targetPath = path.join(this.repoPath, fileName);

    // Prevent syncing CLAUDE-PROJECT.md to GitHub
    if (path.basename(filePath) === 'CLAUDE-PROJECT.md') {
      throw new Error('CLAUDE-PROJECT.md should never be pushed to GitHub. Only CLAUDE-GLOBAL.md can be synced.');
    }

    // Ensure directory exists for nested paths (e.g., skills/skill-name/SKILL.md)
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.copyFileSync(filePath, targetPath);

    await this.git.add(fileName);

    const status = await this.git.status();
    if (status.files.length === 0) {
      return { pushed: false, message: 'No changes to commit' };
    }

    await this.git.commit(commitMessage);
    await this.git.push('origin', 'main');

    return { pushed: true, message: 'Successfully pushed to GitHub' };
  }

  async pull() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    await this.git.pull('origin', 'main');
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

    const log = await this.git.log({ maxCount: 1 });
    return log.latest;
  }

  getRepoPath() {
    return this.repoPath;
  }

  async reset() {
    if (fs.existsSync(this.repoPath)) {
      fs.rmSync(this.repoPath, { recursive: true, force: true });
    }
    this.git = null;
  }
}

module.exports = new GitManager();
