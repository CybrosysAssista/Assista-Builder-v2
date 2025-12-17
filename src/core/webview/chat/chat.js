import { initMentionsUI } from '../mentions/mentions.js';
import { initReviewUI } from '../review/review.js';

export function initChatUI(vscode) {


    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const welcomeEl = document.getElementById('welcomeScreen');
    const inputBar = document.querySelector('.input-bar');
    // New chatbox toolbar controls
    const addBtn = document.getElementById('addBtn');
    const modeToggle = document.getElementById('modeToggle');
    const modeDropdown = document.getElementById('modeDropdown');
    const modeLabel = document.getElementById('modeLabel');
    const modelToggle = document.getElementById('modelToggle');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelLabel = document.getElementById('modelLabel');
    const mentionBtn = document.getElementById('mentionBtn');
    const mentionMenu = document.getElementById('mentionMenu');
    const micBtn = document.getElementById('micBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    // Initialize Review UI
    const { showReviewBanner, hideReviewBanner } = initReviewUI(vscode);

    let isBusy = false;
    let activeSessionId;
    // Local UI state (vanilla JS equivalent of React state)
    let selectedMode = 'agent';
    let selectedModel = 'gpt5-low';
    let showModeMenu = false;
    let showModelMenu = false;

    function showChatArea() {
        try {
            // Show messages immediately (behind welcome screen if it's visible)
            if (messagesEl) {
                messagesEl.classList.add("active");
            }
            if (inputBar) {
                inputBar.style.display = "";
            }

            // Smoothly hide welcome screen
            if (typeof window.hideWelcome === 'function') {
                window.hideWelcome();
            } else if (welcomeEl) {
                if (welcomeEl.classList.contains("active")) {
                    welcomeEl.classList.remove("active");
                    welcomeEl.setAttribute("aria-hidden", "true");
                    // Wait for fade out
                    setTimeout(() => {
                        welcomeEl.style.display = "none";
                    }, 300);
                } else {
                    // If not active, ensure it's hidden if not already animating
                    // Check computed style or just set it if we're sure
                    if (welcomeEl.style.display !== "none" && welcomeEl.style.opacity === "") {
                        welcomeEl.style.display = "none";
                    }
                }
            }
        } catch (_) {
            // no-op
        }
    }

    function toggleBusy(state) {
        isBusy = !!state;
        try {
            if (sendBtn) {
                sendBtn.disabled = isBusy;
                sendBtn.classList.toggle("hidden", isBusy);
            }
            if (stopBtn) {
                stopBtn.disabled = !isBusy;
                stopBtn.classList.toggle("visible", isBusy);
            }
        } catch (_) {
            // ignore styling errors
        }
    }

    function enhanceMarkdownContent(container) {
        if (!container) {
            return;
        }
        container.querySelectorAll("a").forEach((link) => {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noreferrer noopener");
        });
        container.querySelectorAll("table").forEach((table) => {
            table.setAttribute("role", "table");
        });

        // Convert JSON tool calls to code blocks
        // Use TreeWalker to find ALL text nodes containing "toolCall":
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToWrap = [];
        while (node = walker.nextNode()) {
            if (node.textContent.includes('"toolCall":') || node.textContent.includes("'toolCall':")) {
                nodesToWrap.push(node);
            }
        }

        nodesToWrap.forEach(node => {
            // If parent is already pre/code, skip
            if (node.parentNode.nodeName === 'PRE' || node.parentNode.nodeName === 'CODE') return;

            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.textContent = node.textContent;
            pre.appendChild(code);

            // If parent is P and this is the only child, replace parent
            if (node.parentNode.nodeName === 'P' && node.parentNode.childNodes.length === 1) {
                node.parentNode.replaceWith(pre);
            } else {
                node.replaceWith(pre);
            }
        });

        // Custom Syntax Highlighting
        // Apply to ALL code blocks (inline and block)
        container.querySelectorAll("code").forEach((block) => {
            if (block.children.length > 0) return;

            let text = block.textContent;

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

            block.innerHTML = text;
            block.classList.add("hljs");
        });

        // Add headers to code blocks
        container.querySelectorAll("pre").forEach((pre) => {
            // Skip if already wrapped
            if (pre.parentElement?.classList.contains('code-block-wrapper')) return;

            const code = pre.querySelector('code');
            if (!code) return;

            // Extract filename from class (format: language-ext-filename.ext)
            let filename = 'Code';
            const codeClasses = code.className.split(' ');
            for (const cls of codeClasses) {
                if (cls.startsWith('language-')) {
                    const lang = cls.replace('language-', '');
                    if (lang.includes('-')) {
                        // Format: ext-filename.ext (e.g., py-example.py)
                        // Extract only the filename part (everything after first dash)
                        const parts = lang.split('-');
                        if (parts.length >= 2) {
                            filename = parts.slice(1).join('-');
                        } else {
                            filename = lang;
                        }
                    } else if (lang.includes('.')) {
                        filename = lang;
                    } else {
                        filename = lang;
                    }
                    break;
                }
            }

            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            // Create header
            const header = document.createElement('div');
            header.className = 'code-block-header';

            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'code-filename';
            filenameSpan.textContent = filename;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-copy-btn';
            copyBtn.title = 'Copy code';
            copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

            copyBtn.addEventListener('click', () => {
                const codeText = code.textContent || '';
                navigator.clipboard.writeText(codeText).then(() => {
                    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
                    setTimeout(() => {
                        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
                    }, 2000);
                }).catch(() => {
                    // Fallback for older browsers
                    const textarea = document.createElement('textarea');
                    textarea.value = codeText;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                });
            });

            header.appendChild(filenameSpan);
            header.appendChild(copyBtn);

            // Replace pre with wrapper
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
    }

    let streamingMessageBubble = null;
    let streamingTextBuffer = '';
    let streamingRenderTimeout = null;
    let streamingRow = null;
    // Track tool execution UI elements by toolId
    const toolExecutionElements = new Map();

    function appendMessage(text, sender, html, markdown) {
        if (!messagesEl || (!text && !html && !markdown)) {
            return;
        }
        showChatArea();

        // Finalize streaming if active before appending new message
        if (streamingRow && streamingRow.parentNode) {
            finalizeStreamingMessage();
        }

        const row = document.createElement("div");
        row.className = "message-row";
        const bubble = document.createElement("div");
        bubble.className = `message ${sender || "ai"}`;

        if (sender === "ai") {
            bubble.classList.add("markdown");

            // Prefer client-side markdown rendering (use complete mode for final messages)
            if (markdown && typeof window.markdownRenderer !== 'undefined') {
                const renderFn = window.markdownRenderer.renderMarkdownComplete || window.markdownRenderer.renderMarkdown;
                const renderedHtml = renderFn(markdown);
                bubble.innerHTML = renderedHtml;
            } else if (html) {
                // Fallback to HTML if provided (for backwards compatibility)
                bubble.innerHTML = html;
            } else {
                bubble.textContent = text;
            }

            enhanceMarkdownContent(bubble);
        } else {
            bubble.textContent = text;
        }

        row.appendChild(bubble);
        messagesEl.appendChild(row);
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }

    function appendStreamingChunk(text) {
        if (!messagesEl) {
            return;
        }
        showChatArea();

        // Check if we need to create a new streaming message
        if (!streamingMessageBubble) {
            // Create new row and bubble for streaming
            streamingRow = document.createElement("div");
            streamingRow.className = "message-row";
            streamingMessageBubble = document.createElement("div");
            streamingMessageBubble.className = "message ai markdown";
            streamingRow.appendChild(streamingMessageBubble);
            messagesEl.appendChild(streamingRow);
            streamingTextBuffer = '';
        }

        // Append text to buffer
        streamingTextBuffer += text;

        // Render markdown in real-time as chunks arrive (no debounce for true real-time)
        if (typeof window.markdownRenderer !== 'undefined' && window.markdownRenderer.renderMarkdown) {
            // Use requestAnimationFrame for smooth rendering tied to browser refresh rate
            // This provides true real-time rendering without hardcoded delays
            if (streamingRenderTimeout) {
                cancelAnimationFrame(streamingRenderTimeout);
            }

            streamingRenderTimeout = requestAnimationFrame(() => {
                try {
                    // Use streaming mode for real-time rendering
                    const renderedHtml = window.markdownRenderer.renderMarkdown(streamingTextBuffer);
                    streamingMessageBubble.innerHTML = renderedHtml;
                    // Enhance markdown content (syntax highlighting, code blocks, etc.)
                    enhanceMarkdownContent(streamingMessageBubble);
                } catch (error) {
                    console.error('[AssistaX] Error rendering streaming markdown:', error);
                    // Fallback to plain text if rendering fails
                    streamingMessageBubble.textContent = streamingTextBuffer;
                }
                streamingRenderTimeout = null;
            });
        } else {
            // Fallback: show plain text if markdown renderer not available
            streamingMessageBubble.textContent = streamingTextBuffer;
        }

        // Scroll to bottom smoothly
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'auto' });
    }

    function finalizeStreamingMessage() {
        // Clear any pending render frame
        if (streamingRenderTimeout) {
            cancelAnimationFrame(streamingRenderTimeout);
            streamingRenderTimeout = null;
        }

        // Final render of any remaining content (use complete mode for final render)
        if (streamingMessageBubble && streamingTextBuffer) {
            if (typeof window.markdownRenderer !== 'undefined') {
                try {
                    // Use complete mode for final render
                    const renderFn = window.markdownRenderer.renderMarkdownComplete || window.markdownRenderer.renderMarkdown;
                    const renderedHtml = renderFn(streamingTextBuffer);
                    streamingMessageBubble.innerHTML = renderedHtml;
                    enhanceMarkdownContent(streamingMessageBubble);
                } catch (error) {
                    console.error('[AssistaX] Error in final render:', error);
                    streamingMessageBubble.textContent = streamingTextBuffer;
                }
            }
        }

        // Keep streamingRow for replacement - don't reset it yet
        // Reset other state but keep row reference
        streamingMessageBubble = null;
        streamingTextBuffer = '';
    }

    function replaceStreamingMessage(text, html, markdown) {
        // Clear any pending render frame
        if (streamingRenderTimeout) {
            cancelAnimationFrame(streamingRenderTimeout);
            streamingRenderTimeout = null;
        }

        // Check if we have a streaming row to replace
        if (streamingRow && streamingRow.parentNode === messagesEl) {
            // Find the bubble in the streaming row
            const bubble = streamingRow.querySelector('.message.ai');
            if (bubble) {
                // Replace the streaming bubble content with the final rendered message
                bubble.classList.add('markdown');

                // Prefer client-side markdown rendering (use complete mode for final messages)
                if (markdown && typeof window.markdownRenderer !== 'undefined') {
                    const renderFn = window.markdownRenderer.renderMarkdownComplete || window.markdownRenderer.renderMarkdown;
                    const renderedHtml = renderFn(markdown);
                    bubble.innerHTML = renderedHtml;
                } else if (html) {
                    // Fallback to HTML if provided
                    bubble.innerHTML = html;
                } else {
                    bubble.textContent = text;
                }

                enhanceMarkdownContent(bubble);

                // Reset streaming state
                streamingMessageBubble = null;
                streamingTextBuffer = '';
                streamingRow = null;
                return;
            }
        }

        // No streaming message to replace, create new one
        appendMessage(text, 'ai', html, markdown);

        // Reset streaming state
        streamingMessageBubble = null;
        streamingTextBuffer = '';
        streamingRow = null;
    }

    function clearInput() {
        if (!inputEl) return;
        inputEl.innerHTML = "";
        inputEl.style.height = "";
        if (sendBtn) sendBtn.disabled = true;
    }

    function insertAtCursor(text) {
        if (!inputEl) return;
        inputEl.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            inputEl.textContent += text;
        }
        inputEl.dispatchEvent(new Event('input'));
    }



    // We need to store messages globally in this closure to persist them when model changes
    let currentMessages = [];

    function renderSession(sessionId, messages) {
        if (!messagesEl) {
            return;
        }

        messagesEl.innerHTML = "";
        activeSessionId = sessionId;
        currentMessages = Array.isArray(messages) ? messages : [];

        // Reset streaming state
        streamingMessageBubble = null;
        streamingTextBuffer = '';
        streamingRow = null;
        if (streamingRenderTimeout) {
            cancelAnimationFrame(streamingRenderTimeout);
            streamingRenderTimeout = null;
        }


        if (Array.isArray(messages)) {
            messages.forEach((message) => {
                if (message.command === 'requestReview') {
                    showReviewBanner(message.text || 'Changes pending review');
                    return;
                }

                if (message.command === 'showQuestion') {
                    showQuestion(message.id, message.question, message.suggestions);
                    return;
                }
                if (message.suggestions && message.suggestions.length > 0) {
                    showQuestion(
                        null, // No active questionId for history
                        message.content,
                        message.suggestions,
                        message.selection
                    );
                } else if (message.role === "user" && message.selection) {
                    // Skip user messages that are just selections for questions
                    // as they are already displayed in the question UI
                    return;
                } else {
                    const role =
                        (message.role === "assistant" || message.role === "tool")
                            ? "ai"
                            : message.role === "system"
                                ? "system"
                                : "user";
                    appendMessage(
                        String(message.content ?? ""),
                        role,
                        typeof message.html === "string" ? message.html : undefined,
                        typeof message.markdown === "string" ? message.markdown : undefined
                    );

                    // Show tool executions if present
                    if (message.toolExecutions && Array.isArray(message.toolExecutions)) {
                        message.toolExecutions.forEach(exec => {
                            showToolExecution({
                                toolId: exec.toolId,
                                toolName: exec.toolName,
                                filename: exec.filename,
                                status: exec.status,
                                args: exec.args
                            });
                        });
                    }
                }
            });
        }

        if (!messages || !messages.length) {
            // Show welcome screen if no messages
            if (typeof window.showWelcome === 'function') {
                window.showWelcome();
            } else if (welcomeEl) {
                // Fallback if helper not available
                welcomeEl.style.display = "";
                welcomeEl.classList.add("active");
                welcomeEl.setAttribute("aria-hidden", "false");
            }
        } else {
            showChatArea();
        }

        toggleBusy(false);

        persistState();
    }

    function persistState() {
        try {
            vscode.setState?.({
                activeSessionId,
                messages: currentMessages,
                selectedMode,
                selectedModel,
                selectedModelLabel: modelLabel ? modelLabel.textContent : undefined
            });
        } catch (_) {
            // ignore persistence issues
        }
    }

    function clearMessages() {
        if (messagesEl) {
            messagesEl.innerHTML = "";
        }
        // Reset streaming state
        streamingMessageBubble = null;
        streamingTextBuffer = '';
        streamingRow = null;
        if (streamingRenderTimeout) {
            clearTimeout(streamingRenderTimeout);
            streamingRenderTimeout = null;
        }
    }

    function sendMessage() {
        if (!inputEl) {
            return;
        }
        const text = inputEl.innerText.trim();
        if (!text) {
            return;
        }

        // Validate model selection
        if (selectedModel !== 'custom-api') {
            appendMessage("You don't have the subscription. You need to have the subscription to access this model.", 'system');
            return;
        }

        const historyPage = document.getElementById('historyPage');
        const settingsPage = document.getElementById('settingsPage');

        if (historyPage) historyPage.style.display = 'none';
        if (settingsPage) settingsPage.style.display = 'none';
        if (messagesEl) messagesEl.style.display = '';
        if (inputBar) inputBar.style.display = '';

        appendMessage(text, "user");
        clearInput();
        toggleBusy(true);

        vscode.postMessage({ command: "userMessage", text, mode: selectedMode, model: selectedModel });
    }

    // --- New UI: toolbar behaviors ---
    function closeMenus() {
        try {
            if (modeDropdown) modeDropdown.classList.remove('visible');
            if (modelDropdown) modelDropdown.classList.remove('visible');
            showModeMenu = false; showModelMenu = false;
        } catch (_) { /* no-op */ }
    }

    // Mentions module
    const mentions = initMentionsUI(vscode, {
        inputEl,
        mentionBtn,
        menuEl: mentionMenu,
        insertAtCursor,
    });

    function applyMode(mode) {
        selectedMode = mode;
        if (modeLabel) modeLabel.textContent = mode === 'agent' ? 'Agent' : 'Chat';

        const chatIcon = document.querySelector('#modeIcon .mode-icon-chat');
        const agentIcon = document.querySelector('#modeIcon .mode-icon-agent');

        if (mode === 'chat') {
            if (chatIcon) chatIcon.style.display = '';
            if (agentIcon) agentIcon.style.display = 'none';
        } else {
            if (chatIcon) chatIcon.style.display = 'none';
            if (agentIcon) agentIcon.style.display = '';
        }

        // Optional: inform host of mode change in the future
        persistState();
    }

    function applyModel(model, labelText) {
        selectedModel = model;
        if (modelLabel && labelText) modelLabel.textContent = labelText;

        // Sync to welcome screen
        const welcomeLabel = document.getElementById('welcomeModelLabel');
        if (welcomeLabel && labelText) welcomeLabel.textContent = labelText;

        persistState();
    }

    // Toggle menus
    modeToggle?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        showModeMenu = !showModeMenu;
        if (modeDropdown) modeDropdown.classList.toggle('visible', showModeMenu);
        if (showModeMenu && modelDropdown) modelDropdown.classList.remove('visible');
    });
    modelToggle?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        showModelMenu = !showModelMenu;
        if (modelDropdown) modelDropdown.classList.toggle('visible', showModelMenu);
        if (showModelMenu && modeDropdown) modeDropdown.classList.remove('visible');
    });

    // Dropdown item selects
    modeDropdown?.addEventListener('click', (e) => {
        const btn = e.target.closest('button.item');
        if (!btn) return;
        const mode = btn.getAttribute('data-mode');
        if (!mode) return;
        applyMode(mode);
        closeMenus();
    });
    modelDropdown?.addEventListener('click', (e) => {
        const btn = e.target.closest('button.item');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'custom-api') {
            applyModel('custom-api', 'Custom API');
            closeMenus();
            return;
        }
        const model = btn.getAttribute('data-model');
        if (!model) return;
        const labelText = btn.querySelector('span')?.textContent || '';
        applyModel(model, labelText);
        closeMenus();
    });

    // Click outside to close menus
    document.addEventListener('mousedown', (e) => {
        if (modeDropdown && !modeDropdown.contains(e.target) && modeToggle && !modeToggle.contains(e.target)) {
            modeDropdown.classList.remove('visible');
            showModeMenu = false;
        }
        if (modelDropdown && !modelDropdown.contains(e.target) && modelToggle && !modelToggle.contains(e.target)) {
            modelDropdown.classList.remove('visible');
            showModelMenu = false;
        }
        // mention menu handled by mentions.js
    });
    // Escape and outside click handled by mentions.js

    // Plus, Mic, Settings placeholders (Mention handled by mentions.js)
    addBtn?.addEventListener('click', () => {
        try { vscode.postMessage({ command: 'quickActions' }); } catch (_) { }
    });
    // Mention UI fully handled by mentions.js

    // Pass-through to mentions module
    function setMentionRecentNames(names) { mentions.setRecentNames(names); }
    function setPickerItems(items) { mentions.setPickerItems?.(items); }
    micBtn?.addEventListener('click', () => {
        try { vscode.postMessage({ command: 'voiceInput' }); } catch (_) { }
    });
    settingsBtn?.addEventListener('click', () => {
        try { vscode.postMessage({ command: 'loadSettings' }); } catch (_) { }
    });

    // Ctrl+L to focus input
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            inputEl?.focus();
        }
    });

    if (sendBtn) {
        sendBtn.addEventListener("click", sendMessage);
    }

    if (inputEl) {
        inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });



        // Handle paste event to strip HTML formatting and paste only plain text
        inputEl.addEventListener('paste', (event) => {
            event.preventDefault();

            // Get plain text from clipboard
            const text = (event.clipboardData || window.clipboardData).getData('text/plain');

            // Insert plain text at cursor position
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            range.deleteContents();

            // Insert text as text node (not HTML)
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);

            // Move cursor to end of inserted text
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            // Trigger input event to update UI
            inputEl.dispatchEvent(new Event('input'));
        });

        inputEl.addEventListener('input', () => {
            try {
                // Fix: contenteditable often leaves a <br> when cleared, preventing :empty from working
                if (inputEl.innerHTML === '<br>' || inputEl.textContent.trim() === '') {
                    inputEl.innerHTML = '';
                }

                // Auto-resize
                inputEl.style.height = 'auto';
                inputEl.style.height = `${Math.min(Math.max(inputEl.scrollHeight, 28), 160)}px`;

                // Mention logic
                // ... (existing mention logic is handled by mentions.js via initMentionsUI)

                // Enable/disable send button
                if (sendBtn) sendBtn.disabled = !inputEl.innerText.trim();
            } catch (_) {
                // ignore sizing issues
            }
        });
        // Initialize disabled state
        try { if (sendBtn) sendBtn.disabled = !inputEl.innerText.trim(); } catch (_) { }
    }

    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            toggleBusy(false);
            vscode.postMessage({ command: "cancel" });
        });
    }

    function showQuestion(questionId, questionText, suggestions, selectedAnswer = null) {
        if (!messagesEl) return;
        showChatArea();

        // Create question container
        const row = document.createElement("div");
        row.className = "message-row";
        if (questionId) {
            row.setAttribute('data-question-id', questionId);
        }

        const questionContainer = document.createElement("div");
        questionContainer.className = "question-container";

        // Question text
        const questionEl = document.createElement("div");
        questionEl.className = "question-text";
        questionEl.textContent = questionText;

        // Suggestions container
        const suggestionsEl = document.createElement("div");
        suggestionsEl.className = "question-suggestions";

        // Track if question is answered
        let isAnswered = !!selectedAnswer;

        suggestions.forEach((suggestion, index) => {
            const button = document.createElement("button");
            button.className = "question-suggestion-btn";
            button.textContent = suggestion.text;

            if (selectedAnswer) {
                button.disabled = true;
                button.style.opacity = '0.5';
                button.style.cursor = 'not-allowed';
                if (suggestion.text === selectedAnswer) {
                    button.classList.add('question-selected');
                    button.disabled = false; // Keep it enabled for visual feedback
                    button.style.opacity = '1';
                    button.style.cursor = 'default';
                }
            }

            button.addEventListener('click', () => {
                if (isAnswered) return; // Prevent multiple selections

                isAnswered = true;

                // Send answer back to extension
                try {
                    vscode.postMessage({
                        command: 'answerQuestion',
                        questionId: questionId,
                        answer: suggestion.text,
                        mode: suggestion.mode || null,
                    });
                } catch (e) {
                    console.error('Failed to send answer:', e);
                }

                // Mark all buttons as disabled
                suggestionsEl.querySelectorAll('.question-suggestion-btn').forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                });

                // Highlight selected button with green border
                button.classList.add('question-selected');
                button.disabled = false; // Keep it enabled for visual feedback
                button.style.opacity = '1';
                button.style.cursor = 'default';

                // Hide cancel button
                const cancelBtn = questionContainer.querySelector('.question-cancel-btn');
                if (cancelBtn) {
                    cancelBtn.style.display = 'none';
                }
            });
            suggestionsEl.appendChild(button);
        });

        questionContainer.appendChild(questionEl);
        questionContainer.appendChild(suggestionsEl);

        // Cancel button (only if not answered)
        if (!selectedAnswer) {
            const cancelBtn = document.createElement("button");
            cancelBtn.className = "question-cancel-btn";
            cancelBtn.textContent = "Cancel";
            cancelBtn.addEventListener('click', () => {
                if (isAnswered) return; // Prevent cancellation after answering

                try {
                    vscode.postMessage({
                        command: 'cancelQuestion',
                        questionId: questionId,
                    });
                } catch (e) {
                    console.error('Failed to cancel question:', e);
                }
                row.remove();
            });
            questionContainer.appendChild(cancelBtn);
        }

        row.appendChild(questionContainer);
        messagesEl.appendChild(row);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function createMinimalFileItem(filePath, status) {
        // Create block
        const block = document.createElement('div');
        block.className = 'minimal-tool-item';

        // Header
        const header = document.createElement('div');
        header.className = 'minimal-tool-header';

        // Icon
        const iconSpan = document.createElement('span');
        iconSpan.className = 'minimal-tool-icon';
        const isFolder = filePath.endsWith('/') || filePath.endsWith('\\');
        if (isFolder) {
            iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
        } else {
            iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
        }
        header.appendChild(iconSpan);

        // Label
        const label = document.createElement('span');
        label.className = 'minimal-tool-label';
        const fileName = filePath.split(/[/\\]/).pop();
        label.textContent = `Read ${fileName}`;
        header.appendChild(label);

        // Status
        const statusIcon = document.createElement('span');
        statusIcon.className = 'minimal-status-icon';
        if (status === 'loading') {
            statusIcon.classList.add('loading');
            statusIcon.innerHTML = '...';
        }
        header.appendChild(statusIcon);

        // Content
        const contentArea = document.createElement('div');
        contentArea.className = 'minimal-tool-content';

        block.appendChild(header);
        block.appendChild(contentArea);

        // Toggle
        header.addEventListener('click', () => {
            if (contentArea.innerHTML.trim() !== "") {
                contentArea.classList.toggle('visible');
            }
        });

        return { block, header, statusIcon, contentArea };
    }

    function showToolExecution({ toolId, toolName, filename, status, args }) {
        if (!messagesEl) return;
        showChatArea();

        // Create message row
        const row = document.createElement("div");
        row.className = "message-row";
        row.setAttribute('data-tool-id', toolId);

        // Special handling for read_file
        if (toolName === 'read_file' && args && args.files && Array.isArray(args.files)) {
            const container = document.createElement('div');
            container.className = 'read-file-container minimal';

            const fileBlocks = new Map();

            args.files.forEach(file => {
                const { block, header, statusIcon, contentArea } = createMinimalFileItem(file.path, status);

                container.appendChild(block);
                fileBlocks.set(file.path, { header, statusIcon, contentArea });
            });

            row.appendChild(container);
            messagesEl.appendChild(row);
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

            toolExecutionElements.set(toolId, { row, container, fileBlocks, toolName });
            return;
        }

        // Main Container
        const container = document.createElement('div');
        container.className = 'composer-code-block-container composer-message-codeblock';

        // Header
        const header = document.createElement('div');
        header.className = 'composer-code-block-header';

        // File Info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'composer-code-block-file-info';

        // Icon
        const iconSpan = document.createElement('span');
        iconSpan.className = 'composer-primary-toolcall-icon';
        // Simple file icon SVG
        iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;

        // Filename
        const nameSpan = document.createElement('span');
        nameSpan.className = 'composer-code-block-filename';
        nameSpan.textContent = filename || toolName || 'Command';

        // Status Text (Diff stats position)
        const statusTextSpan = document.createElement('span');
        statusTextSpan.className = 'composer-code-block-status';

        fileInfo.appendChild(iconSpan);
        fileInfo.appendChild(nameSpan);
        fileInfo.appendChild(statusTextSpan);

        // Right-side controls (spinner/checkmark)
        const rightControls = document.createElement('div');
        rightControls.style.display = 'flex';
        rightControls.style.alignItems = 'center';

        const statusIcon = document.createElement('div');
        statusIcon.className = 'composer-status-icon';
        if (status === 'loading') {
            statusIcon.classList.add('loading');
            statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2 A10 10 0 0 1 22 12" stroke-linecap="round"/></svg>`;
        } else {
            statusIcon.classList.add('completed');
            statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        }

        rightControls.appendChild(statusIcon);

        header.appendChild(fileInfo);
        header.appendChild(rightControls);

        // Content Area
        const contentArea = document.createElement('div');
        contentArea.className = 'composer-code-block-content';

        // Populate content from args if available
        if (args) {
            let contentToShow = '';
            // Check for various potential property names based on tool definitions
            if (args.content) {
                contentToShow = args.content; // write_to_file
            } else if (args.diff) {
                contentToShow = args.diff; // apply_diff
            } else if (args.CodeContent) {
                contentToShow = args.CodeContent;
            } else if (args.ReplacementContent) {
                contentToShow = args.ReplacementContent;
            } else if (args.CommandLine) {
                contentToShow = args.CommandLine;
            } else if (args.Query) {
                contentToShow = args.Query;
            } else if (typeof args === 'object') {
                // Format JSON nicely, excluding large fields handled above if mixed
                const safeArgs = { ...args };
                // Maybe show partial args? 
                contentToShow = JSON.stringify(safeArgs, null, 2);
            } else {
                contentToShow = String(args);
            }

            if (contentToShow) {
                const pre = document.createElement('pre');
                pre.textContent = contentToShow;
                contentArea.appendChild(pre);
                contentArea.classList.add('visible');
            }
        }

        container.appendChild(header);
        container.appendChild(contentArea);

        row.appendChild(container);
        messagesEl.appendChild(row);
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

        // Toggle content visibility on header click
        header.addEventListener('click', () => {
            if (contentArea.innerHTML.trim() !== "") {
                if (contentArea.classList.contains('visible')) {
                    contentArea.classList.remove('visible');
                } else {
                    contentArea.classList.add('visible');
                }
            }
        });

        // Store reference including contentArea and toolName
        toolExecutionElements.set(toolId, { row, container, header, statusIcon, contentArea, toolName });
    }

    function updateToolExecution({ toolId, status, result }) {
        const toolExec = toolExecutionElements.get(toolId);
        if (!toolExec) return;

        const { statusIcon, contentArea, toolName, fileBlocks } = toolExec;

        if (toolName === 'read_file' && fileBlocks) {
            if (status === 'completed' && result && result.files) {
                result.files.forEach(fileResult => {
                    const block = fileBlocks.get(fileResult.path);
                    if (block) {
                        const { statusIcon, contentArea } = block;

                        // Update status icon to checkmark or empty
                        statusIcon.classList.remove('loading');
                        statusIcon.innerHTML = ''; // Clean look

                        if (fileResult.error) {
                            const pre = document.createElement('pre');
                            pre.textContent = `Error: ${fileResult.error}`;
                            pre.style.color = 'var(--vscode-errorForeground)';
                            contentArea.appendChild(pre);
                            statusIcon.innerHTML = '⚠️';
                        } else {
                            const pre = document.createElement('pre');
                            pre.textContent = fileResult.content;
                            contentArea.appendChild(pre);
                        }
                        // Don't auto-expand for minimal look unless error?
                        // contentArea.classList.add('visible'); 
                    }
                });
            } else if (status === 'error') {
                fileBlocks.forEach(block => {
                    block.statusIcon.classList.remove('loading');
                    block.statusIcon.innerHTML = '❌';
                });
            }
            return;
        }

        // Update status
        if (status === 'completed') {
            statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
            statusIcon.classList.remove('loading');
            statusIcon.classList.add('completed');
        } else if (status === 'error') {
            statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
            statusIcon.classList.remove('loading');
            statusIcon.classList.add('error');
        }

        // Logic for content update:
        // 1. If result is error, always append/show error.
        // 2. If tool is a "write" type (write_to_file, replace, etc.), we usually prefer the Args content (Code).
        //    Only show result if it's an error.
        // 3. If tool is "read/search" type (view_file, search), the result IS the content. Show it.

        const isWriteTool = ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'apply_diff'].includes(toolName);

        if (result && status === 'error') {
            const pre = document.createElement('pre');
            pre.textContent = '\nError:\n' + JSON.stringify(result, null, 2);
            // Append error to existing content (e.g. args)
            contentArea.appendChild(pre);
            contentArea.classList.add('visible');
            // Auto open on error
            if (!contentArea.classList.contains('visible')) contentArea.classList.add('visible');
        } else if (result && !isWriteTool) {
            // For non-write tools, show the result.
            // If we already have args displayed, maybe append? OR replace?
            // Usually result is more important for read tools.
            const pre = document.createElement('pre');

            // If result is object, format it. If string, just text.
            let text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

            // If we have preliminary content (args), render a divider or just replace.
            // Replacing is cleaner for "view_file".
            // Appending might be better for "find_by_name" (pattern -> result).

            if (contentArea.innerHTML.trim() !== '') {
                // Append with divider
                const hr = document.createElement('hr');
                hr.style.cssText = 'border: 0; border-top: 1px solid var(--vscode-widget-border); margin: 8px 0;';
                contentArea.appendChild(hr);
            }

            pre.textContent = text;
            contentArea.appendChild(pre);
            contentArea.classList.add('visible');
        }

        // Scroll to updated element
        if (messagesEl) {
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
        }
    }

    return {
        appendMessage,
        appendStreamingChunk,
        finalizeStreamingMessage,
        replaceStreamingMessage,
        toggleBusy,
        renderSession,
        clearMessages,
        showChatArea,
        getActiveSessionId: () => activeSessionId,
        isBusy: () => isBusy,
        insertAtCursor,
        setMentionRecentNames,
        setPickerItems,
        showQuestion,
        sendMessage,
        showToolExecution,
        updateToolExecution,
        getSelectedMode: () => selectedMode,
        getSelectedModel: () => selectedModel,
        getSelectedModelLabel: () => modelLabel ? modelLabel.textContent : 'GPT-5 (low reasoning)',
        // Allow other modules (e.g., welcome.js) to set the selected model
        setSelectedModel: (id, label) => applyModel(id, label),
        setSelectedMode: (mode) => applyMode(mode)
    };
};
