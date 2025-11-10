/**
 * Shared utilities for webview operations
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { getNonce } from '../utils.js';
import { normalizeGeneratedPath as normalizePath } from '../../utils/pathUtils.js';
import { findModuleRoot } from '../../services/moduleService.js';

export function getHtmlForWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    // Try out/ first (production), fallback to src/ (development)
    const outPath = vscode.Uri.joinPath(extensionUri, 'out', 'lib', 'webview', 'ui', 'index.html').fsPath;
    const srcPath = vscode.Uri.joinPath(extensionUri, 'src', 'lib', 'webview', 'ui', 'index.html').fsPath;
    const uiPath = fs.existsSync(outPath) ? ['out', 'lib', 'webview', 'ui'] : ['src', 'lib', 'webview', 'ui'];
    
    const historyCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...uiPath, 'history.css'));
    const historyJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...uiPath, 'history.js'));
    const mainJsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...uiPath, 'main.js'));
    const mainCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...uiPath, 'styles.css'));
    const templatePath = vscode.Uri.joinPath(extensionUri, ...uiPath, 'index.html').fsPath;
    
    try {
        const raw = fs.readFileSync(templatePath, 'utf8');
        return raw
            .replace(/\{\{cspSource\}\}/g, String(webview.cspSource))
            .replace(/\{\{nonce\}\}/g, String(nonce))
            .replace(/\{\{historyCssUri\}\}/g, String(historyCssUri))
            .replace(/\{\{historyJsUri\}\}/g, String(historyJsUri))
            .replace(/\{\{mainCssUri\}\}/g, String(mainCssUri))
            .replace(/\{\{mainJsUri\}\}/g, String(mainJsUri));
    } catch (e) {
        // Fallback minimal HTML if template load fails
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${String(mainCssUri)}"></head><body><div id="messages">Template load failed.</div><script nonce="${nonce}" src="${String(historyJsUri)}"></script><script nonce="${nonce}" src="${String(mainJsUri)}"></script></body></html>`;
    }
}

// Re-export for backwards compatibility
export { normalizeGeneratedPath } from '../../utils/pathUtils.js';
export { findModuleRoot };

