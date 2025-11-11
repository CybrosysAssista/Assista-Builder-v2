const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const welcomeEl = document.getElementById('welcomeScreen');
// New full-page settings UI elements
const settingsPage = document.getElementById('settingsPage');
const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingsDoneBtn = document.getElementById('settingsDoneBtn');
const apiKeyLabel = document.getElementById('apiKeyLabel');
const docLink = document.getElementById('docLink');
const inputBar = document.querySelector('.input-bar');

let isBusy = false;

function showChatArea() {
    try {
        if (welcomeEl) {
            welcomeEl.style.display = 'none';
            welcomeEl.classList.remove('active');
            welcomeEl.setAttribute('aria-hidden', 'true');
        }
        if (messagesEl) {
            messagesEl.classList.add('active');
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
            sendBtn.classList.toggle('hidden', isBusy);
        }
        if (stopBtn) {
            stopBtn.disabled = !isBusy;
            stopBtn.classList.toggle('visible', isBusy);
        }
    } catch (_) {
        // ignore styling errors
    }
}

function appendMessage(text, sender) {
    if (!messagesEl || !text) {
        return;
    }
    showChatArea();

    const row = document.createElement('div');
    row.className = 'message-row';

    const bubble = document.createElement('div');
    bubble.className = `message ${sender || 'ai'}`;
    bubble.textContent = text;

    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearInput() {
    if (!inputEl) return;
    inputEl.value = '';
    inputEl.style.height = '';
}

async function sendMessage() {
    if (!inputEl) {
        return;
    }
    const text = inputEl.value.trim();
    if (!text) {
        return;
    }

    appendMessage(text, 'user');
    clearInput();
    toggleBusy(true);

    vscode.postMessage({ command: 'userMessage', text });
}

if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

if (inputEl) {
    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    inputEl.addEventListener('input', () => {
        try {
            inputEl.style.height = 'auto';
            inputEl.style.height = `${Math.min(Math.max(inputEl.scrollHeight, 28), 160)}px`;
        } catch (_) {
            // ignore sizing issues
        }
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        toggleBusy(false);
        vscode.postMessage({ command: 'cancel' });
    });
}

function openSettings() {
    if (!settingsPage) return;
    // Hide chat UI
    if (messagesEl) messagesEl.style.display = 'none';
    if (inputBar) inputBar.style.display = 'none';
    // Show settings page
    settingsPage.style.display = 'block';
    vscode.postMessage({ command: 'loadSettings' });
}

function closeSettings() {
    if (!settingsPage) return;
    settingsPage.style.display = 'none';
    if (messagesEl) messagesEl.style.display = '';
    if (inputBar) inputBar.style.display = '';
}

function updateProviderUiLabels(provider) {
    if (!apiKeyLabel || !docLink) return;
    const map = {
        google: { label: 'Gemini API Key', doc: 'https://ai.google.dev/docs', text: 'Google AI documentation' },
        openrouter: { label: 'OpenRouter API Key', doc: 'https://openrouter.ai/docs', text: 'OpenRouter documentation' },
        openai: { label: 'OpenAI API Key', doc: 'https://platform.openai.com/docs', text: 'OpenAI documentation' },
        anthropic: { label: 'Anthropic API Key', doc: 'https://docs.anthropic.com', text: 'Anthropic documentation' },
        azure: { label: 'Azure OpenAI API Key', doc: 'https://learn.microsoft.com/azure/ai-services/openai', text: 'Azure OpenAI documentation' },
        cohere: { label: 'Cohere API Key', doc: 'https://docs.cohere.com', text: 'Cohere documentation' },
        huggingface: { label: 'HuggingFace API Key', doc: 'https://huggingface.co/docs', text: 'HuggingFace documentation' },
        mistral: { label: 'Mistral AI API Key', doc: 'https://docs.mistral.ai', text: 'Mistral AI documentation' },
    };
    const cfg = map[provider] || map.openrouter;
    apiKeyLabel.textContent = cfg.label;
    docLink.textContent = cfg.text;
    docLink.href = cfg.doc;
}

function saveSettings() {
    const provider = String(providerSelect?.value || 'google');
    const model = String(modelSelect?.value || '');
    const key = String(apiKeyInput?.value || '');
    const payload = { command: 'saveSettings', activeProvider: provider };
    if (provider === 'google') {
        payload['googleModel'] = model;
        if (key) payload['googleKey'] = key;
    } else if (provider === 'openrouter') {
        payload['openrouterModel'] = model;
        if (key) payload['openrouterKey'] = key;
    } else {
        // For not-yet-implemented providers, just keep UI but do not send keys
        // Falls back to existing backend which only handles google/openrouter
    }
    vscode.postMessage(payload);
}

settingsSaveBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    saveSettings();
});

settingsDoneBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeSettings();
});

providerSelect?.addEventListener('change', () => {
    updateProviderUiLabels(String(providerSelect.value));
    // Clear apiKey input on provider change for safety
    if (apiKeyInput) apiKeyInput.value = '';
});

window.addEventListener('message', (event) => {
    const message = event.data || {};

    switch (message.type) {
        case 'assistantMessage':
            appendMessage(String(message.text || ''), 'ai');
            toggleBusy(false);
            break;
        case 'systemMessage':
            appendMessage(String(message.text || ''), 'system');
            toggleBusy(false);
            break;
        case 'clear':
            if (messagesEl) {
                messagesEl.innerHTML = '';
            }
            toggleBusy(false);
            break;
        case 'error':
            appendMessage(String(message.text || 'Something went wrong.'), 'error');
            toggleBusy(false);
            break;
        case 'showSettings':
            openSettings();
            break;
        case 'settingsData': {
            const data = message.payload || {};
            const activeProvider = data.activeProvider || 'google';
            if (providerSelect) providerSelect.value = activeProvider;
            updateProviderUiLabels(activeProvider);
            if (modelSelect) {
                // Prefer the provider-specific model if present
                const model = activeProvider === 'google' ? (data.googleModel || '') :
                              activeProvider === 'openrouter' ? (data.openrouterModel || '') : '';
                // If options exist, try to select matching value, else set as a single option
                let option = modelSelect.querySelector(`option[value="${model}"]`);
                if (!option && model) {
                    modelSelect.innerHTML = '';
                    const opt = document.createElement('option');
                    opt.value = model;
                    opt.textContent = model;
                    modelSelect.appendChild(opt);
                }
                modelSelect.value = model || modelSelect.value;
            }
            break;
        }
        case 'settingsSaved': {
            const payload = message.payload || {};
            if (payload.success) {
                appendMessage('Settings saved.', 'system');
                closeSettings();
            } else {
                appendMessage(payload.error ? String(payload.error) : 'Failed to save settings.', 'error');
            }
            break;
        }
        default:
            break;
    }
});

vscode.postMessage({ command: 'loadSettings' });

