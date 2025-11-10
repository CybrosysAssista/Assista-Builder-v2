/**
 * Centralized error handling utilities
 */
import * as vscode from 'vscode';

export class ErrorHandler {
    /**
     * Handle and display error to user
     */
    static handle(error: Error | unknown, context: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Assista X] ${context}:`, error);
        vscode.window.showErrorMessage(`Assista X: ${context} - ${errorMessage}`);
    }

    /**
     * Log error without showing to user (for non-critical errors)
     */
    static log(error: Error | unknown, context: string): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[Assista X] ${context}:`, errorMessage);
    }
}

