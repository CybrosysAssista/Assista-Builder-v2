import * as vscode from 'vscode';
import { diffLines } from 'diff';
import * as fs from 'fs/promises';
import * as path from 'path';
import { reviewManager } from './reviewManager.js';

// 1. Create decoration styles
// Using "Windsurf-like" styles with border and background
const addedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(76, 175, 80, 0.18)',  // Green-ish background
    isWholeLine: true,                            // Highlight full lines
    borderWidth: '0 0 0 3px',                     // Left border
    borderStyle: 'solid',
    borderColor: 'rgba(76, 175, 80, 0.9)',        // Solid green border
});

const removedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(244, 67, 54, 0.18)',   // Red-ish background
    isWholeLine: true,
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: 'rgba(244, 67, 54, 0.9)',
});

// 2. Track old text for each document
const previousTextByUri = new Map<string, string>();

// Track pending decorations for persistence
const pendingDecorations = new Map<string, { added: vscode.Range[], removed: vscode.Range[] }>();

export function rememberCurrentTextByUri(uri: vscode.Uri) {
    // We can only remember text if the document is currently open in VS Code
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (doc) {
        previousTextByUri.set(uri.toString(), doc.getText());
    }
}

// 3. Show decorations


/**
 * Generates a "merged" content string that includes both removed and added lines,
 * and returns the ranges to decorate them.
 */
export function generateMergedContent(oldText: string, newText: string) {
    const diffs = diffLines(oldText, newText);

    let mergedContent = '';
    const addedRanges: vscode.Range[] = [];
    const removedRanges: vscode.Range[] = [];

    // Track the current line number in the merged content
    let currentLine = 0;

    for (const part of diffs) {
        // diffLines returns parts with a 'value' that may contain multiple lines.
        // We need to split them to count lines accurately.
        const lines = part.value.split(/\r?\n/);

        // If the last element is empty (because value ended with newline), remove it
        // unless it's the only element (empty string)
        if (lines.length > 1 && lines[lines.length - 1] === '') {
            lines.pop();
        }

        const lineCount = lines.length;

        // Calculate the range for this part
        // Start at the current line
        const startLine = currentLine;
        // End at current + count - 1
        const endLine = currentLine + lineCount - 1;

        // Create a range covering these lines (full lines)
        // We use a large number for character to ensure full line coverage if needed,
        // but since we use isWholeLine: true in decoration, line numbers are enough.
        const range = new vscode.Range(startLine, 0, endLine, 1000);

        if (part.added) {
            addedRanges.push(range);
        } else if (part.removed) {
            removedRanges.push(range);
        }

        // Add to merged content
        mergedContent += part.value;

        // Update current line count
        // We need to count exactly how many newlines were added
        const newlines = (part.value.match(/\n/g) || []).length;
        currentLine += newlines;
    }

    return { mergedContent, addedRanges, removedRanges };
}

/**
 * Applies decorations to the document based on the pre-calculated ranges.
 */
export function decorateMergedDoc(doc: vscode.TextDocument, diffData: { addedRanges: vscode.Range[], removedRanges: vscode.Range[] }) {
    // Store for persistence
    pendingDecorations.set(doc.uri.toString(), {
        added: diffData.addedRanges,
        removed: diffData.removedRanges
    });

    const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
    if (editor) {
        editor.setDecorations(addedDecoration, diffData.addedRanges);
        editor.setDecorations(removedDecoration, diffData.removedRanges);
    }
}

export function restoreDecorations(editor: vscode.TextEditor) {
    const uri = editor.document.uri.toString();
    const decorations = pendingDecorations.get(uri);
    if (decorations) {
        editor.setDecorations(addedDecoration, decorations.added);
        editor.setDecorations(removedDecoration, decorations.removed);
    }
}

export function clearAgentDiffDecorations(arg: vscode.TextDocument | vscode.Uri) {
    const uri = 'uri' in arg ? arg.uri : arg;
    const uriStr = uri.toString();

    // Clear from map
    pendingDecorations.delete(uriStr);

    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uriStr);
    if (editor) {
        editor.setDecorations(addedDecoration, []);
        editor.setDecorations(removedDecoration, []);
    }
}

/**
 * Centralized function to apply a visual diff to a file and trigger a review.
 * 
 * 1. Reads original content (if not provided).
 * 2. Remembers current text for revert.
 * 3. Generates "merged" content (old + new lines).
 * 4. Writes merged content to file.
 * 5. Applies decorations (green for added, red for removed).
 * 6. Triggers the review manager to ask for Accept/Reject.
 */
export async function applyVisualDiff(
    fullPath: string,
    newContent: string,
    messagePrefix: string = 'Agent modified',
    providedOriginalContent?: string
) {
    const uri = vscode.Uri.file(fullPath);

    // 1. Get Original Content
    let originalContent = providedOriginalContent;
    if (originalContent === undefined) {
        try {
            originalContent = await fs.readFile(fullPath, 'utf-8');
        } catch (error) {
            // File likely doesn't exist (new file)
            originalContent = '';
        }
    }

    // 2. Remember old text for revert
    // We manually set it because rememberCurrentTextByUri relies on VS Code document which might be dirty or not open
    if (originalContent !== null) {
        previousTextByUri.set(uri.toString(), originalContent);
    }

    // 3. Generate MERGED content for visualization
    const { mergedContent, addedRanges, removedRanges } = generateMergedContent(originalContent, newContent);

    // 4. Write MERGED content to file
    await fs.writeFile(fullPath, mergedContent, 'utf-8');

    // 5. Show decorations on the merged content
    // We use a small timeout to ensure VS Code has processed the file change event
    setTimeout(() => {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (doc) {
            decorateMergedDoc(doc, { addedRanges, removedRanges });
        }
    }, 200);

    // 6. Ask user to Accept or Reject via Webview Banner (Non-blocking)
    reviewManager.requestFileReview(
        `${messagePrefix} ${path.basename(fullPath)}`,
        fullPath,
        originalContent,
        newContent,
        uri
    );
}
