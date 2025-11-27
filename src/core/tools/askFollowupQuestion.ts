import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { questionManager } from '../utils/questionManager.js';

interface Suggestion {
  text: string;
  mode?: string | null;
}

interface AskFollowupQuestionArgs {
  question: string;
  follow_up: Suggestion[];
}

/**
 * Ask followup question tool - prompts user with a question and suggested answers
 * Uses webview UI for integrated question display
 */
export const askFollowupQuestionTool: ToolDefinition = {
  name: 'ask_followup_question',
  description: 'Ask the user a question to gather additional information needed to complete the task. Use when clarification or more detail is required before proceeding. Provide 2-4 suggested answers that the user can choose from.',
  jsonSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Clear, specific question that captures the missing information you need',
      },
      follow_up: {
        type: 'array',
        description: 'Required list of 2-4 suggested responses; each suggestion must be a complete, actionable answer and may include a mode switch',
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Suggested answer the user can pick',
            },
            mode: {
              type: ['string', 'null'],
              description: 'Optional mode slug to switch to if this suggestion is chosen (e.g., code, architect)',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
        minItems: 2,
        maxItems: 4,
      },
    },
    required: ['question', 'follow_up'],
    additionalProperties: false,
  },
  execute: async (args: AskFollowupQuestionArgs): Promise<ToolResult> => {
    try {
      // Validate question (matching Roo-Code validation)
      if (!args.question || typeof args.question !== 'string' || args.question.trim() === '') {
        return {
          status: 'error',
          error: {
            message: 'ask_followup_question requires a valid question string',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate follow_up array (matching Roo-Code: 2-4 suggestions required)
      if (!args.follow_up || !Array.isArray(args.follow_up) || args.follow_up.length < 2 || args.follow_up.length > 4) {
        return {
          status: 'error',
          error: {
            message: 'ask_followup_question requires follow_up array with 2-4 suggestions',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate all suggestions have text (matching Roo-Code validation)
      for (const suggestion of args.follow_up) {
        if (!suggestion || typeof suggestion.text !== 'string' || suggestion.text.trim() === '') {
          return {
            status: 'error',
            error: {
              message: 'All suggestions must have a valid text property',
              code: 'INVALID_ARGS',
            },
          };
        }
      }

      // Ask question using question manager (will use webview UI or fallback to quick pick)
      const { answer, mode } = await questionManager.askQuestion(args.question, args.follow_up);

      return {
        status: 'success',
        result: {
          answer: `${answer}`,
          text: answer,
          mode: mode || null,
        },
      };
    } catch (error) {
      // Handle cancellation and other errors
      if (error instanceof Error && error.message.includes('cancelled')) {
        return {
          status: 'error',
          error: {
            message: 'User cancelled the question',
            code: 'USER_CANCELLED',
          },
        };
      }

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

