#!/usr/bin/env node

const updater = require('./lib/updater');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const cacheFile = path.join(require('os').homedir(), '.config', 'claude-sync', 'last-update-check.json');

console.log(chalk.blue('\n🧪 Testando Correção do Bug de Notificação\n'));
console.log(chalk.gray('─'.repeat(50)));

async function runTests() {
  if (fs.existsSync(cacheFile)) {
    fs.unlinkSync(cacheFile);
  }

  console.log(chalk.yellow('\n1️⃣  Primeira execução (versão 1.0.4)'));
  console.log(chalk.gray('   Deve checar e mostrar notificação\n'));

  let shouldCheck = updater.shouldCheckForUpdates('1.0.4');
  console.log(chalk.gray(`   shouldCheckForUpdates: ${shouldCheck ? chalk.green('YES') : chalk.red('NO')}`));

  if (shouldCheck) {
    const updateInfo = await updater.checkForUpdates('1.0.4');
    console.log(chalk.gray(`   updateAvailable: ${updateInfo.updateAvailable ? chalk.green('YES') : chalk.red('NO')}`));
    console.log(chalk.gray(`   Current: ${updateInfo.currentVersion}, Latest: ${updateInfo.latestVersion}`));

    if (updateInfo.updateAvailable) {
      updater.displayUpdateNotification(updateInfo);
      updater.updateNotifiedVersion(updateInfo.latestVersion);
      console.log(chalk.green('   ✓ Notificação exibida e cache atualizado'));
    }
  }

  console.log(chalk.gray('\n   Cache após 1ª execução:'));
  const cache1 = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  console.log(chalk.gray(`   lastNotifiedVersion: ${cache1.lastNotifiedVersion}`));

  console.log(chalk.gray('\n' + '─'.repeat(50)));
  console.log(chalk.yellow('\n2️⃣  Segunda execução imediata (mesma versão 1.0.4)'));
  console.log(chalk.gray('   Não deve checar (rate limit de 6h)\n'));

  shouldCheck = updater.shouldCheckForUpdates('1.0.4');
  console.log(chalk.gray(`   shouldCheckForUpdates: ${shouldCheck ? chalk.red('YES ❌ BUG!') : chalk.green('NO ✓')}`));

  console.log(chalk.gray('\n' + '─'.repeat(50)));
  console.log(chalk.yellow('\n3️⃣  Terceira execução após atualizar para 1.0.6'));
  console.log(chalk.gray('   Deve checar e NÃO mostrar notificação\n'));

  shouldCheck = updater.shouldCheckForUpdates('1.0.6');
  console.log(chalk.gray(`   shouldCheckForUpdates: ${shouldCheck ? chalk.red('YES (mas não há update)') : chalk.green('NO (versão já notificada)')}`));

  if (shouldCheck) {
    const updateInfo = await updater.checkForUpdates('1.0.6');
    console.log(chalk.gray(`   updateAvailable: ${updateInfo.updateAvailable ? chalk.red('YES ❌') : chalk.green('NO ✓')}`));
  } else {
    console.log(chalk.green('   ✓ Não checou porque versão atual = versão notificada'));
  }

  console.log(chalk.gray('\n' + '─'.repeat(50)));
  console.log(chalk.blue('\n✅ Testes concluídos!\n'));
}

runTests().catch(error => {
  console.error(chalk.red('\n✗ Erro:'), error);
  process.exit(1);
});
