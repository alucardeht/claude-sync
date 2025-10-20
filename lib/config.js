const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-sync');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'config.template.json');

class ConfigManager {
  constructor() {
    this.config = null;
  }

  ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  exists() {
    return fs.existsSync(CONFIG_FILE);
  }

  load() {
    if (!this.exists()) {
      throw new Error('Configuration not found. Run "claude-sync init" first.');
    }

    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    this.config = JSON.parse(data);
    return this.config;
  }

  create(initialConfig = {}) {
    this.ensureConfigDir();

    const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
    const config = { ...template, ...initialConfig };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    this.config = config;

    return config;
  }

  save() {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }

    this.ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
  }

  get(key) {
    if (!this.config) {
      this.load();
    }

    if (key) {
      return key.split('.').reduce((obj, k) => obj?.[k], this.config);
    }

    return this.config;
  }

  set(key, value) {
    if (!this.config) {
      this.load();
    }

    const keys = key.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, k) => {
      if (!obj[k]) obj[k] = {};
      return obj[k];
    }, this.config);

    target[lastKey] = value;
    this.save();
  }

  addWorkspace(workspacePath) {
    if (!this.config) {
      this.load();
    }

    const normalizedPath = path.resolve(workspacePath);

    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`Workspace path does not exist: ${normalizedPath}`);
    }

    if (!this.config.workspaces) {
      this.config.workspaces = [];
    }

    const exists = this.config.workspaces.some(w => w.path === normalizedPath);

    if (exists) {
      throw new Error(`Workspace already registered: ${normalizedPath}`);
    }

    this.config.workspaces.push({
      path: normalizedPath,
      name: path.basename(normalizedPath),
      addedAt: new Date().toISOString()
    });

    this.save();

    return normalizedPath;
  }

  removeWorkspace(workspacePath) {
    if (!this.config) {
      this.load();
    }

    const normalizedPath = path.resolve(workspacePath);
    const initialLength = this.config.workspaces.length;

    this.config.workspaces = this.config.workspaces.filter(
      w => w.path !== normalizedPath
    );

    if (this.config.workspaces.length === initialLength) {
      throw new Error(`Workspace not found: ${normalizedPath}`);
    }

    this.save();

    return normalizedPath;
  }

  listWorkspaces() {
    if (!this.config) {
      this.load();
    }

    return this.config.workspaces || [];
  }

  getConfigPath() {
    return CONFIG_FILE;
  }

  reset() {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    this.config = null;
  }
}

module.exports = new ConfigManager();
