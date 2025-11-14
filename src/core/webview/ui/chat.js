export function initChatUI(vscode) {
    const messagesEl = document.getElementById("messages");
    const inputEl = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    const stopBtn = document.getElementById("stopBtn");
    const welcomeEl = document.getElementById("welcomeScreen");
    const inputBar = document.querySelector(".input-bar");

    let isBusy = false;
    let activeSessionId;

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
                inputEl.style.height = "auto";
                inputEl.style.height = `${Math.min(
                    Math.max(inputEl.scrollHeight, 28),
                    160
                )}px`;
            } catch (_) {
                // ignore sizing issues
            }
        });
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
    };
}
