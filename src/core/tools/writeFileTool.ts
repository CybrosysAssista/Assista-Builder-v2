import * as vscode from "vscode";

let genai: any;
async function getGenai() {
  if (!genai) {
    genai = await import("@google/genai");
  }
  return genai;
}

export async function writeFileTool(
  path: string,
  content: string
): Promise<{ status: string; file: string }> {
  const fileUri = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders![0].uri,
    path
  );

  await vscode.workspace.fs.writeFile(
    fileUri,
    Buffer.from(content, "utf8")
  );

  return { status: "success", file: path };
}

export async function getWriteFileToolDeclaration() {
  const { Type } = await getGenai();

  return {
    name: "writeFileTool",
    description: "Write content to file.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "The path to the file to write to.",
        },
        content: {
          type: Type.STRING,
          description: "The content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  };
}
