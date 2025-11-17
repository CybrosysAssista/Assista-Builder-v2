// src/core/tools/writeFileTool.ts
import * as vscode from "vscode";

export async function writeFileTool(
  path: string,
  content: string
): Promise<string> {
  const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, path);

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
  return `write_file: successfully wrote ${path}`;
}
