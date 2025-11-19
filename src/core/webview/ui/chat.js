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
    let selectedMode = 'code';
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
        messagesEl.scrollTop = messagesEl.scrollHeight;
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
        try { inputEl.selectionStart = inputEl.selectionEnd = pos; } catch(_) {}
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

        appendMessage(text, "user");
        clearInput();
        toggleBusy(true);

        vscode.postMessage({ command: "userMessage", text });
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
        pickFilesEl: mentionPickFiles,
        insertAtCursor,
    });

    function applyMode(mode) {
        selectedMode = mode;
        if (modeLabel) modeLabel.textContent = mode === 'code' ? 'Code' : 'Chat';
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
            try { vscode.postMessage({ command: 'loadSettings' }); } catch (_) {}
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
        try { vscode.postMessage({ command: 'quickActions' }); } catch (_) {}
    });
    // Mention UI fully handled by mentions.js

    // Pass-through to mentions module
    function setMentionRecentNames(names) { mentions.setRecentNames(names); }
    function setPickerItems(items) { mentions.setPickerItems?.(items); }
    micBtn?.addEventListener('click', () => {
        try { vscode.postMessage({ command: 'voiceInput' }); } catch (_) {}
    });
    settingsBtn?.addEventListener('click', () => {
        try { vscode.postMessage({ command: 'loadSettings' }); } catch (_) {}
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
        try { if (sendBtn) sendBtn.disabled = !inputEl.value.trim(); } catch(_) {}
    }

    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            toggleBusy(false);
            vscode.postMessage({ command: "cancel" });
        });
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
    };
}
