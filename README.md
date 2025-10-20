# 🔄 Claude Sync

> Cross-platform CLI tool for automatic synchronization of CLAUDE.md files across multiple projects with GitHub backup

[![npm version](https://img.shields.io/npm/v/claude-sync.svg)](https://www.npmjs.com/package/claude-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/claude-sync.svg)](https://nodejs.org)

---

## 📖 Overview

**Claude Sync** is a developer tool designed to solve a common problem: maintaining consistent `CLAUDE.md` configuration files across multiple projects. Instead of manually copying and pasting changes between projects, Claude Sync automates the entire process.

### The Problem It Solves

If you work with Claude Code on multiple projects, you've probably experienced:
- ❌ Manually copying `CLAUDE.md` changes across projects
- ❌ Forgetting to update some projects
- ❌ Inconsistent configurations between projects
- ❌ No backup of your configuration files

### The Solution

Claude Sync provides:
- ✅ **Automatic synchronization** across all your projects
- ✅ **GitHub backup** with version control
- ✅ **File watching** for real-time updates
- ✅ **Global + Project-specific** configuration merging
- ✅ **Cross-platform** support (macOS, Linux, Windows)

---

## ✨ Features

- 🚀 **Interactive Setup Wizard** - Easy configuration with step-by-step guidance
- 🔐 **Flexible Authentication** - Support for SSH keys or HTTPS with Personal Access Token
- 👀 **File Watcher** - Automatic sync when files change
- 🔄 **Smart Merging** - Combines global and project-specific configurations
- 📦 **GitHub Backup** - Automatic push to your private repository
- 🎨 **Beautiful CLI** - Colored output with progress indicators
- 🌍 **Cross-platform** - Works on macOS, Linux, and Windows

---

## 🚀 Quick Start

```bash
# Install globally
npm install -g claude-sync

# Run interactive setup
claude-sync init

# Add your first workspace
claude-sync add ~/my-project

# Start watching for changes
claude-sync watch
```

---

## 📦 Installation

### Prerequisites

- **Node.js** 16.0.0 or higher
- **Git** installed and configured
- **GitHub account** with repository access

### Global Installation

```bash
npm install -g claude-sync
```

### Verify Installation

```bash
claude-sync --version
claude-sync --help
```

---

## 🔧 Configuration

### First-Time Setup

Run the interactive setup wizard:

```bash
claude-sync init
```

The wizard will guide you through:

1. **Authentication Method**
   - SSH (recommended for development)
   - HTTPS with Personal Access Token

2. **GitHub Repository**
   - Use existing repository
   - Create new private repository

3. **Initial Workspaces** (optional)
   - Add projects to sync

### Configuration Files

Claude Sync uses a simple file structure:

```
~/.config/claude-sync/
├── config.json          # Main configuration
└── repo/                # Local clone of GitHub repository
```

### File Naming Convention

- `CLAUDE-GLOBAL.md` - Shared configuration across all projects
- `CLAUDE-PROJECT.md` - Project-specific configuration
- `CLAUDE.md` - Final merged file (auto-generated)

---

## 💡 Usage

### Managing Workspaces

```bash
# Add a workspace
claude-sync add ~/projects/backend

# List all workspaces
claude-sync list

# Remove a workspace
claude-sync remove ~/projects/backend
```

### Synchronization

```bash
# Manual sync (all workspaces)
claude-sync sync

# Watch for changes (real-time sync)
claude-sync watch
```

### Status & Information

```bash
# Show configuration and sync status
claude-sync status

# Display help
claude-sync --help

# Show version
claude-sync --version
```

### Reset Configuration

```bash
# Reset everything (destructive operation)
claude-sync reset
```

---

## 📚 How It Works

### Sync Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. File Watcher detects change in CLAUDE-GLOBAL.md         │
│     or CLAUDE-PROJECT.md                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Syncer merges:                                           │
│     CLAUDE-GLOBAL.md + CLAUDE-PROJECT.md → CLAUDE.md        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Git commits and pushes to GitHub repository             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. All other workspaces can pull latest changes            │
└─────────────────────────────────────────────────────────────┘
```

### File Merging

The final `CLAUDE.md` is generated by merging:

```markdown
<!-- Content from CLAUDE-GLOBAL.md -->
[Global configuration shared across all projects]

---

# Project-Specific Configuration

<!-- Content from CLAUDE-PROJECT.md -->
[Project-specific overrides and additions]
```

---

## 🔐 Authentication

### Option 1: SSH (Recommended)

**Pros:**
- No token management
- More secure for local development
- No expiration

**Setup:**

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Start SSH agent
eval "$(ssh-agent -s)"

# Add key to agent
ssh-add ~/.ssh/id_ed25519

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings → SSH and GPG keys → New SSH key
```

### Option 2: HTTPS with Personal Access Token

**Pros:**
- Works in environments without SSH
- Better for CI/CD

**Setup:**

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Select scopes: ✅ `repo` (Full control of private repositories)
4. Copy token and use during `claude-sync init`

---

## 🛠️ Troubleshooting

### "SSH authentication failed"

**Solution:**
1. Ensure SSH keys are configured: `ssh -T git@github.com`
2. Check that public key is added to GitHub
3. Try HTTPS with PAT instead

### "Repository not found"

**Solution:**
1. Verify repository exists on GitHub
2. Check repository name format: `owner/repo`
3. Ensure you have access to the repository

### "No changes to commit"

**Solution:**
- This is normal if files haven't changed
- The watcher only syncs when files are modified

### "Failed to push"

**Solution:**
1. Check internet connection
2. Verify GitHub credentials
3. Pull latest changes: `cd ~/.config/claude-sync/repo && git pull`

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Clone repository
git clone https://github.com/alucardeht/claude-sync.git
cd claude-sync

# Install dependencies
npm install

# Link locally for testing
npm link

# Test the CLI
claude-sync --help
```

### Running Tests

```bash
npm test
```

---

## 📝 Examples

### Example 1: Single Developer with Multiple Projects

```bash
# Initial setup
claude-sync init

# Add all your projects
claude-sync add ~/work/api-backend
claude-sync add ~/work/web-frontend
claude-sync add ~/work/mobile-app

# Start watching
claude-sync watch

# Now edit CLAUDE-GLOBAL.md in any project
# Changes automatically sync to all projects and GitHub
```

### Example 2: Team Collaboration

```bash
# Developer A: Sets up and pushes to GitHub
claude-sync init
claude-sync add ~/projects/team-repo
# Edit CLAUDE-GLOBAL.md
claude-sync sync

# Developer B: Uses the same GitHub repo
claude-sync init  # Point to same repository
claude-sync add ~/projects/team-repo
claude-sync sync  # Pull latest changes
```

### Example 3: Project-Specific Overrides

```bash
# Add workspace
claude-sync add ~/projects/special-project

# In ~/projects/special-project/:
# - Create CLAUDE-GLOBAL.md (shared rules)
# - Create CLAUDE-PROJECT.md (project-specific rules)

# Run sync
claude-sync sync

# Result: CLAUDE.md contains both files merged
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- Built with [Commander.js](https://github.com/tj/commander.js) for CLI
- File watching powered by [Chokidar](https://github.com/paulmillr/chokidar)
- GitHub integration using [Octokit](https://github.com/octokit/octokit.js)
- Git operations via [simple-git](https://github.com/steveukx/git-js)

---

## 📧 Support

- 🐛 [Report bugs](https://github.com/alucardeht/claude-sync/issues)
- 💡 [Request features](https://github.com/alucardeht/claude-sync/issues)
- 📖 [Documentation](https://github.com/alucardeht/claude-sync#readme)

---

**Made with ❤️ for Claude Code users**
