// src/core/tools/registry.ts
import { getReadFileToolDeclaration } from "./readFileTool.js";
import { getWriteFileToolDeclaration } from "./writeFileTool.js";
import { getApplyPatchToolDeclaration } from "./applyPatchTool.js";
import { getCreateFolderToolDeclaration } from "./createFolderTool.js";

export const TOOL_DECLARATIONS = [
  getReadFileToolDeclaration(),
  getWriteFileToolDeclaration(),
  getApplyPatchToolDeclaration(),
  getCreateFolderToolDeclaration(),
];

