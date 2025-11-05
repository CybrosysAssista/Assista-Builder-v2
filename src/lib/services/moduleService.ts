/**
 * Module-related service utilities
 */
import * as vscode from 'vscode';

/**
 * Finds the nearest module root containing __manifest__.py
 */
export async function findModuleRoot(uri: vscode.Uri): Promise<string | null> {
    let curDir = require('path').dirname(uri.fsPath);
    const wsRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
    
    while (curDir && wsRoots.some(w => curDir.startsWith(w))) {
        try {
            const probe = vscode.Uri.file(require('path').join(curDir, '__manifest__.py'));
            await vscode.workspace.fs.stat(probe);
            return curDir;
        } catch { /* keep climbing */ }
        const parent = require('path').dirname(curDir);
        if (parent === curDir) break;
        curDir = parent;
    }
    return null;
}

/**
 * Helper: normalize a provided path into a `${moduleName}/...` scoped relative path
 * Handles both absolute and relative paths
 */
export function normalizeModuleScopedPath(
    relOrWeirdPath: string,
    moduleRoot: vscode.Uri,
    moduleName: string
): string | null {
    try {
        if (!relOrWeirdPath) return null;
        const path = require('path');
        let p = String(relOrWeirdPath).trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
        // If absolute, ensure it is inside the module root and convert to module-relative
        if (path.isAbsolute(p)) {
            const normAbs = path.normalize(p);
            const normRoot = path.normalize(moduleRoot.fsPath) + path.sep;
            if (!normAbs.startsWith(normRoot)) return null;
            p = path.relative(moduleRoot.fsPath, normAbs).replace(/\\/g, '/');
        }
        if (p.includes('..')) return null;
        // Prefix with moduleName/ if missing
        if (!p.startsWith(moduleName + '/')) p = `${moduleName}/` + p;
        // Collapse duplicate slashes
        p = p.replace(/\/\/+/, '/');
        return p;
    } catch {
        return null;
    }
}

/**
 * Convert a URI to module-relative path format (moduleName/path/to/file)
 */
export function toModuleRelativePath(uri: vscode.Uri, moduleRoot: vscode.Uri, moduleName: string): string {
    const path = require('path');
    const relativePath = path.relative(moduleRoot.fsPath, uri.fsPath).replace(/\\/g, '/');
    return (moduleName + '/' + relativePath).replace(/\/+/, '/');
}

/**
 * Filter and normalize a file map keyed by paths, keeping only entries within the module scope.
 * Keys are rewritten to `${moduleName}/...` relative form.
 */
export function scopeFileMapToModule(
    files: Record<string, string>,
    moduleRoot: vscode.Uri,
    moduleName: string
): Record<string, string> {
    const scoped: Record<string, string> = {};
    for (const [k, v] of Object.entries(files || {})) {
        const norm = normalizeModuleScopedPath(k, moduleRoot, moduleName);
        if (norm) scoped[norm] = v;
    }
    return scoped;
}

/**
 * Utility to check a fully-resolved absolute path is inside a module root.
 */
export function isPathInsideModule(absPath: string, moduleRoot: vscode.Uri): boolean {
    try {
        const path = require('path');
        const normAbs = path.normalize(absPath);
        const normRoot = path.normalize(moduleRoot.fsPath) + path.sep;
        return normAbs.startsWith(normRoot);
    } catch {
        return false;
    }
}

