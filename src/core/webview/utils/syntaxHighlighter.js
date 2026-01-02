/**
 * Applies basic syntax highlighting to a text string.
 * @param {string} text - The code text to highlight.
 * @param {string} [language] - Optional language for Highlight.js.
 * @returns {string} - The HTML string with syntax highlighting spans.
 */
export function applySyntaxHighlighting(text, language) {
    // Try using Highlight.js if available
    if (typeof window !== 'undefined' && window.hljs) {
        try {
            if (language && window.hljs.getLanguage(language)) {
                return window.hljs.highlight(text, { language }).value;
            }
            return window.hljs.highlightAuto(text).value;
        } catch (e) {
            console.warn('Highlight.js error:', e);
        }
    }

    // Fallback to custom regex highlighting
    // Escape HTML
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const tokens = [];
    const save = (cls, match) => {
        tokens.push({ cls, val: match });
        return `@@@TOKEN${tokens.length - 1}@@@`; // Use chars not matched by \w
    };

    // 1. Strings (Double and Single quotes)
    text = text.replace(/([\"'])(?:(?=(\\?))\2.)*?\1/g, m => save('hljs-string', m));

    // 2. Comments (Python # and JS //)
    text = text.replace(/(\/\/.*$|#.*$)/gm, m => save('hljs-comment', m));

    // 3. Keywords
    const kws = "import|from|class|def|return|if|else|elif|for|while|try|except|with|as|pass|print|const|let|var|function|async|await|new|this|export|default|public|private|protected|interface|type|module|true|false|null";
    text = text.replace(new RegExp(`\\b(${kws})\\b`, 'g'), m => save('hljs-keyword', m));

    // 4. Functions (word followed by paren)
    text = text.replace(/(\w+)(?=\()/g, m => save('hljs-function', m));

    // 5. Numbers (including decimals like 19.0, 3.14, etc.)
    text = text.replace(/\b(\d+\.\d+|\d+)\b/g, m => save('hljs-number', m));

    // 6. Attributes/Properties (match .word but only when . is followed by a letter, not a digit)
    // This avoids matching version numbers like 19.0 (which is already captured as a number above)
    text = text.replace(/(\.)[a-zA-Z_]\w*/g, m => save('hljs-attr', m));

    // Restore tokens
    tokens.forEach((token, i) => {
        const placeholder = `@@@TOKEN${i}@@@`;
        // Replace all occurrences of the placeholder
        text = text.split(placeholder).join(`<span class="${token.cls}">${token.val}</span>`);
    });

    return text;
}

/**
 * Applies diff-specific highlighting (red/green lines) along with syntax highlighting.
 * @param {string} text - The diff text to highlight.
 * @returns {string} - The HTML string with diff and syntax highlighting.
 */
export function applyDiffHighlighting(text) {
    let insideSearch = false;
    let insideReplace = false;

    let lines = text.split('\n');
    return lines.map(line => {
        // Handle markers for replace_file_content blocks
        if (line.startsWith('<<<<<<< SEARCH')) {
            insideSearch = true;
            return null; // Hide marker
        }
        if (line.startsWith('=======')) {
            insideSearch = false;
            insideReplace = true;
            return null; // Hide marker
        }
        if (line.startsWith('>>>>>>> REPLACE')) {
            insideReplace = false;
            return null; // Hide marker
        }

        // Hide apply_diff specific metadata
        if (line.trim().startsWith(':start_line:')) {
            return null;
        }
        if (line.trim() === '-------') {
            return null;
        }

        // Handle content based on state (for replace_file_content)
        if (insideSearch) {
            return `<span class="diff-remove">${applySyntaxHighlighting(line)}</span>`;
        }
        if (insideReplace) {
            return `<span class="diff-add">${applySyntaxHighlighting(line)}</span>`;
        }

        // Fallback for standard diffs (apply_diff)
        if (line.startsWith('+') && !line.startsWith('+++')) {
            const content = line.substring(1);
            return `<span class="diff-add">+${applySyntaxHighlighting(content)}</span>`;
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
            const content = line.substring(1);
            return `<span class="diff-remove">-${applySyntaxHighlighting(content)}</span>`;
        }

        // Context lines
        return `<span class="diff-context">${applySyntaxHighlighting(line)}</span>`;
    }).filter(line => line !== null).join('');
}
