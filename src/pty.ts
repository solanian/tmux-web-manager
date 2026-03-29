import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function getNodePtySpawnHelperCandidates(
  nodePtyPackageDir: string,
  platform = process.platform,
  arch = process.arch,
): string[] {
  return [
    path.join(nodePtyPackageDir, 'build', 'Release', 'spawn-helper'),
    path.join(nodePtyPackageDir, 'build', 'Debug', 'spawn-helper'),
    path.join(nodePtyPackageDir, 'prebuilds', `${platform}-${arch}`, 'spawn-helper'),
  ];
}

export function resolveNodePtySpawnHelperPath(
  nodePtyPackageDir: string,
  platform = process.platform,
  arch = process.arch,
): string | undefined {
  return getNodePtySpawnHelperCandidates(nodePtyPackageDir, platform, arch).find((candidate) =>
    fs.existsSync(candidate),
  );
}

export function ensureExecutableFile(filePath: string): void {
  const stats = fs.statSync(filePath);
  if ((stats.mode & 0o111) === 0o111) {
    return;
  }
  fs.chmodSync(filePath, stats.mode | 0o111);
}

export function ensureNodePtySpawnHelperExecutable(): void {
  if (process.platform === 'win32') {
    return;
  }

  let packageJsonPath = '';
  try {
    packageJsonPath = require.resolve('node-pty/package.json');
  } catch {
    return;
  }

  const helperPath = resolveNodePtySpawnHelperPath(path.dirname(packageJsonPath));
  if (!helperPath) {
    return;
  }

  try {
    ensureExecutableFile(helperPath);
  } catch {}
}
