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

  async syncSkillToGitHub(skillFilePath) {
    if (!fs.existsSync(skillFilePath)) {
      throw new Error(`Skill file not found: ${skillFilePath}`);
    }

    const os = require('os');
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');

    if (!skillFilePath.startsWith(globalSkillsPath)) {
      return {
        pushed: false,
        message: 'Skill is project-specific, not synced to GitHub',
      };
    }

    const relativePath = path.relative(globalSkillsPath, skillFilePath);
    const targetPath = path.join('skills', relativePath);

    try {
      const today = new Date().toISOString().split('T')[0];
      const skillName = path.basename(path.dirname(skillFilePath));
      const result = await git.syncFile(
        skillFilePath,
        `Update skill: ${skillName} - ${today}`,
        targetPath
      );

      return result;
    } catch (error) {
      throw new Error(`Failed to sync skill to GitHub: ${error.message}`);
    }
  }

  async propagateSkillsFromGitHub() {
    const repoPath = git.getRepoPath();
    const githubSkillsDir = path.join(repoPath, 'skills');

    if (!fs.existsSync(githubSkillsDir)) {
      return {
        success: true,
        message: 'No skills directory in GitHub repository',
      };
    }

    await git.pull();

    const os = require('os');
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');

    if (!fs.existsSync(globalSkillsPath)) {
      fs.mkdirSync(globalSkillsPath, { recursive: true });
    }

    const copyDir = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyDir(githubSkillsDir, globalSkillsPath);

    return {
      success: true,
      message: 'Successfully propagated skills from GitHub',
    };
  }

  async syncAllGlobalSkills() {
    const os = require('os');
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');

    if (!fs.existsSync(globalSkillsPath)) {
      return {
        success: false,
        message: 'No global skills directory found',
        synced: 0,
        failed: 0,
      };
    }

    const results = {
      success: true,
      synced: 0,
      failed: 0,
      details: [],
    };

    const skillDirs = fs.readdirSync(globalSkillsPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    for (const skillDir of skillDirs) {
      const skillDirPath = path.join(globalSkillsPath, skillDir);
      
      const skillFiles = fs.readdirSync(skillDirPath)
        .filter(file => file.toLowerCase() === 'skill.md');

      if (skillFiles.length === 0) {
        results.details.push({
          skill: skillDir,
          status: 'skipped',
          message: 'No skill file found (SKILL.md or skill.md)',
        });
        continue;
      }

      const skillFilePath = path.join(skillDirPath, skillFiles[0]);

      try {
        const syncResult = await this.syncSkillToGitHub(skillFilePath);
        
        if (syncResult.pushed) {
          results.synced++;
          results.details.push({
            skill: skillDir,
            status: 'synced',
            message: 'Successfully synced to GitHub',
          });
        } else {
          results.details.push({
            skill: skillDir,
            status: 'skipped',
            message: syncResult.message,
          });
        }
      } catch (error) {
        results.failed++;
        results.success = false;
        results.details.push({
          skill: skillDir,
          status: 'failed',
          message: error.message,
        });
      }
    }

    return results;
  }

  async syncAgentToGitHub(agentFilePath) {
    if (!fs.existsSync(agentFilePath)) {
      throw new Error(`Agent file not found: ${agentFilePath}`);
    }

    const os = require('os');
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

    if (!agentFilePath.startsWith(globalAgentsPath)) {
      return {
        pushed: false,
        message: 'Agent is project-specific, not synced to GitHub',
      };
    }

    const agentFileName = path.basename(agentFilePath);
    const targetPath = path.join('agents', agentFileName);

    try {
      const today = new Date().toISOString().split('T')[0];
      const agentName = path.basename(agentFilePath, '.md');
      const result = await git.syncFile(
        agentFilePath,
        `Update agent: ${agentName} - ${today}`,
        targetPath
      );

      return result;
    } catch (error) {
      throw new Error(`Failed to sync agent to GitHub: ${error.message}`);
    }
  }

  async propagateAgentsFromGitHub() {
    const repoPath = git.getRepoPath();
    const githubAgentsDir = path.join(repoPath, 'agents');

    if (!fs.existsSync(githubAgentsDir)) {
      return {
        success: true,
        message: 'No agents directory in GitHub repository',
      };
    }

    await git.pull();

    const os = require('os');
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

    if (!fs.existsSync(globalAgentsPath)) {
      fs.mkdirSync(globalAgentsPath, { recursive: true });
    }

    const agentFiles = fs.readdirSync(githubAgentsDir)
      .filter(file => file.endsWith('.md'));

    for (const agentFile of agentFiles) {
      const srcPath = path.join(githubAgentsDir, agentFile);
      const destPath = path.join(globalAgentsPath, agentFile);
      fs.copyFileSync(srcPath, destPath);
    }

    return {
      success: true,
      message: 'Successfully propagated agents from GitHub',
    };
  }

  async syncAllGlobalAgents() {
    const os = require('os');
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

    if (!fs.existsSync(globalAgentsPath)) {
      return {
        success: false,
        message: 'No global agents directory found',
        synced: 0,
        failed: 0,
      };
    }

    const results = {
      success: true,
      synced: 0,
      failed: 0,
      details: [],
    };

    const agentFiles = fs.readdirSync(globalAgentsPath)
      .filter(file => file.endsWith('.md'));

    for (const agentFile of agentFiles) {
      const agentFilePath = path.join(globalAgentsPath, agentFile);
      const agentName = path.basename(agentFile, '.md');

      try {
        const syncResult = await this.syncAgentToGitHub(agentFilePath);

        if (syncResult.pushed) {
          results.synced++;
          results.details.push({
            agent: agentName,
            status: 'synced',
            message: 'Successfully synced to GitHub',
          });
        } else {
          results.details.push({
            agent: agentName,
            status: 'skipped',
            message: syncResult.message,
          });
        }
      } catch (error) {
        results.failed++;
        results.success = false;
        results.details.push({
          agent: agentName,
          status: 'failed',
          message: error.message,
        });
      }
    }

    return results;
  }

  async removeAgentFromGitHub(agentFilePath) {
    const os = require('os');
    const globalAgentsPath = path.join(os.homedir(), '.claude', 'agents');

    if (!agentFilePath.startsWith(globalAgentsPath)) {
      return {
        removed: false,
        message: 'Agent is project-specific, not synced to GitHub',
      };
    }

    const agentFileName = path.basename(agentFilePath);
    const targetPath = path.join('agents', agentFileName);
    const repoPath = git.getRepoPath();
    const fullTargetPath = path.join(repoPath, targetPath);

    if (!fs.existsSync(fullTargetPath)) {
      return {
        removed: false,
        message: 'Agent not found in GitHub repository',
      };
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const agentName = path.basename(agentFilePath, '.md');

      fs.unlinkSync(fullTargetPath);

      const result = await git.syncFile(
        fullTargetPath,
        `Remove agent: ${agentName} - ${today}`,
        targetPath,
        true
      );

      return { removed: true, message: 'Successfully removed agent from GitHub' };
    } catch (error) {
      throw new Error(`Failed to remove agent from GitHub: ${error.message}`);
    }
  }

  async removeSkillFromGitHub(skillFilePath) {
    const os = require('os');
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');

    if (!skillFilePath.startsWith(globalSkillsPath)) {
      return {
        removed: false,
        message: 'Skill is project-specific, not synced to GitHub',
      };
    }

    const relativePath = path.relative(globalSkillsPath, skillFilePath);
    const targetPath = path.join('skills', relativePath);
    const repoPath = git.getRepoPath();
    const fullTargetPath = path.join(repoPath, targetPath);

    if (!fs.existsSync(fullTargetPath)) {
      return {
        removed: false,
        message: 'Skill not found in GitHub repository',
      };
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const skillName = path.basename(path.dirname(skillFilePath));

      fs.unlinkSync(fullTargetPath);

      const skillDir = path.dirname(fullTargetPath);
      if (fs.existsSync(skillDir) && fs.readdirSync(skillDir).length === 0) {
        fs.rmdirSync(skillDir);
      }

      const result = await git.syncFile(
        fullTargetPath,
        `Remove skill: ${skillName} - ${today}`,
        targetPath,
        true
      );

      return { removed: true, message: 'Successfully removed skill from GitHub' };
    } catch (error) {
      throw new Error(`Failed to remove skill from GitHub: ${error.message}`);
    }
  }
}

module.exports = new Syncer();
