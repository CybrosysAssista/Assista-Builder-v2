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

export const askFollowupQuestionTool: ToolDefinition = {
  name: 'ask_followup_question',
  description:
    'Ask the user a question and present 2–4 suggested answers. Suggestions must be short, clear, and directly actionable. Use this when additional clarification is required.',
  jsonSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      follow_up: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            mode: { type: ['string', 'null'] }
          },
          required: ['text'],
          additionalProperties: false
        }
      }
    },
    required: ['question', 'follow_up'],
    additionalProperties: false
  },

  execute: async (args: AskFollowupQuestionArgs): Promise<ToolResult> => {
    try {
      const { question, follow_up } = args;

      if (typeof question !== 'string' || question.trim() === '') {
        return {
          status: 'error',
          error: { message: 'Invalid question', code: 'INVALID_ARGS' }
        };
      }

      if (
        !Array.isArray(follow_up) ||
        follow_up.length < 2 ||
        follow_up.length > 4 ||
        follow_up.some(
          s => !s || typeof s.text !== 'string' || s.text.trim() === ''
        )
      ) {
        return {
          status: 'error',
          error: {
            message: 'follow_up must contain 2–4 valid suggestions',
            code: 'INVALID_ARGS'
          }
        };
      }

      const { answer, mode } = await questionManager.askQuestion(
        question,
        follow_up
      );

      return {
        status: 'success',
        result: { answer, text: answer, mode: mode ?? null }
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      return {
        status: 'error',
        error: {
          message: msg.includes('cancel') ? 'User cancelled' : msg,
          code: msg.includes('cancel') ? 'USER_CANCELLED' : 'EXECUTION_ERROR'
        }
      };
    }
  }
};
