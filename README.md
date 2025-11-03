# Claude Sync

> Cross-platform CLI tool for automatic synchronization of CLAUDE.md files, Skills, and Agents across multiple projects with GitHub backup

[![npm version](https://img.shields.io/npm/v/@alucardeht/claude-sync.svg)](https://www.npmjs.com/package/@alucardeht/claude-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@alucardeht/claude-sync.svg)](https://nodejs.org)

## Overview

**Claude Sync** solves the problem of maintaining consistent `CLAUDE.md` configuration files across multiple projects. Instead of manually copying changes between projects, it automates synchronization while keeping project-specific rules separate.

### What It Does

- **Automatic sync** of global rules, skills, and agents across all your projects
- **Separates** shared rules (GLOBAL) from project-specific rules (PROJECT)
- **GitHub backup** of global rules, skills, and agents
- **Real-time watching** for automatic updates
- **Smart merging** generates final CLAUDE.md from GLOBAL + PROJECT
- **Cross-platform** support (macOS, Linux, Windows)

## Quick Start

```bash
# Install globally
npm install -g @alucardeht/claude-sync

# Run interactive setup
claude-sync init

# That's it! Changes are now synced automatically
# Edit CLAUDE-GLOBAL.md or skills and watch them sync
```

## Installation

**Prerequisites:** Node.js 16.0.0+, Git, GitHub account

```bash
npm install -g @alucardeht/claude-sync
```

## Configuration

### First-Time Setup

```bash
claude-sync init
```

The wizard will guide you through:
1. Authentication method (SSH or HTTPS with token)
2. GitHub repository (existing or new)
3. Initial workspaces (optional)

### File Structure

**Locally (each workspace):**
```
project/
├── CLAUDE-GLOBAL.md    ← Synced with GitHub
├── CLAUDE-PROJECT.md   ← Project-specific (local only)
└── CLAUDE.md           ← Auto-generated: GLOBAL + PROJECT
```

**On GitHub:**
```
your-repo/
├── CLAUDE.md           ← Contains global rules
├── skills/             ← Contains global skills
│   ├── agent-orchestration/
│   │   └── SKILL.md
│   └── ux-feedback-patterns/
│       └── SKILL.md
└── agents/             ← Contains global agents
    ├── ux-guardian.md
    ├── security-guardian.md
    └── workflow-guardian.md
```

## Usage

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
# Start daemon (auto-sync in background)
claude-sync start

# Stop daemon
claude-sync stop

# Restart daemon
claude-sync restart

# View logs
claude-sync logs

# Follow logs in real-time
claude-sync logs -f
```

### Manual Synchronization

```bash
# Sync all workspaces and push to GitHub
claude-sync sync

# Pull latest rules, skills, and agents from GitHub
claude-sync pull

# Watch for changes (foreground mode)
claude-sync watch
```

### Migration & Management

```bash
# Migrate existing CLAUDE.md to new structure
claude-sync migrate <workspace>

# Show configuration and status
claude-sync status

# Reset everything
claude-sync reset
```

## When to Use GLOBAL vs PROJECT

### CLAUDE-GLOBAL.md (Shared Rules)

Use for rules that apply to **ALL projects**:
- General coding style and conventions
- Git commit message patterns
- Code review guidelines
- Documentation standards
- General security best practices

**Example:**
```markdown
# Global Rules

## Commit Messages
- Use conventional commits: feat, fix, docs
- Keep subject line under 50 characters

## Code Style
- Use meaningful variable names
- Add comments for complex logic
```

### CLAUDE-PROJECT.md (Project-Specific Rules)

Use for rules **UNIQUE to each project**:
- Programming language specifics
- Framework conventions
- Project architecture
- API endpoints and database schemas
- Third-party libraries usage

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
```

**Important:** CLAUDE-PROJECT.md never leaves your machine. This prevents polluting shared rules with React-specific instructions when other projects use Python.

## Skills Synchronization

Claude Sync automatically synchronizes **Claude Code Skills** across all your machines.

### Global Skills (Shared)

**Location (auto-detected by platform):**
- macOS: `~/.claude/skills/`
- Linux: `~/.claude/skills/`
- Windows: `C:\Users\username\.claude\skills\`

**Behavior:**
- Automatically synced to GitHub when modified or created
- Pulled automatically when daemon starts
- Available across all projects and machines
- Backed up in `your-repo/skills/`

**Filename:** Both `SKILL.md` and `skill.md` are supported (case-insensitive)

**Example:**
```
~/.claude/skills/
├── agent-orchestration/
│   └── SKILL.md
├── ux-feedback-patterns/
│   └── SKILL.md
└── browser-testing/
    └── skill.md
```

### Project-Specific Skills (Local Only)

**Location:** `<workspace>/.claude/skills/`

**Behavior:**
- Detected by watcher
- NOT synced to GitHub (stays local)
- Useful for project-specific workflows

### How It Works

1. **On Daemon Start**: Automatically pulls latest skills from GitHub and syncs any existing local skills
2. **When You Create/Edit a Global Skill**:
   - Daemon detects new or modified file in `~/.claude/skills/*/SKILL.md`
   - Automatically pushes to GitHub
3. **When You Edit a Project Skill**:
   - Daemon detects change but doesn't sync to GitHub
   - Skill stays local to that project

## Agents Synchronization

Claude Sync automatically synchronizes **Claude Code Agents** across all your machines.

### Global Agents (Shared)

**Location (auto-detected by platform):**
- macOS: `~/.claude/agents/`
- Linux: `~/.claude/agents/`
- Windows: `C:\Users\username\.claude\agents\`

**Behavior:**
- Automatically synced to GitHub when modified or created
- Pulled automatically when daemon starts
- Available across all projects and machines
- Backed up in `your-repo/agents/`

**Example:**
```
~/.claude/agents/
├── ux-guardian.md
├── security-guardian.md
├── tech-lead-enforcer.md
├── workflow-guardian.md
├── context-optimizer.md
└── mobile-responsive-reviewer.md
```

### Project-Specific Agents (Local Only)

**Location:** `<workspace>/.claude/agents/`

**Behavior:**
- Detected by watcher
- NOT synced to GitHub (stays local)
- Useful for project-specific agent workflows

### How It Works

1. **On Daemon Start**: Automatically pulls latest agents from GitHub
2. **When You Create/Edit a Global Agent**:
   - Daemon detects new or modified file in `~/.claude/agents/*.md`
   - Automatically pushes to GitHub
3. **When You Edit a Project Agent**:
   - Daemon detects change but doesn't sync to GitHub
   - Agent stays local to that project

## Authentication

### Option 1: SSH (Recommended)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Copy public key and add to GitHub
cat ~/.ssh/id_ed25519.pub
# GitHub: Settings → SSH and GPG keys → New SSH key
```

### Option 2: HTTPS with Personal Access Token

1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Select scopes: ✅ `repo`
4. Copy token and use during `claude-sync init`

## Automatic Update Notifications

Claude Sync checks for new versions every 6 hours and notifies you when an update is available.

**Update manually:**
```bash
npm update -g @alucardeht/claude-sync
```

## Troubleshooting

### SSH authentication failed
1. Verify: `ssh -T git@github.com`
2. Check public key is added to GitHub
3. Try HTTPS with PAT instead

### Repository not found
1. Verify repository exists on GitHub
2. Check format: `owner/repo`
3. Ensure you have access

### Failed to push
1. Check internet connection
2. Verify GitHub credentials
3. Pull latest: `cd ~/.config/claude-sync/repo && git pull`

### Skills or Agents not syncing
1. Verify daemon is running: `claude-sync status`
2. For skills: Check filename is `SKILL.md` or `skill.md` (case-insensitive)
3. For agents: Check filename ends with `.md`
4. Verify files are in global directory (`~/.claude/skills/` or `~/.claude/agents/`)
5. Check logs: `claude-sync logs`
6. Try restarting daemon: `claude-sync restart`

## Contributing

Contributions are welcome! Submit a Pull Request.

**Development Setup:**
```bash
git clone https://github.com/alucardeht/claude-sync.git
cd claude-sync
npm install
npm link
```

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- [Report bugs](https://github.com/alucardeht/claude-sync/issues)
- [Request features](https://github.com/alucardeht/claude-sync/issues)
- [Documentation](https://github.com/alucardeht/claude-sync#readme)
