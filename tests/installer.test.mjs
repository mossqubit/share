import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('../scripts/install.mjs', import.meta.url));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'performance-install-'));
  const files = { 'package.json': JSON.stringify({ dependencies: { react: '19', next: '16' } }), 'components/mission-control.tsx': '"use client";\nexport function MissionSequence(props: {missions: never[]}) { return null; }\n', 'lib/business-time.ts': '', 'app/api/dashboard/route.ts': '', 'app/api/applovin/route.ts': '' };
  for (const [path, content] of Object.entries(files)) { mkdirSync(resolve(root, path, '..'), { recursive: true }); writeFileSync(resolve(root, path), content); }
  return root;
}
function run(target, ...args) { return spawnSync(process.execPath, [script, '--target', target, ...args], { encoding: 'utf8' }); }
function cleanup(root) {
  const allowedPrefix = resolve(tmpdir(), 'performance-install-');
  assert.ok(resolve(root).startsWith(allowedPrefix) && resolve(root) !== resolve(tmpdir()));
  rmSync(root, { recursive: true, force: true });
}
test('installer checks without writes, backs up exact source, installs once and refuses edited update', () => {
  const root = fixture();
  try {
    const original = readFileSync(resolve(root, 'components/mission-control.tsx'), 'utf8');
    assert.equal(run(root, '--check').status, 0); assert.equal(existsSync(resolve(root, '.account-performance-backup.json')), false);
    assert.equal(run(root).status, 0); const installed = readFileSync(resolve(root, 'components/mission-control.tsx'), 'utf8');
    assert.match(installed, /function LegacyMissionSequence/); assert.match(installed, /usePerformanceState\(false\)/); assert.match(installed, /开启账户表现/);
    const backup = JSON.parse(readFileSync(resolve(root, '.account-performance-backup.json'), 'utf8')); assert.equal(backup.files.find(f => f.path.endsWith('mission-control.tsx')).content, original);
    assert.equal(run(root).status, 0); assert.equal(readFileSync(resolve(root, 'components/mission-control.tsx'), 'utf8'), installed);
    writeFileSync(resolve(root, 'lib/account-performance.ts'), '// user modification');
    assert.equal(run(root).status, 1); assert.equal(readFileSync(resolve(root, 'lib/account-performance.ts'), 'utf8'), '// user modification');
  } finally { cleanup(root); }
});
test('incompatible or colliding target refuses installation without changing source', () => {
  const root = fixture();
  try {
    writeFileSync(resolve(root, 'lib/account-performance.ts'), '// existing module');
    assert.equal(run(root).status, 1); assert.equal(existsSync(resolve(root, '.account-performance-backup.json')), false);
    assert.equal(readdirSync(resolve(root, 'components')).length, 1);
  } finally { cleanup(root); }
});
