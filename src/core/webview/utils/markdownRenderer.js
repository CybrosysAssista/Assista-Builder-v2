/**
 * Client-side markdown renderer for webview
 * This module handles converting markdown text to HTML with syntax highlighting
 */

// Track if marked has been configured
let markedConfigured = false;
let librariesReady = false;

/**
 * Wait for libraries to be available
 */
function waitForLibraries(callback, maxRetries = 50) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined' && typeof hljs !== 'undefined') {
        librariesReady = true;
        callback();
    } else if (maxRetries > 0) {
        setTimeout(() => waitForLibraries(callback, maxRetries - 1), 50);
    } else {
        console.error('[AssistaX] Markdown libraries failed to load');
    }
}

/**
 * Configure marked options for markdown parsing
 */
function configureMarked() {
    if (markedConfigured) {
        return true; // Already configured
    }
    
    if (typeof marked === 'undefined') {
        console.warn('[AssistaX] marked library not available');
        return false;
    }

    try {
        marked.setOptions({
            breaks: true, // Convert line breaks to <br>
            gfm: true,   // GitHub Flavored Markdown
            highlight: function(code, lang) {
                if (typeof hljs === 'undefined') {
                    return code;
                }
                
                // Try language-specific highlighting first
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.warn('[AssistaX] Highlight.js error:', err);
                    }
                }
                
                // Fallback to auto-detect language if not specified or language-specific failed
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
        console.error('[AssistaX] Error configuring marked:', error);
        return false;
    }
}

/**
 * Sanitize HTML to prevent XSS attacks
 */
function sanitizeHtml(html) {
    if (typeof DOMPurify === 'undefined') {
        console.warn('[AssistaX] DOMPurify not available, skipping sanitization');
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
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'id', 'style'],
        ALLOWED_DATA_ATTR: true,
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
        let markdownToRender = markdown;
        
        if (isStreaming) {
            // Handle unclosed code blocks
            const backtickMatches = markdown.match(/```/g);
            if (backtickMatches && backtickMatches.length % 2 === 1) {
                markdownToRender = markdown + '\n```';
            }
            
            // Handle unclosed inline code
            const inlineCodeMatches = markdown.match(/`/g);
            if (inlineCodeMatches && inlineCodeMatches.length % 2 === 1) {
                markdownToRender = markdownToRender + '`';
            }
            
            // Handle unclosed bold
            const boldMatches = markdownToRender.match(/\*\*/g);
            if (boldMatches && boldMatches.length % 2 === 1) {
                markdownToRender = markdownToRender + '**';
            }
            
            // Handle unclosed italic (count single asterisks, excluding **)
            const textWithoutBold = markdownToRender.replace(/\*\*/g, '');
            const italicMatches = textWithoutBold.match(/\*/g);
            if (italicMatches && italicMatches.length % 2 === 1) {
                markdownToRender = markdownToRender + '*';
            }
        }
        
        // Parse markdown to HTML
        const html = marked.parse(markdownToRender);
        
        // Sanitize to prevent XSS
        const cleanHtml = sanitizeHtml(html);
        
        return cleanHtml;
    } catch (error) {
        console.error('[AssistaX] Markdown rendering error:', error);
        
        // Try rendering paragraph by paragraph for better error recovery
        try {
            const paragraphs = markdown.split('\n\n');
            const rendered = paragraphs.map(para => {
                try {
                    return marked.parse(para);
                } catch {
                    return '<p>' + para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
                }
            });
            return sanitizeHtml(rendered.join(''));
        } catch {
            // Ultimate fallback: escape HTML and convert line breaks
            return markdown
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
        }
    }
}

/**
 * Check if markdown libraries are available
 */
function isMarkdownAvailable() {
    return typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined';
}

// Initialize when libraries are ready
if (typeof window !== 'undefined') {
    waitForLibraries(() => {
        configureMarked();
        console.log('[AssistaX] Markdown libraries loaded');
        window.dispatchEvent(new CustomEvent('markdown-ready'));
    });
    
    window.markdownRenderer = {
        renderMarkdown: function(markdown) {
            // Default to streaming mode for better real-time rendering
            return renderMarkdown(markdown, true);
        },
        renderMarkdownComplete: function(markdown) {
            // For final/complete markdown
            return renderMarkdown(markdown, false);
        },
        isMarkdownAvailable
    };
}

