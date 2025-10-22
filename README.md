# 🔄 Claude Sync

> Cross-platform CLI tool for automatic synchronization of CLAUDE.md files and Skills across multiple projects with GitHub backup

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
- ✅ **Automatic synchronization** of global rules and skills across all your projects
- ✅ **Separation** of shared rules (GLOBAL) from project-specific rules (PROJECT)
- ✅ **Skills sync** automatically backs up global skills to GitHub
- ✅ **GitHub backup** storing only shared rules and skills
- ✅ **File watching** for real-time updates
- ✅ **Smart merging** generates final CLAUDE.md from GLOBAL + PROJECT
- ✅ **Cross-platform** support (macOS, Linux, Windows)

---

## ✨ Features

- 🚀 **Interactive Setup Wizard** - Easy configuration with step-by-step guidance
- 🔐 **Flexible Authentication** - Support for SSH keys or HTTPS with Personal Access Token
- 👀 **File Watcher** - Automatic sync when files or skills change
- 🔄 **Smart Merging** - Combines global and project-specific configurations
- 🎯 **Skills Sync** - Automatically syncs Claude Code skills across machines
- 📦 **GitHub Backup** - Automatic push of global rules and skills to your repository
- 🔔 **Update Notifications** - Automatic check for new versions with smart rate limiting
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
#    - Daemon automatically pulls latest rules and skills from GitHub on start
#    - Edit CLAUDE-GLOBAL.md or skills and watch them sync!
#    - Works on macOS, Linux, and Windows

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
# → Automatically pulls latest CLAUDE-GLOBAL.md and skills from GitHub
# → Watches for changes in real-time

# Stop daemon
claude-sync stop

# Restart daemon
claude-sync restart
# → Also pulls latest changes on restart

# View daemon logs
claude-sync logs

# Follow logs in real-time
claude-sync logs -f
```

> **Important:** When the daemon starts or restarts, it automatically pulls the latest changes from GitHub. This ensures you always have the most up-to-date rules and skills!

### Manual Synchronization

```bash
# Manual sync (regenerate all CLAUDE.md and push GLOBAL to GitHub)
claude-sync sync

# Pull latest global rules and skills from GitHub
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

## 🎯 Skills Synchronization

Claude Sync also automatically synchronizes **Claude Code Skills** across all your machines!

### Global Skills (Shared Across All Projects)

**Location (automatically detected by platform):**
- **macOS**: `/Users/username/.claude/skills/`
- **Linux**: `/home/username/.claude/skills/`
- **Windows**: `C:\Users\username\.claude\skills\`

**Behavior:**
- ✅ Automatically synced to GitHub when modified
- ✅ Pulled automatically when daemon starts
- ✅ Available across all your projects and machines
- ✅ Backed up in `your-repo/skills/` directory

> **Note:** The daemon uses `os.homedir()` to automatically find the correct path for your operating system. You don't need to configure anything!

**Example Structure:**
```
~/.claude/skills/
├── agent-orchestration/
│   └── SKILL.md
├── ux-feedback-patterns/
│   └── SKILL.md
└── browser-testing/
    └── SKILL.md
```

### Project-Specific Skills (Local Only)

**Location:** `<workspace>/.claude/skills/`

**Behavior:**
- ✅ Detected by the watcher
- ❌ **NOT synced to GitHub** (stays local)
- ✅ Useful for project-specific workflows

**Example:**
```
my-project/
└── .claude/
    └── skills/
        └── project-workflow/
            └── SKILL.md
```

### How It Works

1. **On Daemon Start**: Automatically pulls latest skills from GitHub
2. **When You Edit a Global Skill**:
   - Daemon detects change in `~/.claude/skills/*/SKILL.md`
   - Pushes to GitHub under `skills/` directory
   - Other machines pull automatically on next daemon start
3. **When You Edit a Project Skill**:
   - Daemon detects change but doesn't sync to GitHub
   - Skill stays local to that project only

### Manual Pull

```bash
# Pull latest skills and rules from GitHub
claude-sync pull
```

This command updates both CLAUDE-GLOBAL.md and all global skills.

---

## 📚 How It Works

### File Structure

**On GitHub:**
```
your-repo/
├── CLAUDE.md  ← Contains your global rules (shared across all projects)
└── skills/    ← Contains your global skills
    ├── agent-orchestration/
    │   └── SKILL.md
    └── ux-feedback-patterns/
        └── SKILL.md
```

**Locally (each workspace):**
```
project-a/
├── CLAUDE-GLOBAL.md    ← Synced with GitHub/CLAUDE.md
├── CLAUDE-PROJECT.md   ← Project-specific rules (never pushed to GitHub)
├── CLAUDE.md           ← Generated: GLOBAL + PROJECT
└── .claude/
    └── skills/         ← Project-specific skills (optional, local only)
        └── custom-workflow/
            └── SKILL.md

~/.claude/              ← Global Claude Code directory
└── skills/             ← Global skills (synced to GitHub)
    ├── agent-orchestration/
    │   └── SKILL.md
    └── browser-testing/
        └── SKILL.md
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

## 🔔 Automatic Update Notifications

Claude Sync automatically checks for new versions and notifies you when an update is available.

### How It Works

- ✅ **Smart Rate Limiting**: Checks for updates every 6 hours maximum
- ✅ **Non-Blocking**: Never slows down your commands (2-second timeout)
- ✅ **NPM Registry**: Fetches latest version from official NPM
- ✅ **Beautiful Notifications**: Clear, easy-to-read update banner
- ✅ **Privacy-Friendly**: No tracking, just version comparison

### When Updates Are Checked

Updates are checked automatically:
- When you run any `claude-sync` command (add, list, sync, etc.)
- Only if 6+ hours have passed since last check
- Only if you haven't already been notified about that version

### Update Notification Example

```
╭───────────────────────────────────────────╮
│                                           │
│         🎉 New version available!         │
│                                           │
│          Current version:  1.0.4          │
│          Latest version:   1.0.5          │
│                                           │
│              Run to update:               │
│   npm update -g @alucardeht/claude-sync   │
│                                           │
╰───────────────────────────────────────────╯
```

### Manual Update

You can always update manually anytime:

```bash
npm update -g @alucardeht/claude-sync
```

### Disable Update Checks (Optional)

If you want to disable update checks, you can delete the cache file:

```bash
rm ~/.config/claude-sync/last-update-check.json
```

Note: The check will run again next time, but you can keep deleting it if needed.

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
