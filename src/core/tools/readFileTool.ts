import * as vscode from "vscode";

let genai: any;
async function getGenai() {
  if (!genai) {
    genai = await import("@google/genai");
  }
  return genai;
}

export async function readFileTool(path: string): Promise<{ content: string }> {
  const fileUri = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders![0].uri,
    path
  );

  try {
    const data = await vscode.workspace.fs.readFile(fileUri);
    const content = Buffer.from(data).toString("utf8");
    return { content };
  } catch (err) {
    throw new Error(`read_file failed: File not found at ${path}`);
  }
}

export async function getReadFileToolDeclaration() {
  const { Type } = await getGenai();

  return {
    name: "readFileTool",
    description: "Read content from file.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "The path to the file to read from.",
        },
      },
      required: ["path"],
    },
  };
}
