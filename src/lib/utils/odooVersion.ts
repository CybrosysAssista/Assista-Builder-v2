/**
 * Utility functions for Odoo version detection
 */
import * as vscode from 'vscode';

export interface OdooVersionInfo {
    version: string | null;
    file?: vscode.Uri;
}

/**
 * Lightweight detector for Odoo version by scanning for a top-level or workspace release.py
 */
export async function detectOdooReleaseVersion(): Promise<OdooVersionInfo | null> {
    try {
        const exclude = '**/{.git,node_modules,venv,env,dist,build,\.venv,\.env}/**';
        // Prefer root-level files named release.py, but search anywhere in workspace as fallback
        const candidates = await vscode.workspace.findFiles('**/release.py', exclude, 5);
        if (!candidates.length) { return null; }
        const { readFileContent } = await import('../services/fileService.js');
        for (const u of candidates) {
            try {
                const content = await readFileContent(u);
                // Try explicit version like: version = '17.0' or version = "17.0+e"
                const m1 = content.match(/\bversion\s*=\s*['"]\s*([0-9]{1,2}\.[0-9]{1,2})[^'"\n]*['"]/i);
                if (m1 && m1[1]) {
                    return { version: m1[1], file: u };
                }
                // Try version_info tuple e.g., (17, 0, 'final', 0)
                const m2 = content.match(/\bversion_info\s*=\s*\(\s*(\d{1,2})\s*,\s*(\d{1,2})/i);
                if (m2 && m2[1] && m2[2]) {
                    return { version: `${m2[1]}.${m2[2]}`, file: u };
                }
            } catch { }
        }
        return null;
    } catch {
        return null;
    }
}
