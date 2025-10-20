# Contributing to Claude Sync

First off, thank you for considering contributing to Claude Sync! 🎉

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, they should reciprocate that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. Be kind, respectful, and considerate in all interactions.

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- Git
- GitHub account
- Basic understanding of CLI tools

### Good First Issues

Look for issues labeled with `good first issue` or `help wanted`. These are great starting points for new contributors.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates.

**How to Submit a Good Bug Report:**

- Use a clear and descriptive title
- Describe the exact steps to reproduce the problem
- Provide specific examples to demonstrate the steps
- Describe the behavior you observed and what you expected
- Include screenshots if relevant
- Include your environment details:
  - OS and version
  - Node.js version
  - claude-sync version

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Run command '...'
2. See error

**Expected behavior**
What you expected to happen.

**Environment**
- OS: [e.g. macOS 14.0]
- Node.js: [e.g. 18.0.0]
- claude-sync: [e.g. 1.0.0]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Features

Feature requests are welcome! Please provide:

- A clear and descriptive title
- A detailed description of the proposed feature
- Explain why this feature would be useful
- Provide examples of how it would work

### Improving Documentation

Documentation improvements are always appreciated:

- Fix typos or grammatical errors
- Clarify confusing sections
- Add missing information
- Provide better examples

## Development Setup

1. **Fork the repository**

   Click the "Fork" button on GitHub

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-sync.git
   cd claude-sync
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Link for local testing**

   ```bash
   npm link
   ```

5. **Create a branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

6. **Make your changes**

   Write your code, add tests if applicable

7. **Test your changes**

   ```bash
   # Test the CLI
   claude-sync --help
   claude-sync --version

   # Test specific features
   claude-sync init
   ```

## Coding Standards

### JavaScript Style Guide

- Use modern JavaScript (ES6+)
- Follow existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### File Organization

```
claude-sync/
├── bin/           # CLI entry point
├── lib/           # Core functionality
│   ├── config.js  # Configuration management
│   ├── git.js     # Git operations
│   └── ...
├── templates/     # Configuration templates
└── tests/         # Test files (if added)
```

### Code Quality

- **No console.log**: Use proper logging (chalk, ora)
- **Error handling**: Always handle errors gracefully
- **Async/await**: Prefer async/await over callbacks
- **Validation**: Validate user inputs
- **DRY**: Don't Repeat Yourself

### Example Good Code

```javascript
async function addWorkspace(workspacePath) {
  try {
    if (!workspacePath) {
      throw new Error('Workspace path is required');
    }

    const normalizedPath = path.resolve(workspacePath);

    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`Path does not exist: ${normalizedPath}`);
    }

    // Add workspace logic...

    return normalizedPath;
  } catch (error) {
    console.error(chalk.red(`Failed to add workspace: ${error.message}`));
    throw error;
  }
}
```

## Commit Messages

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks

### Examples

```bash
feat(watcher): add debounce delay configuration

Allow users to configure the debounce delay for file watching
through the config file. Default remains 2000ms.

Closes #123
```

```bash
fix(git): handle authentication errors gracefully

Previously, authentication errors would crash the application.
Now they are caught and displayed with helpful error messages.

Fixes #456
```

## Pull Request Process

1. **Update documentation**
   - Update README.md if you changed functionality
   - Add JSDoc comments to new functions
   - Update CHANGELOG.md if applicable

2. **Test thoroughly**
   - Test all changed functionality
   - Test on different operating systems if possible
   - Ensure no breaking changes

3. **Create Pull Request**
   - Use a clear and descriptive title
   - Reference related issues
   - Describe your changes in detail
   - Include screenshots for UI changes

4. **Pull Request Template**

   ```markdown
   ## Description
   Brief description of changes

   ## Motivation and Context
   Why is this change required? What problem does it solve?

   ## How Has This Been Tested?
   Describe how you tested your changes

   ## Types of changes
   - [ ] Bug fix (non-breaking change which fixes an issue)
   - [ ] New feature (non-breaking change which adds functionality)
   - [ ] Breaking change (fix or feature that would cause existing functionality to change)

   ## Checklist
   - [ ] My code follows the code style of this project
   - [ ] I have updated the documentation accordingly
   - [ ] I have added tests to cover my changes
   - [ ] All new and existing tests passed
   ```

5. **Code Review Process**
   - Address reviewer feedback promptly
   - Make requested changes
   - Be open to suggestions
   - Keep discussions professional and constructive

6. **After Merge**
   - Delete your branch
   - Pull latest changes from main
   - Celebrate! 🎉

## Questions?

Feel free to:
- Open an issue with the `question` label
- Reach out to maintainers
- Check existing documentation

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to Claude Sync! 🙏
