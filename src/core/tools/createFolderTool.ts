// src/core/tools/createFolderTool.ts
import * as vscode from "vscode";

export async function createFolderTool(path: string): Promise<string> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) throw new Error("No workspace open");

  const folderUri = vscode.Uri.joinPath(workspace.uri, path);
  await vscode.workspace.fs.createDirectory(folderUri);

  return `create_folder: created ${path}`;
}
