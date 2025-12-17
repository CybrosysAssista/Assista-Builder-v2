/**
 * Client-side markdown renderer for webview
 * This module handles converting markdown text to HTML with syntax highlighting
 */

// Track if marked has been configured
let markedConfigured = false;

/**
 * Configure marked options for markdown parsing
 */
function configureMarked() {
    if (markedConfigured) {
        return true; // Already configured
    }

    if (typeof marked === 'undefined') {
        console.warn('[AssistaCoder] marked library not available');
        return false;
    }

    try {
        marked.setOptions({
            breaks: true, // Convert line breaks to <br>
            gfm: true,   // GitHub Flavored Markdown
            highlight: function (code, lang) {
                if (typeof hljs === 'undefined') {
                    return code;
                }
                return hljs.highlightAuto(code).value;

                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.warn('[AssistaCoder] Highlight.js error:', err);
                    }
                }

                // Auto-detect language if not specified
                try {
                    return hljs.highlightAuto(code).value;
                } catch (err) {
                    return code;
                }
            }
        });

        markedConfigured = true;
        return true;
    } catch (error) {
        console.error('[AssistaCoder] Error configuring marked:', error);
        return false;
    }
}

/**
 * Sanitize HTML to prevent XSS attacks
 */
function sanitizeHtml(html) {
    if (typeof DOMPurify === 'undefined') {
        console.warn('[AssistaCoder] DOMPurify not available, skipping sanitization');
        return html;
    }

    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 's', 'del', 'ins',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
            'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'hr', 'span', 'div', 'sub', 'sup'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'id'],
        ALLOWED_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    });
}

/**
 * Render markdown text to HTML
 * @param {string} markdown - The markdown text to render
 * @param {boolean} isStreaming - Whether this is streaming content (may be incomplete)
 * @returns {string} Rendered HTML string
 */
function renderMarkdown(markdown, isStreaming) {
    if (!markdown || !markdown.trim()) {
        return '';
    }

    // Configure marked if not already done
    if (!configureMarked()) {
        // Fallback: simple line break conversion
        return markdown.replace(/\n/g, '<br>');
    }

    try {
        // For streaming, we want to handle incomplete markdown gracefully
        // Marked can handle partial markdown, but we'll add some safety
        let markdownToRender = markdown;

        // If streaming and markdown ends with incomplete code block, close it temporarily
        if (isStreaming) {
            // Count backticks to see if we have an unclosed code block
            const backtickMatches = markdown.match(/```/g);
            if (backtickMatches && backtickMatches.length % 2 === 1) {
                // Odd number of backticks means unclosed code block
                // Add a closing backtick temporarily for rendering
                markdownToRender = markdown + '\n```';
            }
        }

        // Parse markdown to HTML
        const html = marked.parse(markdownToRender);

        // Sanitize to prevent XSS
        const cleanHtml = sanitizeHtml(html);

        return cleanHtml;
    } catch (error) {
        console.error('[AssistaCoder] Markdown rendering error:', error);
        // Fallback: escape HTML and convert line breaks
        return markdown
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }
}

/**
 * Check if markdown libraries are available
 */
function isMarkdownAvailable() {
    return typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined';
}

// Export for use in webview
if (typeof window !== 'undefined') {
    window.markdownRenderer = {
        renderMarkdown: function (markdown) {
            // Default to streaming mode for better real-time rendering
            return renderMarkdown(markdown, true);
        },
        renderMarkdownComplete: function (markdown) {
            // For final/complete markdown
            return renderMarkdown(markdown, false);
        },
        isMarkdownAvailable
    };
}