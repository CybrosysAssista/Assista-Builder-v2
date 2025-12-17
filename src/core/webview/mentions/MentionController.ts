import * as vscode from 'vscode';
import * as path from 'path';

export class MentionController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly postMessage: (type: string, payload?: any) => void,
  ) {}

  /** Returns true if the message was handled */
  public async handle(message: any): Promise<boolean> {
    const cmd = String(message?.command || '');
    switch (cmd) {
      case 'mentionActiveFile':
        await this.handleActiveFile();
        return true;
      case 'mentionRecentFiles':
        await this.handleRecentFiles();
        return true;
      case 'mentionPickFiles':
        await this.handlePickFiles();
        return true;
      case 'mentionWorkspaceRecent':
        await this.handleWorkspaceItems('');
        return true;
      case 'mentionWorkspaceSearch': {
        const q = String(message?.query || '');
        await this.handleWorkspaceItems(q);
        return true;
      }
      default:
        return false;
    }
  }

  private async handleActiveFile(): Promise<void> {
    try {
      const doc = vscode.window.activeTextEditor?.document;
      const name = doc ? path.basename(doc.uri.fsPath) : '';
      this.postMessage('mentionActiveFileData', { name });
    } catch {
      this.postMessage('mentionActiveFileData', { name: '' });
    }
  }

  private async handleRecentFiles(): Promise<void> {
    try {
      const names: string[] = [];
      const seen = new Set<string>();
      const pushName = (n?: string) => {
        if (!n) return;
        const key = n.toLowerCase();
        if (!seen.has(key)) { seen.add(key); names.push(n); }
      };

      // 1) Active editor first
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        pushName(path.basename(activeDoc.uri.fsPath));
      }

      // 2) Other visible editors
      for (const ed of vscode.window.visibleTextEditors) {
        if (names.length >= 3) break;
        try { pushName(path.basename(ed.document.uri.fsPath)); } catch {}
      }
      // 3) Fallback to tabs (if still not enough)
      if (names.length < 3) {
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            if (names.length >= 3) break;
            try {
              const input: any = (tab as any).input;
              const uri = input?.uri || input?.resource || input?.viewType ? input?.uri : undefined;
              const fsPath = uri?.fsPath || uri?.path;
              if (fsPath) { pushName(path.basename(fsPath)); }
              else if (typeof tab.label === 'string') { pushName(tab.label); }
            } catch {}
          }
          if (names.length >= 3) break;
        }
      }

      this.postMessage('mentionRecentFilesData', { names: names.slice(0, 3) });
    } catch {
      this.postMessage('mentionRecentFilesData', { names: [] });
    }
  }

  private async handlePickFiles(): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) {
        // No workspace – fallback to OS dialog
        const fallback = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFiles: true, canSelectFolders: true, openLabel: 'Add' });
        if (fallback && fallback.length) {
          const texts = fallback.map(u => `@"${u.fsPath}"`);
          this.postMessage('mentionInsert', { text: texts.join(' ') });
        }
        return;
      }

      // Helpers
      type PI = vscode.QuickPickItem & { entryKind: 'file' | 'folder'; relPath: string; resourceUri?: vscode.Uri };
      const toRel = (uri: vscode.Uri) => uri.fsPath.startsWith(ws.uri.fsPath)
        ? uri.fsPath.substring(ws.uri.fsPath.length).replace(/^\/+/, '')
        : uri.fsPath;

      // Build MRU items from active + visible editors and tabs
      const mruDirs = new Set<string>();
      const mruFiles = new Set<string>();
      const pushFile = (p?: string) => { if (!p) return; const r = p.replace(/^\/+/, ''); mruFiles.add(r); mruDirs.add(path.dirname(r)); };

      const active = vscode.window.activeTextEditor?.document?.uri;
      if (active && active.fsPath.startsWith(ws.uri.fsPath)) pushFile(toRel(active));
      for (const ed of vscode.window.visibleTextEditors) {
        const u = ed?.document?.uri; if (u && u.fsPath.startsWith(ws.uri.fsPath)) pushFile(toRel(u));
      }
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const anyTab: any = tab;
          const uri: vscode.Uri | undefined = anyTab?.input?.uri || anyTab?.input?.resource;
          if (uri && uri.fsPath.startsWith(ws.uri.fsPath)) pushFile(toRel(uri));
        }
      }

      const buildFolderItem = (rel: string): PI => ({
        label: rel.split(/[\\\/]/).pop() || rel,
        description: `/${rel}`,
        relPath: rel,
        entryKind: 'folder',
        resourceUri: vscode.Uri.joinPath(ws.uri, rel),
      });
      const buildFileItem = (rel: string): PI => ({
        label: rel.split(/[\\\/]/).pop() || rel,
        description: `/${path.dirname(rel)}`,
        relPath: rel,
        entryKind: 'file',
        resourceUri: vscode.Uri.joinPath(ws.uri, rel),
      });

      const mruItems: PI[] = [
        ...Array.from(mruDirs).filter(Boolean).sort().slice(0, 30).map(buildFolderItem),
        ...Array.from(mruFiles).filter(Boolean).sort().slice(0, 50).map(buildFileItem),
      ];

      // QuickPick instance
      const qp = vscode.window.createQuickPick<PI>();
      qp.title = 'Search files and folders…';
      qp.matchOnDescription = true;
      qp.matchOnDetail = true;
      qp.canSelectMany = true;
      qp.items = mruItems;

      // Live search within workspace on input
      const disposables: vscode.Disposable[] = [];
      disposables.push(qp.onDidChangeValue(async (val) => {
        const q = val.trim();
        if (!q) { qp.items = mruItems; return; }
        try {
          const max = 4000;
          const needle = q.replace(/[\*\{\}\[\]\?]/g, '?'); // keep glob safe
          const found = await vscode.workspace.findFiles(`**/*${needle}*`, '**/.git/**', max);
          const folders = new Set<string>();
          const files: string[] = [];
          for (const u of found) {
            if (!u.fsPath.startsWith(ws.uri.fsPath)) continue;
            const r = toRel(u);
            files.push(r);
            const d = path.dirname(r);
            if (d && d !== '.' && d !== '/') folders.add(d);
          }
          const list: PI[] = [
            ...Array.from(folders).sort().slice(0, 300).map(buildFolderItem),
            ...files.sort().slice(0, 1500).map(buildFileItem),
          ];
          qp.items = list;
        } catch {}
      }));

      const selections = await new Promise<PI[] | undefined>((resolve) => {
        disposables.push(qp.onDidAccept(() => resolve(qp.selectedItems as unknown as PI[])));
        disposables.push(qp.onDidHide(() => resolve(undefined)));
        qp.show();
      });
      qp.dispose();
      disposables.forEach(d => d.dispose());

      if (selections && selections.length) {
        const texts = selections.map(it => `@"${it.relPath}"`);
        this.postMessage('mentionInsert', { text: texts.join(' ') });
      }
    } catch (err) {
      console.warn('[AssistaCoder] mentionPickFiles failed:', err);
    }
  }

  private async handleWorkspaceItems(query: string): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      this.postMessage('mentionWorkspaceItems', { items: [] });
      return;
    }
    const toRel = (uri: vscode.Uri) => uri.fsPath.startsWith(ws.uri.fsPath)
      ? uri.fsPath.substring(ws.uri.fsPath.length).replace(/^\/+/, '')
      : uri.fsPath;

    type Item = { label: string; description: string; relPath: string; kind: 'file' | 'folder' };
    const items: Item[] = [];

    try {
      if (!query) {
        // MRU: from active/visible editors and tabs
        const dirs = new Set<string>();
        const files = new Set<string>();
        const pushFile = (rel?: string) => {
          if (!rel) return; files.add(rel); const d = path.dirname(rel); if (d && d !== '.' && d !== '/') dirs.add(d);
        };
        const active = vscode.window.activeTextEditor?.document?.uri;
        if (active && active.fsPath.startsWith(ws.uri.fsPath)) pushFile(toRel(active));
        for (const ed of vscode.window.visibleTextEditors) {
          const u = ed?.document?.uri; if (u && u.fsPath.startsWith(ws.uri.fsPath)) pushFile(toRel(u));
        }
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            const anyTab: any = tab;
            const uri: vscode.Uri | undefined = anyTab?.input?.uri || anyTab?.input?.resource;
            if (uri && uri.fsPath.startsWith(ws.uri.fsPath)) pushFile(toRel(uri));
          }
        }
        for (const d of Array.from(dirs).sort().slice(0, 30)) {
          items.push({ label: d.split(/[\\\/]/).pop() || d, description: `/${d}`, relPath: d, kind: 'folder' });
        }
        for (const f of Array.from(files).sort().slice(0, 80)) {
          items.push({ label: f.split(/[\\\/]/).pop() || f, description: `/${path.dirname(f)}`, relPath: f, kind: 'file' });
        }

        // Fallback: if no MRU, show top-level workspace entries
        if (items.length === 0) {
          try {
            const entries = await vscode.workspace.fs.readDirectory(ws.uri);
            const topDirs: string[] = [];
            const topFiles: string[] = [];
            for (const [name, type] of entries) {
              if (type === vscode.FileType.Directory) topDirs.push(name);
              else if (type === vscode.FileType.File) topFiles.push(name);
            }
            topDirs.sort().slice(0, 50).forEach((name) => {
              const rel = name;
              items.push({ label: name, description: `/${rel}`, relPath: rel, kind: 'folder' });
            });
            topFiles.sort().slice(0, 50).forEach((name) => {
              const rel = name;
              items.push({ label: name, description: `/`, relPath: rel, kind: 'file' });
            });
          } catch {}
        }
      } else {
        const max = 4000;
        const needle = query.trim().replace(/[\*\{\}\[\]\?]/g, '?');
        const found = await vscode.workspace.findFiles(`**/*${needle}*`, '**/.git/**', max);
        const folders = new Set<string>();
        const files: string[] = [];
        for (const u of found) {
          if (!u.fsPath.startsWith(ws.uri.fsPath)) continue;
          const r = toRel(u);
          files.push(r);
          const d = path.dirname(r);
          if (d && d !== '.' && d !== '/') folders.add(d);
        }
        for (const d of Array.from(folders).sort().slice(0, 300)) {
          items.push({ label: d.split(/[\\\/]/).pop() || d, description: `/${d}`, relPath: d, kind: 'folder' });
        }
        for (const f of files.sort().slice(0, 1500)) {
          items.push({ label: f.split(/[\\\/]/).pop() || f, description: `/${path.dirname(f)}`, relPath: f, kind: 'file' });
        }
      }
    } catch {}

    this.postMessage('mentionWorkspaceItems', { items });
  }
}
