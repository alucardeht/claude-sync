const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class AuthManager {
  async checkSSHKeys() {
    const sshDir = path.join(os.homedir(), '.ssh');
    const keyFiles = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa'];

    const existingKeys = [];

    if (fs.existsSync(sshDir)) {
      for (const keyFile of keyFiles) {
        const keyPath = path.join(sshDir, keyFile);
        if (fs.existsSync(keyPath)) {
          existingKeys.push({
            path: keyPath,
            name: keyFile,
            publicKey: fs.existsSync(`${keyPath}.pub`),
          });
        }
      }
    }

    return existingKeys;
  }

  async testSSHConnection() {
    try {
      const { stdout, stderr } = await execAsync('ssh -T git@github.com', {
        timeout: 10000,
      });

      const output = stdout + stderr;

      if (output.includes('successfully authenticated')) {
        return { success: true, message: 'SSH authentication successful' };
      }

      return { success: false, message: output };
    } catch (error) {
      const errorOutput = error.stdout + error.stderr;

      if (errorOutput.includes('successfully authenticated')) {
        return { success: true, message: 'SSH authentication successful' };
      }

      return { success: false, message: errorOutput };
    }
  }

  getSSHSetupInstructions() {
    return `
SSH Key Setup Instructions:

1. Generate a new SSH key (if you don't have one):
   ssh-keygen -t ed25519 -C "your_email@example.com"

2. Start the SSH agent:
   eval "$(ssh-agent -s)"

3. Add your SSH key to the agent:
   ssh-add ~/.ssh/id_ed25519

4. Copy your public key:
   cat ~/.ssh/id_ed25519.pub

5. Add the key to your GitHub account:
   - Go to GitHub.com → Settings → SSH and GPG keys
   - Click "New SSH key"
   - Paste your public key and save

6. Test the connection:
   ssh -T git@github.com

More info: https://docs.github.com/en/authentication/connecting-to-github-with-ssh
`;
  }

  getPATSetupInstructions() {
    return `
Personal Access Token (PAT) Setup Instructions:

1. Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. Click "Generate new token" → "Generate new token (classic)"

3. Give your token a descriptive name (e.g., "claude-sync")

4. Select scopes/permissions:
   ✓ repo (Full control of private repositories)

5. Click "Generate token"

6. IMPORTANT: Copy your token immediately! You won't be able to see it again.

7. Use this token when claude-sync prompts for it

More info: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token
`;
  }

  async validatePAT(token) {
    const github = require('./github');
    return await github.validateToken(token);
  }

  maskToken(token) {
    if (!token || token.length < 8) {
      return '***';
    }
    return token.substring(0, 4) + '...' + token.substring(token.length - 4);
  }
}

module.exports = new AuthManager();
