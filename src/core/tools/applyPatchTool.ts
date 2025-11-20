import * as vscode from "vscode";
import { applyPatch } from "diff";

let genai: any;
async function getGenai() {
  if (!genai) {
    genai = await import("@google/genai");
  }
  return genai;
}

export async function applyPatchTool(
  path: string,
  patch: string
): Promise<{ status: string; file: string }> {
  const fileUri = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders![0].uri,
    path
  );

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
  return { status: "success", file: path };
}

export async function getApplyPatchToolDeclaration() {
  const { Type } = await getGenai();

  return {
    name: "applyPatchTool",
    description: "Apply a patch to a file.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "The path to the file to apply the patch to.",
        },
        patch: {
          type: Type.STRING,
          description: "The patch to apply to the file.",
        },
      },
      required: ["path", "patch"],
    },
  };
}

