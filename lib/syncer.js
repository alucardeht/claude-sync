const fs = require('fs');
const path = require('path');
const config = require('./config');
const git = require('./git');

class Syncer {
  async syncAll() {
    const workspaces = config.listWorkspaces();

    if (!workspaces || workspaces.length === 0) {
      throw new Error('No workspaces registered. Use "claude-sync add <path>" to add workspaces.');
    }

    const results = [];

    for (const workspace of workspaces) {
      try {
        const result = await this.syncWorkspace(workspace.path);
        results.push({ workspace: workspace.name, ...result });
      } catch (error) {
        results.push({
          workspace: workspace.name,
          success: false,
          error: error.message,
        });
      }
    }

    const syncRules = config.get('syncRules');
    const globalFile = path.join(workspaces[0].path, syncRules.globalFile);

    if (fs.existsSync(globalFile)) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const gitResult = await git.syncFile(
          globalFile,
          `Update CLAUDE.md - ${today}`
        );
        results.push({
          workspace: 'GitHub',
          ...gitResult,
        });
      } catch (error) {
        results.push({
          workspace: 'GitHub',
          success: false,
          error: error.message,
        });
      }
    }

    config.set('lastSync', new Date().toISOString());

    return results;
  }

  async syncWorkspace(workspacePath) {
    const syncRules = config.get('syncRules');

    const globalFile = path.join(workspacePath, syncRules.globalFile);
    const projectFile = path.join(workspacePath, syncRules.projectFile);
    const targetFile = path.join(workspacePath, syncRules.targetFile);

    if (!fs.existsSync(globalFile) && !fs.existsSync(projectFile)) {
      return {
        success: false,
        message: `Neither ${syncRules.globalFile} nor ${syncRules.projectFile} found in workspace`,
      };
    }

    let globalContent = '';
    let projectContent = '';

    if (fs.existsSync(globalFile)) {
      globalContent = fs.readFileSync(globalFile, 'utf8');
    }

    if (fs.existsSync(projectFile)) {
      projectContent = fs.readFileSync(projectFile, 'utf8');
    }

    const mergedContent = this.mergeContent(globalContent, projectContent);

    fs.writeFileSync(targetFile, mergedContent, 'utf8');

    return {
      success: true,
      message: `Successfully synced ${syncRules.targetFile}`,
      hasGlobal: fs.existsSync(globalFile),
      hasProject: fs.existsSync(projectFile),
    };
  }

  mergeContent(globalContent, projectContent) {
    if (!globalContent && !projectContent) {
      return '';
    }

    if (!globalContent) {
      return projectContent;
    }

    if (!projectContent) {
      return globalContent;
    }

    const separator = '\n\n---\n\n# Project-Specific Configuration\n\n';

    return globalContent.trim() + separator + projectContent.trim() + '\n';
  }

  async syncToGitHub(sourcePath) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await git.syncFile(
        sourcePath,
        `Update CLAUDE.md - ${today}`
      );

      config.set('lastSync', new Date().toISOString());

      return result;
    } catch (error) {
      throw new Error(`Failed to sync to GitHub: ${error.message}`);
    }
  }

  async propagateFromGitHub() {
    const repoPath = git.getRepoPath();
    const syncRules = config.get('syncRules');
    const globalFile = path.join(repoPath, syncRules.targetFile);

    if (!fs.existsSync(globalFile)) {
      throw new Error('CLAUDE.md not found in GitHub repository');
    }

    await git.pull();

    const workspaces = config.listWorkspaces();
    const results = [];

    for (const workspace of workspaces) {
      try {
        const targetPath = path.join(workspace.path, syncRules.globalFile);
        fs.copyFileSync(globalFile, targetPath);

        results.push({
          workspace: workspace.name,
          success: true,
          message: 'Successfully propagated from GitHub',
        });
      } catch (error) {
        results.push({
          workspace: workspace.name,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = new Syncer();
