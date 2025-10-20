# 🔄 Claude Sync

> Cross-platform CLI tool for automatic synchronization of CLAUDE.md files across multiple projects with GitHub backup

[![npm version](https://img.shields.io/npm/v/@alucardeht/claude-sync.svg)](https://www.npmjs.com/package/@alucardeht/claude-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@alucardeht/claude-sync.svg)](https://nodejs.org)

---

## 📖 Overview

**Claude Sync** is a developer tool designed to solve a common problem: maintaining consistent `CLAUDE.md` configuration files across multiple projects. Instead of manually copying and pasting changes between projects, Claude Sync automates the entire process while keeping project-specific rules separate.

### The Problem It Solves

If you work with Claude Code on multiple projects, you've probably experienced:
- ❌ Manually copying `CLAUDE.md` changes across projects
- ❌ Forgetting to update some projects
- ❌ Inconsistent configurations between projects
- ❌ Mixing global rules with project-specific rules
- ❌ Python rules appearing in JavaScript projects (and vice versa)
- ❌ No backup of your configuration files

### The Solution

Claude Sync provides:
- ✅ **Automatic synchronization** of global rules across all your projects
- ✅ **Separation** of shared rules (GLOBAL) from project-specific rules (PROJECT)
- ✅ **GitHub backup** storing only shared rules as standard `CLAUDE.md`
- ✅ **File watching** for real-time updates
- ✅ **Smart merging** generates final CLAUDE.md from GLOBAL + PROJECT
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
# 1. Install globally
npm install -g @alucardeht/claude-sync

# 2. Run interactive setup (will offer to start daemon automatically)
claude-sync init

# 3. That's it! Changes are now synced automatically 🎉
#    Edit CLAUDE-GLOBAL.md or CLAUDE-PROJECT.md and watch them sync!

# Optional: View logs
claude-sync logs -f
```

---

## 📦 Installation

### Prerequisites

- **Node.js** 16.0.0 or higher
- **Git** installed and configured
- **GitHub account** with repository access

### Global Installation

```bash
npm install -g @alucardeht/claude-sync
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

### Background Daemon (Recommended)

```bash
# Start daemon in background (auto-sync)
claude-sync start

# Stop daemon
claude-sync stop

# Restart daemon
claude-sync restart

# View daemon logs
claude-sync logs

# Follow logs in real-time
claude-sync logs -f
```

### Manual Synchronization

```bash
# Manual sync (regenerate all CLAUDE.md and push GLOBAL to GitHub)
claude-sync sync

# Pull latest global rules from GitHub
claude-sync pull

# Watch for changes (foreground mode - blocks terminal)
claude-sync watch
```

### Migration & Management

```bash
# Migrate existing CLAUDE.md to new structure
claude-sync migrate <workspace>

# Show configuration and sync status
claude-sync status

# Reset everything (destructive operation)
claude-sync reset
```

### Help & Information

```bash
# Display help
claude-sync --help

# Show version
claude-sync --version
```

---

## 🎯 When to Use GLOBAL vs PROJECT

### CLAUDE-GLOBAL.md (Shared Rules)

Use for rules that apply to **ALL your projects**:

- ✅ General coding style and conventions
- ✅ Git commit message patterns
- ✅ Code review guidelines
- ✅ Documentation standards
- ✅ General security best practices
- ✅ Team collaboration rules

**Example:**
```markdown
# Global Rules

## Commit Messages
- Use conventional commits: feat, fix, docs, etc.
- Keep subject line under 50 characters

## Code Style
- Use meaningful variable names
- Add comments for complex logic
```

### CLAUDE-PROJECT.md (Project-Specific Rules)

Use for rules that are **UNIQUE to each project**:

- ✅ Programming language specifics (Python, JavaScript, Go, etc.)
- ✅ Framework conventions (React, Django, Express, etc.)
- ✅ Project architecture and folder structure
- ✅ API endpoints and database schemas
- ✅ Environment-specific configurations
- ✅ Third-party libraries and their usage

**Example:**
```markdown
# Project-Specific Rules

## Technology Stack
- Backend: Node.js + Express
- Database: PostgreSQL
- ORM: Prisma

## Architecture
- Follow MVC pattern
- Controllers in /src/controllers
- Models in /src/models
```

### ⚠️ Important Notes

- **CLAUDE-PROJECT.md never leaves your machine** - it's local only
- This prevents polluting shared rules with React-specific instructions when other projects use Python
- Each project can have completely different CLAUDE-PROJECT.md files
- The merged CLAUDE.md is also local and auto-generated

---

## 📚 How It Works

### File Structure

**On GitHub:**
```
your-repo/
└── CLAUDE.md  ← Contains your global rules (shared across all projects)
```

**Locally (each workspace):**
```
project-a/
├── CLAUDE-GLOBAL.md    ← Synced with GitHub/CLAUDE.md
├── CLAUDE-PROJECT.md   ← Project-specific rules (never pushed to GitHub)
└── CLAUDE.md           ← Generated: GLOBAL + PROJECT
```

### Sync Flow

**When CLAUDE-GLOBAL.md changes:**
```
┌─────────────────────────────────────────────────────────────┐
│  1. File Watcher detects change in CLAUDE-GLOBAL.md         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Regenerate local CLAUDE.md (GLOBAL + PROJECT)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Push CLAUDE-GLOBAL.md to GitHub (saved as CLAUDE.md)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Propagate to all other workspaces as CLAUDE-GLOBAL.md   │
└─────────────────────────────────────────────────────────────┘
```

**When CLAUDE-PROJECT.md changes:**
```
┌─────────────────────────────────────────────────────────────┐
│  1. File Watcher detects change in CLAUDE-PROJECT.md        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Regenerate local CLAUDE.md (GLOBAL + PROJECT)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Done! (Project rules stay local, never pushed)          │
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

### Key Concepts

- ✅ **CLAUDE-GLOBAL.md**: Shared rules (coding style, commit patterns, etc.) → Synced to GitHub as `CLAUDE.md`
- ✅ **CLAUDE-PROJECT.md**: Project-specific rules (language, framework, architecture) → Stays local, never pushed
- ✅ **CLAUDE.md**: Auto-generated merged file used by Claude Code

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

### Example 1: First Time Setup

```bash
# 1. Run setup wizard
claude-sync init
# → Choose SSH authentication
# → Configure GitHub repo
# → Add workspaces during setup
# → Choose "Yes" to start daemon automatically ✅

# 2. That's it! Daemon is running in background
# Edit CLAUDE-GLOBAL.md → Automatically synced to all projects + GitHub 🎉
```

### Example 2: Migrating Existing Project

```bash
# You already have CLAUDE.md in your project
cd ~/my-existing-project

# Add workspace (will show migration warning)
claude-sync add ~/my-existing-project

# Migrate to new structure
claude-sync migrate ~/my-existing-project

# Manually curate:
# 1. Open CLAUDE-PROJECT.md
# 2. Move global rules to CLAUDE-GLOBAL.md
# 3. Save files

# If daemon is running → Syncs automatically
# If not → claude-sync start
```

### Example 3: Team Collaboration

```bash
# Developer A: Initial setup
claude-sync init
# Daemon starts automatically
# Edit CLAUDE-GLOBAL.md → Auto-synced to GitHub

# Developer B: Join same repository
claude-sync init
# Point to same GitHub repo (e.g., team/claude-rules)
# Add same workspaces
# Pull latest rules automatically

# Both devs now share same CLAUDE-GLOBAL.md! 🤝
```

### Example 4: Daily Workflow

```bash
# Daemon runs in background (started during init)
# Just edit files normally:

# Edit global rules (all projects)
vim ~/project-a/CLAUDE-GLOBAL.md
# → Auto-synced to project-b, project-c, and GitHub

# Edit project-specific rules
vim ~/project-a/CLAUDE-PROJECT.md
# → Only affects project-a, also synced to GitHub

# Check if everything is working
claude-sync logs -f
claude-sync status
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
