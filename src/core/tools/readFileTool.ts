// src/core/tools/readFileTool.ts
import * as vscode from "vscode";

export async function readFileTool(path: string): Promise<string> {
  const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, path);

  try {
    const data = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(data).toString("utf8");
  } catch (err) {
    throw new Error(`read_file failed: File not found at ${path}`);
  }
}
