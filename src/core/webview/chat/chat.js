import { initMentionsUI } from '../mentions/mentions.js';
import { applySyntaxHighlighting, applyDiffHighlighting } from '../utils/syntaxHighlighter.js';
import { initToolsUI } from './tools.js';

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

    let thinkingIndicator = null;
    let isBusy = false;
    let activeSessionId;

    function showThinkingIndicator() {
        if (thinkingIndicator || !messagesEl) return;

        thinkingIndicator = document.createElement('div');
        thinkingIndicator.className = 'thinking-indicator';
        thinkingIndicator.innerHTML = `
            <span>Analyzing</span>
            <div class="thinking-dots">
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
            </div>
        `;
        messagesEl.appendChild(thinkingIndicator);
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }

    function removeThinkingIndicator() {
        if (thinkingIndicator) {
            thinkingIndicator.remove();
            thinkingIndicator = null;
        }
    }

    // Initialize Tools UI
    const toolsUI = initToolsUI(vscode, {
        messagesEl,
        showChatArea,
        applySyntaxHighlighting,
        applyDiffHighlighting
    });

    const showToolExecution = (data) => {
        removeThinkingIndicator();
        toolsUI.showToolExecution(data);
    };

    const updateToolExecution = (data) => {
        toolsUI.updateToolExecution(data);
        // If a tool finishes and we are still busy, show thinking indicator again
        if ((data.status === 'completed' || data.status === 'error') && isBusy) {
            showThinkingIndicator();
        }
    };
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

    function updateSendButtonState() {
        if (!sendBtn || !inputEl) return;
        const hasText = inputEl.innerText.trim().length > 0 || inputEl.querySelector('.mention-chip');
        sendBtn.disabled = isBusy || !hasText;
    }

    function toggleBusy(state) {
        isBusy = !!state;
        if (!isBusy) {
            removeThinkingIndicator();
        }
        try {
            if (sendBtn) {
                updateSendButtonState();
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
            block.innerHTML = applySyntaxHighlighting(text);
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
    // Initialize Review UI

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
        removeThinkingIndicator();
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
                    console.error('[AssistaCoder] Error rendering streaming markdown:', error);
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
                    console.error('[AssistaCoder] Error in final render:', error);
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
            // If the final text is empty/whitespace but we have content in the bubble, DON'T wipe it
            const hasNewContent = (text && text.trim()) || (html && html.trim()) || (markdown && markdown.trim());
            if (!hasNewContent) {
                streamingRow = null;
                return;
            }

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

        // Handle textarea/input just in case
        if (typeof inputEl.selectionStart === 'number') {
            const start = inputEl.selectionStart;
            const end = inputEl.selectionEnd;
            const val = inputEl.value;
            inputEl.value = val.substring(0, start) + text + val.substring(end);
            inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
        } else {
            // Contenteditable
            const sel = window.getSelection();
            if (!sel) return;

            // Ensure we have a valid range within the inputEl
            if (sel.rangeCount === 0 || !inputEl.contains(sel.anchorNode)) {
                const range = document.createRange();
                range.selectNodeContents(inputEl);
                range.collapse(false); // Move to end
                sel.removeAllRanges();
                sel.addRange(range);
            }

            const range = sel.getRangeAt(0);
            range.deleteContents();

            const textNode = document.createTextNode(text);
            range.insertNode(textNode);

            // Move cursor to after the inserted text
            range.setStart(textNode, text.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        inputEl.dispatchEvent(new Event('input'));
    }



    // We need to store messages globally in this closure to persist them when model changes
    let currentMessages = [];

    function renderSession(sessionId, messages) {
        if (!messagesEl) {
            return;
        }

        // CRITICAL FIX: If we have an active streaming message, finalize it first
        // This prevents the streaming content from being lost when we clear messagesEl
        if (streamingRow && streamingRow.parentNode === messagesEl && streamingTextBuffer) {
            finalizeStreamingMessage();
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
                    // Check if this is a saved error message
                    const role = message.isError
                        ? "error"
                        : (message.role === "assistant" || message.role === "tool")
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
            // Don't persist empty sessions (Welcome Screen) to avoid flickering on reload
            // This causes the webview to restore the previous valid chat state instead
            if (!currentMessages || currentMessages.length === 0) {
                return;
            }

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

        if (isBusy) {
            vscode.postMessage({ command: "showError", text: "Please stop the current message or wait for it to finish before sending a new one." });
            return;
        }

        const text = inputEl.innerText.trim();
        if (!text) {
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
        showThinkingIndicator();

        vscode.postMessage({ command: "userMessage", text, mode: selectedMode, model: selectedModel, sessionId: activeSessionId });
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

    // --- Drag and Drop File Mentions ---
    if (inputBar) {
        inputBar.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputBar.classList.add('drag-over');
        });

        inputBar.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputBar.classList.remove('drag-over');
        });

        inputBar.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputBar.classList.remove('drag-over');

            // VS Code explorer provides the file path as plain text
            const data = e.dataTransfer.getData('text/plain');
            if (data) {
                // Handle possible multiple files separated by newlines
                const paths = data.split(/\r?\n/).filter(p => p.trim());
                paths.forEach(p => {
                    // Extract only the basename or relative path if possible
                    // In VS Code webview, we usually get the full path or URI string
                    // mentions.insertMention handles the formatting
                    mentions.insertMention(p);
                });
            }
        });
    }

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

    function populateModelDropdown(models) {
        console.log('[AssistaCoder] populateModelDropdown called with:', models);
        if (!modelDropdown) {
            console.error('[AssistaCoder] modelDropdown element not found!');
            return;
        }

        // Clear existing items except custom API
        const customApiBtn = modelDropdown.querySelector('[data-action="custom-api"]');
        modelDropdown.innerHTML = '';

        // Add fetched models
        if (models && models.length > 0) {
            models.forEach(model => {
                const button = document.createElement('button');
                button.className = 'item';
                button.setAttribute('data-model', model.id);

                const nameSpan = document.createElement('span');
                nameSpan.textContent = model.name;
                button.appendChild(nameSpan);

                if (model.costMultiplier) {
                    const costSpan = document.createElement('span');
                    costSpan.style.opacity = '.6';
                    costSpan.style.fontSize = '11px';
                    costSpan.textContent = `${model.costMultiplier}x`;
                    button.appendChild(costSpan);
                }

                modelDropdown.appendChild(button);
            });

            // Set first model as default if no model is selected yet
            if (models.length > 0 && selectedModel === 'gpt5-low') {
                applyModel(models[0].id, models[0].name);
            }
        }

        // Re-add custom API button at the end
        if (customApiBtn) {
            modelDropdown.appendChild(customApiBtn);
        }

        // Update label if it's still showing loading text
        if (modelLabel && modelLabel.textContent === 'Loading models...') {
            if (models && models.length > 0) {
                applyModel(models[0].id, models[0].name);
            } else {
                applyModel('custom-api', 'Custom API');
            }
        }

        // Sync to welcome screen dropdown
        const welcomeModelDropdown = document.getElementById('welcomeModelDropdown');
        if (welcomeModelDropdown) {
            const welcomeCustomApiBtn = welcomeModelDropdown.querySelector('[data-action="custom-api"]');
            welcomeModelDropdown.innerHTML = '';

            if (models && models.length > 0) {
                models.forEach(model => {
                    const button = document.createElement('button');
                    button.className = 'item';
                    button.setAttribute('data-model', model.id);

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = model.name;
                    button.appendChild(nameSpan);

                    if (model.costMultiplier) {
                        const costSpan = document.createElement('span');
                        costSpan.style.opacity = '.6';
                        costSpan.style.fontSize = '11px';
                        costSpan.textContent = `${model.costMultiplier}x`;
                        button.appendChild(costSpan);
                    }

                    welcomeModelDropdown.appendChild(button);
                });
            }

            if (welcomeCustomApiBtn) {
                welcomeModelDropdown.appendChild(welcomeCustomApiBtn);
            }
        }
        console.log('[AssistaCoder] populateModelDropdown completed');
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



        inputEl.addEventListener('input', () => {
            try {
                // Toggle placeholder visibility based on text content
                // We avoid setting innerHTML = '' to preserve the browser's undo stack
                const hasText = inputEl.textContent.trim().length > 0 || inputEl.querySelector('.mention-chip');
                if (hasText) {
                    inputEl.removeAttribute('data-placeholder-visible');
                } else {
                    inputEl.setAttribute('data-placeholder-visible', 'true');
                }

                // Auto-resize
                inputEl.style.height = 'auto';
                inputEl.style.height = `${Math.min(Math.max(inputEl.scrollHeight, 28), 160)}px`;

                // Enable/disable send button
                updateSendButtonState();
            } catch (_) {
                // ignore sizing issues
            }
        });
        // Initialize disabled state
        updateSendButtonState();
    }

    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            toggleBusy(false);
            vscode.postMessage({ command: "cancel", sessionId: activeSessionId });
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
        showThinkingIndicator,
        showToolExecution,
        updateToolExecution,
        getSelectedMode: () => selectedMode,
        getSelectedModel: () => selectedModel,
        getSelectedModelLabel: () => modelLabel ? modelLabel.textContent : 'GPT-5 (low reasoning)',
        // Allow other modules (e.g., welcome.js) to set the selected model
        setSelectedModel: (id, label) => applyModel(id, label),
        setSelectedMode: (mode) => applyMode(mode),
        populateModelDropdown: (models) => populateModelDropdown(models)
    };
};
