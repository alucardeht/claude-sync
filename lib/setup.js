const inquirer = require('inquirer');
const chalk = require('chalk');
const boxen = require('boxen');
const config = require('./config');
const github = require('./github');
const auth = require('./auth');
const git = require('./git');

class SetupWizard {
  async run() {
    console.log(
      boxen(chalk.bold.blue('Claude Sync Setup Wizard'), {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })
    );

    console.log(chalk.gray('This wizard will help you configure claude-sync for the first time.\n'));

    if (config.exists()) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Configuration already exists. Do you want to overwrite it?',
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.yellow('\n⚠ Setup cancelled'));
        return;
      }

      config.reset();
      await git.reset();
    }

    const authMethod = await this.selectAuthMethod();
    const repoInfo = await this.configureRepository(authMethod);
    await this.initializeRepository(repoInfo);
    await this.addInitialWorkspaces();

    console.log(
      boxen(chalk.green.bold('✓ Setup Complete!'), {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    );

    const workspaces = config.listWorkspaces();

    if (workspaces && workspaces.length > 0) {
      const { startDaemon } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'startDaemon',
          message: 'Start file watcher in background now?',
          default: true,
        },
      ]);

      if (startDaemon) {
        const pm2 = require('pm2');
        const path = require('path');

        console.log(chalk.gray('\nStarting daemon...'));

        await new Promise((resolve, reject) => {
          pm2.connect((err) => {
            if (err) {
              reject(err);
              return;
            }

            pm2.start(
              {
                script: path.join(__dirname, 'daemon.js'),
                name: 'claude-sync',
                autorestart: true,
                max_restarts: 10,
                min_uptime: '10s',
              },
              (err) => {
                pm2.disconnect();

                if (err) {
                  if (err.message && err.message.includes('already exists')) {
                    console.log(chalk.green('\n✓ Daemon already running'));
                  } else {
                    reject(err);
                  }
                } else {
                  console.log(chalk.green('\n✓ Daemon started successfully'));
                  console.log(chalk.gray('\nAutomatic synchronization enabled:'));
                  console.log(chalk.gray('  • CLAUDE-GLOBAL.md → GitHub (as CLAUDE.md) → All workspaces'));
                  console.log(chalk.gray('  • CLAUDE-PROJECT.md → Local CLAUDE.md only (never pushed)\n'));
                }

                resolve();
              }
            );
          });
        });

        console.log(chalk.blue('\nUseful commands:'));
        console.log(chalk.gray('  claude-sync stop      Stop the daemon'));
        console.log(chalk.gray('  claude-sync restart   Restart the daemon'));
        console.log(chalk.gray('  claude-sync logs -f   View live logs'));
        console.log(chalk.gray('  claude-sync pull      Pull latest global rules from GitHub'));
        console.log(chalk.gray('  claude-sync status    Show status\n'));
      } else {
        console.log(chalk.blue('\nNext steps:'));
        console.log(chalk.gray('  claude-sync start     Start background daemon'));
        console.log(chalk.gray('  claude-sync sync      Manual sync'));
        console.log(chalk.gray('  claude-sync watch     Foreground watcher\n'));
      }
    } else {
      console.log(chalk.blue('\nNext steps:'));
      console.log(chalk.gray('  1. Add workspaces: claude-sync add <path>'));
      console.log(chalk.gray('  2. Start daemon: claude-sync start'));
      console.log(chalk.gray('  3. Or manual sync: claude-sync sync\n'));
    }
  }

  async selectAuthMethod() {
    console.log(chalk.blue.bold('\n📝 Step 1: Authentication Method\n'));

    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'How do you want to authenticate with GitHub?',
        choices: [
          {
            name: 'SSH (Recommended for development)',
            value: 'ssh',
          },
          {
            name: 'HTTPS with Personal Access Token',
            value: 'https',
          },
        ],
      },
    ]);

    if (method === 'ssh') {
      await this.setupSSH();
    }

    return method;
  }

  async setupSSH() {
    const keys = await auth.checkSSHKeys();

    if (keys.length === 0) {
      console.log(chalk.yellow('\n⚠ No SSH keys found'));
      console.log(chalk.gray(auth.getSSHSetupInstructions()));

      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Have you completed the SSH setup?',
          default: false,
        },
      ]);

      if (!proceed) {
        throw new Error('SSH setup required');
      }
    } else {
      console.log(chalk.green('\n✓ SSH keys found:'));
      keys.forEach((key) => {
        console.log(chalk.gray(`  - ${key.name} ${key.publicKey ? '(with public key)' : ''}`));
      });
    }

    const testResult = await auth.testSSHConnection();

    if (!testResult.success) {
      console.log(chalk.red('\n✗ SSH authentication failed'));
      console.log(chalk.gray(testResult.message));
      console.log(chalk.gray(auth.getSSHSetupInstructions()));

      throw new Error('SSH authentication failed');
    }

    console.log(chalk.green('\n✓ SSH authentication successful'));
  }

  async configureRepository(authMethod) {
    console.log(chalk.blue.bold('\n📦 Step 2: GitHub Repository\n'));

    const { repoInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'repoInput',
        message: 'Enter your GitHub repository (owner/repo or full URL):',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'Repository is required';
          }
          return true;
        },
      },
    ]);

    const parsed = github.parseRepoUrl(repoInput);

    if (!parsed) {
      throw new Error('Invalid repository format');
    }

    console.log(chalk.gray(`\nChecking repository: ${parsed.owner}/${parsed.repo}...`));

    let token = null;

    if (authMethod === 'https') {
      console.log(chalk.yellow('\n📝 Personal Access Token Required'));
      console.log(chalk.gray(auth.getPATSetupInstructions()));

      const { tokenInput } = await inquirer.prompt([
        {
          type: 'password',
          name: 'tokenInput',
          message: 'Enter your GitHub Personal Access Token:',
          mask: '*',
        },
      ]);

      const validation = await auth.validatePAT(tokenInput);

      if (!validation.valid) {
        throw new Error(`Invalid token: ${validation.error}`);
      }

      console.log(chalk.green(`\n✓ Token validated for user: ${validation.username}`));
      token = tokenInput;
    }

    const repoCheck = await github.checkRepo(parsed.owner, parsed.repo, token);

    if (!repoCheck.exists) {
      console.log(chalk.yellow('\n⚠ Repository does not exist'));

      if (authMethod === 'ssh') {
        console.log(chalk.gray('\nWith SSH authentication, you need to create the repository manually.'));
        console.log(chalk.gray('Please create it at: https://github.com/new'));
        console.log(chalk.gray(`Repository name: ${parsed.repo}`));
        console.log(chalk.gray('Visibility: Private (recommended)\n'));

        const { repoCreated } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'repoCreated',
            message: 'Have you created the repository?',
            default: false,
          },
        ]);

        if (!repoCreated) {
          throw new Error('Repository creation required. Please create it and run claude-sync init again.');
        }

        const repoUrl = `git@github.com:${parsed.owner}/${parsed.repo}.git`;

        return {
          owner: parsed.owner,
          repo: parsed.repo,
          url: repoUrl,
          authMethod,
          token: null,
        };
      }

      const { createRepo } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'createRepo',
          message: 'Do you want to create it automatically?',
          default: true,
        },
      ]);

      if (!createRepo) {
        throw new Error('Repository required');
      }

      console.log(chalk.gray('\nCreating repository...'));

      const created = await github.createRepo(parsed.repo, token, true);

      console.log(chalk.green(`✓ Repository created: ${created.url}`));

      return {
        owner: parsed.owner,
        repo: parsed.repo,
        url: authMethod === 'ssh' ? created.sshUrl : created.cloneUrl,
        authMethod,
        token,
      };
    }

    console.log(chalk.green(`\n✓ Repository found: ${repoCheck.url}`));

    const repoUrl = authMethod === 'ssh' ? repoCheck.sshUrl : repoCheck.cloneUrl;

    return {
      owner: parsed.owner,
      repo: parsed.repo,
      url: repoUrl,
      authMethod,
      token,
    };
  }

  async initializeRepository(repoInfo) {
    console.log(chalk.blue.bold('\n🚀 Step 3: Initialize Local Repository\n'));

    console.log(chalk.gray('Cloning repository...'));

    try {
      await git.init(repoInfo.url, repoInfo.authMethod, repoInfo.token);

      console.log(chalk.green('✓ Repository initialized'));

      config.create({
        github: {
          repo: repoInfo.repo,
          owner: repoInfo.owner,
          authMethod: repoInfo.authMethod,
          token: repoInfo.token,
        },
      });

      console.log(chalk.green('✓ Configuration saved'));
    } catch (error) {
      throw new Error(`Failed to initialize repository: ${error.message}`);
    }
  }

  async addInitialWorkspaces() {
    console.log(chalk.blue.bold('\n📁 Step 4: Add Workspaces (Optional)\n'));

    const { addNow } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addNow',
        message: 'Do you want to add workspaces now?',
        default: true,
      },
    ]);

    if (!addNow) {
      return;
    }

    let continueAdding = true;

    while (continueAdding) {
      const { workspacePath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'workspacePath',
          message: 'Enter workspace path (absolute or relative):',
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return 'Path is required';
            }
            return true;
          },
        },
      ]);

      try {
        const added = config.addWorkspace(workspacePath);
        console.log(chalk.green(`✓ Added workspace: ${added}`));
      } catch (error) {
        console.log(chalk.red(`✗ Error: ${error.message}`));
      }

      const { addMore } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addMore',
          message: 'Add another workspace?',
          default: false,
        },
      ]);

      continueAdding = addMore;
    }
  }
}

module.exports = new SetupWizard();
