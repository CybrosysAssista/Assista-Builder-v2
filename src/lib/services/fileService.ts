/**
 * File operation service utilities
 */
import * as vscode from 'vscode';

/**
 * Read file content from URI
 */
export async function readFileContent(uri: vscode.Uri): Promise<string> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString('utf8');
    } catch (error) {
        throw new Error(`Failed to read file ${uri.fsPath}: ${(error as Error).message}`);
    }
}

/**
 * Write file content to URI
 */
export async function writeFileContent(uri: vscode.Uri, content: string): Promise<void> {
    try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to write file ${uri.fsPath}: ${(error as Error).message}`);
    }
}

/**
 * Ensure directory exists, creating parent directories if needed
 */
export async function ensureDirectory(uri: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.createDirectory(uri);
    } catch (error) {
        // Directory might already exist, which is fine
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type !== vscode.FileType.Directory) {
                throw new Error(`Failed to create directory ${uri.fsPath}: ${(error as Error).message}`);
            }
        } catch {
            throw new Error(`Failed to create directory ${uri.fsPath}: ${(error as Error).message}`);
        }
    }
}

