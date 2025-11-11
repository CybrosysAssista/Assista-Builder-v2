import * as vscode from 'vscode';

export async function readFileContent(uri: vscode.Uri): Promise<string> {
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf8');
}

export async function writeFileContent(uri: vscode.Uri, content: string): Promise<void> {
    const bytes = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(uri, bytes);
}

export async function ensureDirectory(uri: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.createDirectory(uri);
    } catch (error: any) {
        if (error?.code === 'EEXIST') {
            return;
        }
        throw error;
    }
}

