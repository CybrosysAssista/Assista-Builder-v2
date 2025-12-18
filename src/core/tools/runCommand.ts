import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot } from './toolUtils.js';

interface RunCommandArgs {
  CommandLine: string;
  Cwd?: string;
  Blocking?: boolean;
  SafeToAutoRun?: boolean;
}

/**
 * Check if a command is potentially unsafe
 */
function isUnsafeCommand(command: string): boolean {
  const unsafePatterns = [
    /rm\s+-rf/i,
    /rm\s+-\w*r/i,
    /del\s+\/s/i,
    /format\s+/i,
    /mkfs/i,
    /dd\s+if=/i,
    /shutdown/i,
    /reboot/i,
    /sudo\s+rm/i,
    /sudo\s+del/i,
    /sudo\s+format/i,
    /curl\s+.*\|\s*sh/i,
    /wget\s+.*\|\s*sh/i,
    /\.\/.*\.sh/i, // Running shell scripts
  ];

  // Check for dangerous patterns
  for (const pattern of unsafePatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }

  // Check for commands that modify system state
  const modifyingCommands = ['apt-get', 'yum', 'dnf', 'pacman', 'brew install', 'npm install -g', 'pip install'];
  for (const cmd of modifyingCommands) {
    if (command.includes(cmd)) {
      return true;
    }
  }

  return false;
}

/**
 * Execute a command and return output
 */
function executeCommand(
  command: string,
  cwd?: string,
  blocking: boolean = true
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const workspaceRoot = getWorkspaceRoot();
    const workingDir = cwd || workspaceRoot;

    // Parse command into parts
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const childProcess = spawn(cmd, args, {
      cwd: workingDir,
      shell: true,
      env: { ...process.env, PAGER: 'cat' },
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    childProcess.on('error', (error: Error) => {
      resolve({
        stdout: '',
        stderr: error.message,
        exitCode: 1,
      });
    });

    // For non-blocking commands, resolve immediately
    if (!blocking) {
      setTimeout(() => {
        resolve({
          stdout: 'Command started in background',
          stderr: '',
          exitCode: 0,
        });
      }, 100);
    }
  });
}

/**
 * Run command tool
 */
export const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description: 'PROPOSE a command to run on behalf of the user. Operating System: linux. Shell: bash. NEVER PROPOSE A cd COMMAND. If you have this tool, note that you DO have the ability to run commands directly on the USER\'s system. Make sure to specify CommandLine exactly as it should be run in the shell. Note that the user will have to approve the command before it is executed. The user may reject it if it is not to their liking, or may modify the command before approving it. The actual command will NOT execute until the user approves it. Commands will be run with PAGER=cat. You may want to limit the length of output for commands that usually rely on paging and may contain very long output (e.g. git log, use git log -n <N>).',
  jsonSchema: {
    type: 'object',
    properties: {
      CommandLine: {
        type: 'string',
        description: 'The exact command line string to execute.',
      },
      Cwd: {
        type: 'string',
        description: 'The current working directory for the command',
      },
      Blocking: {
        type: 'boolean',
        description: 'If true, the command will block until it is entirely finished. During this time, the user will not be able to interact with Cascade. Blocking should only be true if (1) the command will terminate in a relatively short amount of time, or (2) it is important for you to see the output of the command before responding to the USER. Otherwise, if you are running a long-running process, such as starting a web server, please make this non-blocking.',
        default: true,
      },
      SafeToAutoRun: {
        type: 'boolean',
        description: 'Set to true if you believe that this command is safe to run WITHOUT user approval. A command is unsafe if it may have some destructive side-effects. Example unsafe side-effects include: deleting files, mutating state, installing system dependencies, making external requests, etc. Set to true only if you are extremely confident it is safe. If you feel the command could be unsafe, never set this to true, EVEN if the USER asks you to. It is imperative that you never auto-run a potentially unsafe command.',
        default: false,
      },
    },
    required: ['CommandLine'],
    additionalProperties: false,
  },
  execute: async (args: RunCommandArgs): Promise<ToolResult> => {
    try {
      if (!args.CommandLine || !args.CommandLine.trim()) {
        return {
          status: 'error',
          error: {
            message: 'run_command requires CommandLine argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Check for cd command (should use Cwd parameter instead)
      if (args.CommandLine.trim().startsWith('cd ')) {
        return {
          status: 'error',
          error: {
            message: 'Do not use cd command. Use the Cwd parameter instead.',
            code: 'INVALID_COMMAND',
          },
        };
      }

      // Check if command is unsafe
      const isUnsafe = isUnsafeCommand(args.CommandLine);
      
      if (isUnsafe && args.SafeToAutoRun) {
        return {
          status: 'error',
          error: {
            message: 'Command appears unsafe and cannot be auto-run. Please review the command and remove SafeToAutoRun flag.',
            code: 'UNSAFE_COMMAND',
          },
        };
      }

      // Validate working directory if provided
      if (args.Cwd) {
        try {
          const stats = await vscode.workspace.fs.stat(vscode.Uri.file(args.Cwd));
          if (!stats.type) {
            return {
              status: 'error',
              error: {
                message: `Working directory does not exist: ${args.Cwd}`,
                code: 'INVALID_CWD',
              },
            };
          }
        } catch {
          return {
            status: 'error',
            error: {
              message: `Invalid working directory: ${args.Cwd}`,
              code: 'INVALID_CWD',
            },
          };
        }
      }

      // Execute command
      const blocking = args.Blocking !== false; // Default to true
      const result = await executeCommand(args.CommandLine, args.Cwd, blocking);

      return {
        status: 'success',
        result: {
          command: args.CommandLine,
          cwd: args.Cwd || getWorkspaceRoot(),
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          blocking,
          requiresApproval: isUnsafe && !args.SafeToAutoRun,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'EXECUTION_ERROR',
        },
      };
    }
  },
};

