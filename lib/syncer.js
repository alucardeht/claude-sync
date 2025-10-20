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

    // Sync all workspaces locally (regenerate CLAUDE.md)
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

    // Push CLAUDE-GLOBAL.md to GitHub as CLAUDE.md
    const syncRules = config.get('syncRules');
    const globalFile = path.join(workspaces[0].path, syncRules.globalFile);

    if (fs.existsSync(globalFile)) {
      try {
        const gitResult = await this.syncGlobalToGitHub(globalFile);
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

  async syncGlobalToGitHub(globalFilePath) {
    if (!fs.existsSync(globalFilePath)) {
      throw new Error(`CLAUDE-GLOBAL.md not found: ${globalFilePath}`);
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await git.syncFile(
        globalFilePath,
        `Update global rules - ${today}`,
        'CLAUDE.md'  // Save as CLAUDE.md in GitHub
      );

      config.set('lastSync', new Date().toISOString());

      return result;
    } catch (error) {
      throw new Error(`Failed to sync to GitHub: ${error.message}`);
    }
  }

  async syncToGitHub(sourcePath) {
    // Legacy method - redirects to syncGlobalToGitHub
    return this.syncGlobalToGitHub(sourcePath);
  }

  async propagateFromGitHub() {
    const repoPath = git.getRepoPath();
    const syncRules = config.get('syncRules');
    const githubClaudeFile = path.join(repoPath, 'CLAUDE.md');

    if (!fs.existsSync(githubClaudeFile)) {
      throw new Error('CLAUDE.md not found in GitHub repository');
    }

    // Pull latest changes from GitHub
    await git.pull();

    const workspaces = config.listWorkspaces();
    const results = [];

    // Propagate GitHub/CLAUDE.md to each workspace as CLAUDE-GLOBAL.md
    for (const workspace of workspaces) {
      try {
        const targetGlobalPath = path.join(workspace.path, syncRules.globalFile);
        fs.copyFileSync(githubClaudeFile, targetGlobalPath);

        // Regenerate merged CLAUDE.md
        await this.syncWorkspace(workspace.path);

        results.push({
          workspace: workspace.name,
          success: true,
          message: 'Successfully propagated from GitHub and regenerated CLAUDE.md',
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

  async propagateGlobalToWorkspaces(excludeWorkspacePath = null) {
    const repoPath = git.getRepoPath();
    const syncRules = config.get('syncRules');
    const githubClaudeFile = path.join(repoPath, 'CLAUDE.md');

    if (!fs.existsSync(githubClaudeFile)) {
      throw new Error('CLAUDE.md not found in GitHub repository');
    }

    const workspaces = config.listWorkspaces();
    const results = [];

    // Propagate to all workspaces except the one that triggered the change
    for (const workspace of workspaces) {
      if (excludeWorkspacePath && workspace.path === excludeWorkspacePath) {
        continue;
      }

      try {
        const targetGlobalPath = path.join(workspace.path, syncRules.globalFile);
        fs.copyFileSync(githubClaudeFile, targetGlobalPath);

        // Regenerate merged CLAUDE.md
        await this.syncWorkspace(workspace.path);

        results.push({
          workspace: workspace.name,
          success: true,
          message: 'Successfully propagated global rules',
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
