import { initMentionsUI } from './mentions.js';

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
    const mentionPickFiles = document.getElementById('mentionPickFiles');
    const micBtn = document.getElementById('micBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    let isBusy = false;
    let activeSessionId;
    // Local UI state (vanilla JS equivalent of React state)
    let selectedMode = 'agent';
    let selectedModel = 'gpt5-low';
    let showModeMenu = false;
    let showModelMenu = false;

    function showChatArea() {
        try {
            if (welcomeEl) {
                welcomeEl.style.display = "none";
                welcomeEl.classList.remove("active");
                welcomeEl.setAttribute("aria-hidden", "true");
            }
            if (messagesEl) {
                messagesEl.classList.add("active");
            }
            if (inputBar) {
                inputBar.style.display = "";
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
            // If already highlighted by VS Code (has spans), skip or maybe force?
            // User says "no color", so likely no spans. 
            // We'll apply our simple highlighter if it looks like plain text.
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

            // Try to extract filename from class (e.g., language-javascript or js-filename.js)
            let filename = 'Code';
            const codeClasses = code.className.split(' ');
            for (const cls of codeClasses) {
                if (cls.startsWith('language-')) {
                    const lang = cls.replace('language-', '');
                    // Check if it looks like a filename (has a dot)
                    if (lang.includes('.')) {
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

    function appendMessage(text, sender, html) {
        if (!messagesEl || (!text && !html)) {
            return;
        }
        showChatArea();

        const row = document.createElement("div");
        row.className = "message-row";

        const bubble = document.createElement("div");
        bubble.className = `message ${sender || "ai"}`;

        if (html && sender === "ai") {
            bubble.classList.add("markdown");
            bubble.innerHTML = html;
            enhanceMarkdownContent(bubble);
        } else {
            bubble.textContent = text;
        }

        row.appendChild(bubble);
        messagesEl.appendChild(row);
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }

    function clearInput() {
        if (!inputEl) {
            return;
        }
        inputEl.value = "";
        inputEl.style.height = "";
    }

    function insertAtCursor(text) {
        if (!inputEl) return;
        const start = inputEl.selectionStart ?? inputEl.value.length;
        const end = inputEl.selectionEnd ?? inputEl.value.length;
        const before = inputEl.value.slice(0, start);
        const after = inputEl.value.slice(end);
        inputEl.value = `${before}${text}${after}`;
        const pos = start + text.length;
        try { inputEl.selectionStart = inputEl.selectionEnd = pos; } catch (_) { }
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
    }

    function renderSession(sessionId, messages) {
        if (!messagesEl) {
            return;
        }

        messagesEl.innerHTML = "";
        activeSessionId = sessionId;

        if (Array.isArray(messages)) {
            messages.forEach((message) => {
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
                        message.role === "assistant"
                            ? "ai"
                            : message.role === "system"
                                ? "system"
                                : "user";
                    appendMessage(
                        String(message.content ?? ""),
                        role,
                        typeof message.html === "string" ? message.html : undefined
                    );
                }
            });
        }

        if (!messages || !messages.length) {
            if (welcomeEl) {
                welcomeEl.style.display = "";
                welcomeEl.classList.add("active");
                welcomeEl.setAttribute("aria-hidden", "false");
            }
        } else {
            showChatArea();
        }

        toggleBusy(false);

        try {
            vscode.setState?.({
                activeSessionId,
                messages: Array.isArray(messages) ? messages : [],
            });
        } catch (_) {
            // ignore persistence issues
        }
    }

    function clearMessages() {
        if (messagesEl) {
            messagesEl.innerHTML = "";
        }
    }

    function sendMessage() {
        if (!inputEl) {
            return;
        }
        const text = inputEl.value.trim();
        if (!text) {
            return;
        }

        // Close any open overlays (History/Settings) to show the chat area
        const historyPage = document.getElementById('historyPage');
        const settingsPage = document.getElementById('settingsPage');
        const messagesEl = document.getElementById('messages');
        const inputBar = document.querySelector('.input-bar');

        if (historyPage) historyPage.style.display = 'none';
        if (settingsPage) settingsPage.style.display = 'none';

        // Ensure messages and input bar are visible
        if (messagesEl) messagesEl.style.display = '';
        if (inputBar) inputBar.style.display = '';

        appendMessage(text, "user");
        clearInput();
        toggleBusy(true);

        vscode.postMessage({ command: "userMessage", text, mode: selectedMode });
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
        // Optional: inform host of mode change in the future
    }

    function applyModel(model, labelText) {
        selectedModel = model;
        if (modelLabel && labelText) modelLabel.textContent = labelText;
        // Optional: map to actual provider/model config later
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
            // Open Settings so the user can enter a custom API key
            try { vscode.postMessage({ command: 'loadSettings' }); } catch (_) { }
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

        inputEl.addEventListener("input", () => {
            try {
                inputEl.style.height = 'auto';
                inputEl.style.height = `${Math.min(Math.max(inputEl.scrollHeight, 28), 160)}px`;
                // Enable/disable send button
                if (sendBtn) sendBtn.disabled = !inputEl.value.trim();
            } catch (_) {
                // ignore sizing issues
            }
        });
        // Initialize disabled state
        try { if (sendBtn) sendBtn.disabled = !inputEl.value.trim(); } catch (_) { }
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
            if (suggestion.mode) {
                const modeBadge = document.createElement("span");
                modeBadge.className = "question-mode-badge";
                modeBadge.textContent = suggestion.mode;
                button.appendChild(modeBadge);
            }

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
    };
}
