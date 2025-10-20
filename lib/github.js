const { Octokit } = require('octokit');

class GitHubManager {
  constructor() {
    this.octokit = null;
  }

  async validateToken(token) {
    try {
      const octokit = new Octokit({ auth: token });
      const { data } = await octokit.rest.users.getAuthenticated();
      return { valid: true, username: data.login, name: data.name };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async checkRepo(owner, repo, token = null) {
    try {
      const config = token ? { auth: token } : {};
      const octokit = new Octokit(config);

      const { data } = await octokit.rest.repos.get({
        owner,
        repo,
      });

      return {
        exists: true,
        private: data.private,
        url: data.html_url,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        fullName: data.full_name,
      };
    } catch (error) {
      if (error.status === 404) {
        return { exists: false };
      }
      throw new Error(`Failed to check repository: ${error.message}`);
    }
  }

  async createRepo(name, token, isPrivate = true) {
    try {
      const octokit = new Octokit({ auth: token });

      const { data } = await octokit.rest.repos.createForAuthenticatedUser({
        name,
        private: isPrivate,
        description: 'Global CLAUDE.md synchronization repository',
        auto_init: true,
      });

      return {
        created: true,
        url: data.html_url,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        fullName: data.full_name,
      };
    } catch (error) {
      if (error.status === 422) {
        throw new Error('Repository already exists');
      }
      throw new Error(`Failed to create repository: ${error.message}`);
    }
  }

  parseRepoUrl(url) {
    const patterns = [
      /github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/,
      /^([^/]+)\/([^/]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace('.git', ''),
        };
      }
    }

    return null;
  }

  buildRepoUrl(owner, repo, authMethod = 'ssh') {
    if (authMethod === 'ssh') {
      return `git@github.com:${owner}/${repo}.git`;
    }
    return `https://github.com/${owner}/${repo}.git`;
  }
}

module.exports = new GitHubManager();
