import * as vscode from "vscode";

let genai: any;
async function getGenai() {
  if (!genai) {
    genai = await import("@google/genai");
  }
  return genai;
}

export async function createFolderTool(path: string): Promise<{ status: string; folder: string }> {
  const folderUri = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders![0].uri,
    path
  );
  await vscode.workspace.fs.createDirectory(folderUri);

  return { status: "success", folder: path };
}

export async function getCreateFolderToolDeclaration() {
  const { Type } = await getGenai();

  return {
    name: "createFolderTool",
    description: "Create a folder.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "The path to the folder to create.",
        },
      },
      required: ["path"],
    },
  };
}
