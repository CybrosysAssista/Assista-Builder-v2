// src/core/tools/applyPatchTool.ts
import * as vscode from "vscode";
import { applyPatch } from "diff";

export async function applyPatchTool(
  path: string,
  patch: string
): Promise<string> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) throw new Error("No workspace open");

  const fileUri = vscode.Uri.joinPath(workspace.uri, path);

  let original = "";
  try {
    const data = await vscode.workspace.fs.readFile(fileUri);
    original = Buffer.from(data).toString("utf8");
  } catch {
    throw new Error(`apply_patch failed: file does not exist → ${path}`);
  }

  const updated = applyPatch(original, patch);
  if (updated === false) {
    throw new Error(`apply_patch failed: patch rejected for ${path}`);
  }

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(updated, "utf8"));
  return `apply_patch: updated ${path}`;
}

