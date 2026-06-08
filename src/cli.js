const { createPatcher } = require('./patcher');

async function main() {
  const command = process.argv[2] || 'scan';
  const dryRun = process.argv.includes('--dry-run');
  const batchArg = process.argv.find((arg) => arg.startsWith('--batch='));
  const batchId = batchArg ? batchArg.slice('--batch='.length) : undefined;
  const patcher = createPatcher();

  if (command === 'scan') {
    print(await patcher.scan());
    return;
  }
  if (command === 'apply') {
    print(await patcher.apply({ dryRun }));
    return;
  }
  if (command === 'restore') {
    print(await patcher.restore({ batchId }));
    return;
  }
  if (command === 'backups') {
    print(await patcher.listBackups());
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
