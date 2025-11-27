import * as vscode from 'vscode';

interface PendingQuestion {
  question: string;
  suggestions: Array<{ text: string; mode?: string | null }>;
  resolve: (answer: string, mode: string | null) => void;
  reject: (error: Error) => void;
}

/**
 * Manages question/answer communication between tools and webview
 */
class QuestionManager {
  private pendingQuestions = new Map<string, PendingQuestion>();
  private webviewProvider?: {
    postMessage: (type: string, payload?: any) => void;
  };

  /**
   * Register the webview provider for sending messages
   */
  registerWebviewProvider(provider: { postMessage: (type: string, payload?: any) => void }) {
    this.webviewProvider = provider;
  }

  /**
   * Ask a question and wait for user response
   */
  async askQuestion(
    question: string,
    suggestions: Array<{ text: string; mode?: string | null }>
  ): Promise<{ answer: string; mode: string | null }> {
    return new Promise((resolve, reject) => {
      const questionId = `question_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const pendingQuestion: PendingQuestion = {
        question,
        suggestions,
        resolve: (answer: string, mode: string | null) => {
          this.pendingQuestions.delete(questionId);
          resolve({ answer, mode });
        },
        reject: (error: Error) => {
          this.pendingQuestions.delete(questionId);
          reject(error);
        },
      };

      this.pendingQuestions.set(questionId, pendingQuestion);

      // Send question to webview
      if (this.webviewProvider) {
        this.webviewProvider.postMessage('showQuestion', {
          id: questionId,
          question,
          suggestions,
        });
      }
    });
  }

  /**
   * Handle answer from webview
   */
  handleAnswer(questionId: string, answer: string, mode: string | null) {
    const pending = this.pendingQuestions.get(questionId);
    if (pending) {
      pending.resolve(answer, mode);
    }
  }

  /**
   * Handle cancellation from webview
   */
  handleCancel(questionId: string) {
    const pending = this.pendingQuestions.get(questionId);
    if (pending) {
      pending.reject(new Error('User cancelled the question'));
    }
  }

  /**
   * Read-only accessor for a pending question.
   * Used by the webview provider to persist Q&A into chat history.
   */
  getPendingQuestion(
    questionId: string
  ): { question: string; suggestions: Array<{ text: string; mode?: string | null }> } | undefined {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) {
      return undefined;
    }
    return {
      question: pending.question,
      suggestions: pending.suggestions,
    };
  }
}

// Singleton instance
export const questionManager = new QuestionManager();

