// src/core/tools/registry.ts
import { readFileTool } from "./readFileTool.js";
import { writeFileTool } from "./writeFileTool.js";
import { applyPatchTool } from "./applyPatchTool.js";
import { createFolderTool } from "./createFolderTool.js";

export const TOOL_REGISTRY = {
  read_file: readFileTool,
  write_file: writeFileTool,
  apply_patch: applyPatchTool,
  create_folder: createFolderTool,
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
