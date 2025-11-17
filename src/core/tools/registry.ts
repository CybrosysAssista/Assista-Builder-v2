// src/core/tools/registry.ts
import { readFileTool } from "./readFileTool.js";
import { writeFileTool } from "./writeFileTool.js";
import { applyPatchTool } from "./applyPatchTool.js";
import { createFolderTool } from "./createFolderTool.js";

export type ToolFn = (...args: any[]) => Promise<any> | any;

export const TOOL_REGISTRY: Record<string, ToolFn> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  apply_patch: applyPatchTool,
  create_folder: createFolderTool,
};
