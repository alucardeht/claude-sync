const path = require('path');

/**
 * Case-insensitive path prefix check for Windows compatibility.
 * On Windows, filesystem paths are case-insensitive but String.startsWith()
 * is case-sensitive. Chokidar may emit paths with different drive letter casing.
 */
function pathStartsWith(filePath, prefix) {
  if (process.platform === 'win32') {
    return path.resolve(filePath).toLowerCase().startsWith(path.resolve(prefix).toLowerCase());
  }
  return path.resolve(filePath).startsWith(path.resolve(prefix));
}

module.exports = { pathStartsWith };
