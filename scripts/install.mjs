import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetArg = process.argv.indexOf('--target');
if (targetArg === -1 || !process.argv[targetArg + 1] || process.argv[targetArg + 1].startsWith('--')) {
  console.error('用法：node scripts/install.mjs --target /绝对路径/面板项目 [--check]'); process.exit(1);
}
const target = resolve(process.argv[targetArg + 1]);
const checkOnly = process.argv.includes('--check');
const marker = '// account-performance-feature-v1';
const hash = text => createHash('sha256').update(text).digest('hex');
const contained = (base, path) => { const value = relative(base, path); if (value === '..' || value.startsWith(`..${sep}`) || resolve(base, value) !== path) throw Error('路径超出目标目录'); return path; };
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]); }

try {
  if (target === root || target.startsWith(root + sep)) throw Error('目标应为原面板项目，不能是功能包自身');
  const missionPath = contained(target, resolve(target, 'components/mission-control.tsx'));
  const source = readFileSync(missionPath, 'utf8');
  const pkg = JSON.parse(readFileSync(resolve(target, 'package.json'), 'utf8'));
  if (!pkg.dependencies?.react || !pkg.dependencies?.next) throw Error('目标不是预期的 React / Next 面板项目');
  for (const name of ['lib/business-time.ts', 'app/api/dashboard/route.ts', 'app/api/applovin/route.ts']) if (!existsSync(resolve(target, name))) throw Error(`目标缺少 ${name}，请核对面板版本`);
  const payloadRoot = resolve(root, 'payload');
  const changes = files(payloadRoot).map(file => ({ path: contained(target, resolve(target, relative(payloadRoot, file))), content: readFileSync(file, 'utf8') }));
  if (source.includes(marker)) {
    if (changes.every(change => existsSync(change.path) && readFileSync(change.path, 'utf8') === change.content)) { console.log('功能已安装，文件与此版本一致。'); process.exit(0); }
    throw Error('功能已安装但文件有差异。请先保留现有改动，再手动合并本次更新。');
  }
  if (!/^export function MissionSequence\(/m.test(source) || !/^["']use client["'];/m.test(source)) throw Error('MissionSequence 结构与兼容版本不同，未写入任何文件；请手动集成');
  for (const change of changes) if (existsSync(change.path)) throw Error(`目标已有同名文件：${relative(target, change.path)}；未写入任何文件`);
  const imports = '\nimport { useEffect as usePerformanceEffect, useState as usePerformanceState } from "react";\nimport { AccountPerformance } from "@/components/account-performance";\n';
  const wrapper = `
${marker}
export function MissionSequence(props: Parameters<typeof LegacyMissionSequence>[0]) {
  const [performanceEnabled, setPerformanceEnabled] = usePerformanceState(false);
  usePerformanceEffect(() => {
    const timer = window.setTimeout(() => { try { setPerformanceEnabled(localStorage.getItem("adengine.account-performance.v1") === "enabled"); } catch {} }, 0);
    const listener = (event: StorageEvent) => { if (event.key === "adengine.account-performance.v1" || event.key === null) setPerformanceEnabled(event.newValue === "enabled"); };
    window.addEventListener("storage", listener);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", listener); };
  }, []);
  const toggle = (enabled: boolean) => {
    setPerformanceEnabled(enabled);
    try { localStorage.setItem("adengine.account-performance.v1", enabled ? "enabled" : "disabled"); } catch {}
  };
  if (performanceEnabled) return <AccountPerformance {...props} onDisable={() => toggle(false)}/>;
  return <div><div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}><button type="button" onClick={() => toggle(true)} style={{fontSize:11,color:"#8eb3cb",border:"1px solid #2b5069",borderRadius:5,padding:"7px 12px",cursor:"pointer"}}>开启账户表现</button></div><LegacyMissionSequence {...props}/></div>;
}
`;
  const modified = source.replace(/^(["']use client["'];)/m, `$1${imports}`).replace('export function MissionSequence(', 'function LegacyMissionSequence(') + wrapper;
  changes.push({ path: missionPath, content: modified });
  console.log(`目标：${target}\n将新增 ${changes.length - 1} 个文件，并为同步序列加入本地开关；默认关闭。`);
  for (const change of changes) console.log(`  ${relative(target, change.path)}`);
  if (checkOnly) { console.log('兼容性检查通过，未修改文件。'); process.exit(0); }
  const backupPath = resolve(target, '.account-performance-backup.json');
  if (existsSync(backupPath)) throw Error('备份文件已存在，请先保留并检查，未写入任何文件');
  const before = changes.map(change => ({ path: relative(target, change.path), content: existsSync(change.path) ? readFileSync(change.path, 'utf8') : null, installedHash: hash(change.content) }));
  writeFileSync(backupPath, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files: before }, null, 2));
  try {
    for (const change of changes) { mkdirSync(dirname(change.path), { recursive: true }); writeFileSync(change.path, change.content); }
  } catch (error) {
    for (const item of before) { const path = contained(target, resolve(target, item.path)); if (item.content === null) { if (existsSync(path)) unlinkSync(path); } else writeFileSync(path, item.content); }
    unlinkSync(backupPath); throw error;
  }
  console.log('安装完成。重启面板后点击“开启账户表现”。原文件已备份到 .account-performance-backup.json。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
