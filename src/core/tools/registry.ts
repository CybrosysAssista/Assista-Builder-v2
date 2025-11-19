// src/core/tools/registry.ts
import { z } from "zod";
import { readFileTool } from "./readFileTool.js";
import { writeFileTool } from "./writeFileTool.js";
import { applyPatchTool } from "./applyPatchTool.js";
import { createFolderTool } from "./createFolderTool.js";

export type ToolFn = (...args: any[]) => Promise<any> | any;

export interface ToolRegistration {
    fn: ToolFn;
    schema?: z.ZodTypeAny;
}

export const TOOL_REGISTRY: Record<string, ToolRegistration> = {
  read_file: {
    fn: readFileTool,
    schema: z.object({
      path: z.string(),
      encoding: z.string().optional()
    })
  },
  write_file: {
    fn: writeFileTool,
    schema: z.object({
      path: z.string(),
      content: z.string()
    })
  },
  apply_patch: {
    fn: applyPatchTool,
    schema: z.object({
      path: z.string(),
      patch: z.string()
    })
  },
  create_folder: {
    fn: createFolderTool,
    schema: z.object({
      path: z.string()
    })
  },
};
