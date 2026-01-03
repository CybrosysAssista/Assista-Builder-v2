import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export type OdooEnv = {
  version: string | null;
  addons: string[];
};

export class OdooEnvironmentService {
  private cache: OdooEnv | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.invalidate()),
      vscode.workspace.onDidSaveTextDocument(() => this.invalidate()),
      vscode.workspace.onDidRenameFiles(() => this.invalidate()),
      vscode.workspace.onDidCreateFiles(() => this.invalidate()),
      vscode.workspace.onDidDeleteFiles(() => this.invalidate()),
    );
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }

  private invalidate() {
    this.cache = null;
  }

  public async getEnvironment(force = false): Promise<OdooEnv> {
    //console.log('getEnvironment called');
    if (!force && this.cache) {
      //console.log('getEnvironment returning cached environment:', this.cache);
      return this.cache;
    }
    //console.log('getEnvironment detecting environment');
    const env = await this.detectEnvironment();
    this.cache = env;
    return this.cache;
  }

  private async detectEnvironment(): Promise<OdooEnv> {
    const roots = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];

    if (roots.length === 0) {
      return { version: "not available", addons: [] };
    }

    let version: string | null = null;
    for (const root of roots) {
      version = await this.findVersionFromReleasePy(root);
      if (version) break;
    }
    version = version || "not available";

    const addons = await this.getAddonPaths(roots);

    return { version, addons };
  }

  private async findVersionFromReleasePy(root: string): Promise<string | null> {
    const candidates = [
      path.join(root, "odoo", "release.py"),
      path.join(root, "odoo", "odoo", "release.py"),
      path.join(root, "release.py")
    ];

    for (const filePath of candidates) {
      if (!(await exists(filePath))) continue;

      const content = await fs.readFile(filePath, "utf8");

      const m1 = content.match(/version_info\s*=\s*\(\s*(\d+)\s*,\s*(\d+)/);
      if (m1) return `${m1[1]}.${m1[2]}`;

      const m2 = content.match(/^\s*version\s*=\s*['"]([^'"]+)['"]/m);
      if (m2) {
        const mm = m2[1].match(/(\d+\.\d+)/);
        if (mm) return mm[1];
      }

      const m3 = content.match(/(?:series|major_version)\s*=\s*['"]([^'"]+)['"]/);
      if (m3) {
        const mm = m3[1].match(/(\d+\.\d+)/);
        if (mm) return mm[1];
      }
    }

    return null;
  }

  private async getAddonPaths(roots: string[]): Promise<string[]> {
    const launchConf = await this.tryFindConfInLaunchJson(roots);
    if (launchConf) {
      const content = await fs.readFile(launchConf, "utf8");
      return this.parseAddonsPath(content, path.dirname(launchConf), roots);
    }

    return await this.findAddonPathsFromRootConf(roots);
  }

  private async tryFindConfInLaunchJson(roots: string[]): Promise<string | null> {
    for (const root of roots) {
      const launchJson = path.join(root, ".vscode", "launch.json");

      if (!(await exists(launchJson))) continue;

      try {
        const content = await fs.readFile(launchJson, "utf8");
        const json = JSON.parse(content);

        if (!json.configurations) continue;

        for (const cfg of json.configurations) {
          if (!cfg.args || !Array.isArray(cfg.args)) continue;

          const cIndex = cfg.args.indexOf("-c");
          if (cIndex !== -1 && cfg.args[cIndex + 1]) {
            const confPath = cfg.args[cIndex + 1];
            if (await exists(confPath)) return confPath;
          }
        }
      } catch { /* ignore */ }
    }

    return null;
  }

  private async findAddonPathsFromRootConf(roots: string[]): Promise<string[]> {
    const results: string[] = [];

    for (const root of roots) {
      try {
        const entries = await fs.readdir(root, { withFileTypes: true });

        const confFiles = entries
          .filter(e => e.isFile() && e.name.endsWith(".conf"))
          .map(e => path.join(root, e.name));

        for (const conf of confFiles) {
          try {
            const content = await fs.readFile(conf, "utf8");
            const paths = this.parseAddonsPath(content, path.dirname(conf), roots);
            for (const p of paths) {
              const normalized = path.normalize(p);
              if (!results.includes(normalized)) {
                results.push(normalized);
              }
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    return results;
  }

  private parseAddonsPath(content: string, baseDir: string, workspaceRoots: string[]): string[] {
    const results: string[] = [];

    const line = content
      .split("\n")
      .map(l => l.trim())
      .find(l =>
        l.startsWith("addons_path") &&
        !l.startsWith("#") &&
        !l.startsWith(";")
      );

    if (!line) return results;

    const match = line.match(/addons_path\s*=\s*(.+)/);
    if (!match) return results;

    let value = match[1].trim().replace(/\\\s*$/gm, "");

    const parts = value.split(",")
      .map(p => p.trim())
      .filter(Boolean);

    // Use the first workspace root as the reference for relative paths
    const workspaceRoot = workspaceRoots.length > 0 ? workspaceRoots[0] : baseDir;

    for (const p of parts) {
      const cleaned = p.replace(/^['"]|['"]$/g, "");
      
      if (path.isAbsolute(cleaned)) {
        // Convert absolute path to relative path from workspace root
        const relative = path.relative(workspaceRoot, cleaned);
        results.push(relative);
      } else {
        // Resolve relative path from baseDir, then make it relative to workspace root
        const resolved = path.resolve(baseDir, cleaned);
        const relative = path.relative(workspaceRoot, resolved);
        results.push(relative);
      }
    }

    return results;
  }
}

async function exists(fp: string): Promise<boolean> {
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}
