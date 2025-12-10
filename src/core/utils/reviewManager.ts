import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { clearAgentDiffDecorations } from './decorationUtils.js';

interface PendingReview {
    message: string;
    resolve: (answer: 'accept' | 'reject') => void;
    reject: (error: Error) => void;
}

/**
 * Manages the "Accept/Reject" review flow between tools and the webview.
 */
class ReviewManager {
    private pendingReviews = new Map<string, PendingReview>();
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
     * Request a review (Accept/Reject) from the user via the webview banner
     */
    async requestReview(message: string): Promise<'accept' | 'reject'> {
        return new Promise((resolve, reject) => {
            // We use a unique ID for the review
            const reviewId = `review_${Date.now()}`;

            const pendingReview: PendingReview = {
                message,
                resolve: (answer: 'accept' | 'reject') => {
                    this.pendingReviews.delete(reviewId);
                    resolve(answer);
                },
                reject: (error: Error) => {
                    this.pendingReviews.delete(reviewId);
                    resolve('reject'); // Default to reject on error
                },
            };

            this.pendingReviews.set(reviewId, pendingReview);

            // Send request to webview
            if (this.webviewProvider) {
                this.webviewProvider.postMessage('requestReview', {
                    text: message
                });
            } else {
                // If no webview, default to reject or handle gracefully
                console.warn('ReviewManager: No webview provider registered. Auto-rejecting.');
                resolve('reject');
            }
        });
    }

    /**
     * Handle review response from webview
     */
    handleReviewResponse(answer: 'accept' | 'reject') {
        // Find the pending review (there should only be one active review at a time usually)
        for (const [key, pending] of this.pendingReviews.entries()) {
            if (key.startsWith('review_')) {
                pending.resolve(answer);
                return;
            }
        }
    }

    /**
     * Request a review for a file modification and handle the cleanup/revert logic.
     * This is a non-blocking operation (fire and forget from the caller's perspective).
     */
    requestFileReview(
        message: string,
        fullPath: string,
        originalContent: string | null,
        newContent: string,
        uri: vscode.Uri
    ): void {
        this.requestReview(message).then(async (choice) => {
            // Clear decorations
            // Clear decorations
            clearAgentDiffDecorations(uri);

            if (choice === 'reject') {
                if (originalContent !== null) {
                    await fs.writeFile(fullPath, originalContent, 'utf-8');
                } else {
                    // It was a new file, so delete it
                    try {
                        await fs.unlink(fullPath);
                    } catch (e) {
                        // Ignore if already gone
                    }
                }
            } else {
                // User Accepted: Write the CLEAN new content
                await fs.writeFile(fullPath, newContent, 'utf-8');
            }
        });
    }
}

// Singleton instance
export const reviewManager = new ReviewManager();

