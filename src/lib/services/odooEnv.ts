import * as fs from 'fs';
import * as path from 'path';

/** -------- Odoo version detection -------- */
export function detectOdooVersion(baseDir: string): string {
  const rel = path.join(baseDir, 'odoo', 'release.py');
  if (fs.existsSync(rel)) {
    const txt = fs.readFileSync(rel, 'utf-8');
    const m = txt.match(/version_info\s*=\s*\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
      if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    }
  }
  // fallback: try manifest in base/addons
  const baseManifest = path.join(baseDir, 'odoo', 'addons', 'base', '__manifest__.py');
  if (fs.existsSync(baseManifest)) {
    const txt = fs.readFileSync(baseManifest, 'utf-8');
    const v = txt.match(/'version'\s*:\s*'([^']+)'/);
    if (v) return v[1];
  }
  return '17.0'; // sensible default
}

/** -------- Find & parse odoo.conf -------- */
export function findOdooConf(baseDir: string): string | undefined {
  const candidates = [
    path.join(baseDir, 'odoo.conf'),
    path.join(baseDir, 'config', 'odoo.conf'),
    '/etc/odoo/odoo.conf',
  ];
  return candidates.find(p => fs.existsSync(p));
}

export function parseAddonsPaths(confPath?: string): string[] {
  if (!confPath) return [];
  const txt = fs.readFileSync(confPath, 'utf-8');
  const m = txt.match(/^\s*addons_path\s*=\s*(.+)$/m);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

/** -------- Choose or create writable path -------- */
function canWrite(p: string) {
  try {
    fs.mkdirSync(path.join(p, '.assista_test'), { recursive: true });
    fs.rmSync(path.join(p, '.assista_test'), { recursive: true, force: true });
    return true;
  } catch { return false; }
}

export function chooseWritableAddonsPath(baseDir: string, paths: string[]): { path: string; created: boolean } {
  for (const p of paths) if (fs.existsSync(p) && canWrite(p)) return { path: p, created: false };
  const fallback = path.join(baseDir, 'custom_addons');
  fs.mkdirSync(fallback, { recursive: true });
  return { path: fallback, created: true };
}

/** -------- Update odoo.conf if new path created -------- */
export function ensurePathInConf(confPath: string, addonsPath: string) {
  let txt = fs.readFileSync(confPath, 'utf-8');
  const re = /^\s*addons_path\s*=\s*(.+)$/m;
  const m = txt.match(re);
  if (m) {
    const current = m[1].split(',').map(s => s.trim());
    if (!current.includes(addonsPath)) {
      const updated = [...current, addonsPath].join(', ');
      txt = txt.replace(re, `addons_path = ${updated}`);
      fs.writeFileSync(confPath, txt, 'utf-8');
    }
  } else {
    txt += `\naddons_path = ${addonsPath}\n`;
    fs.writeFileSync(confPath, txt, 'utf-8');
  }
}

/** -------- Scan existing modules -------- */
export function scanExistingModules(addonsPaths: string[]): string[] {
  const mods = new Set<string>();
  for (const p of addonsPaths) {
    try {
      for (const name of fs.readdirSync(p)) {
        const mpath = path.join(p, name, '__manifest__.py');
        if (fs.existsSync(mpath)) mods.add(name);
      }
    } catch {}
  }
  return [...mods];
}
