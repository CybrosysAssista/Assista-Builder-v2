const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const welcomeEl = document.getElementById('welcomeScreen');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const settingsForm = document.getElementById('settingsForm');
const settingsMessageEl = document.getElementById('settingsMessage');
const googleKeyInput = document.getElementById('googleKey');
const googleModelInput = document.getElementById('googleModel');
const googleStatusEl = document.getElementById('googleStatus');
const openrouterKeyInput = document.getElementById('openrouterKey');
const openrouterModelInput = document.getElementById('openrouterModel');
const openrouterStatusEl = document.getElementById('openrouterStatus');

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
    if (!settingsOverlay) return;
    settingsOverlay.classList.add('visible');
    settingsOverlay.setAttribute('aria-hidden', 'false');
    if (settingsMessageEl) {
        settingsMessageEl.textContent = '';
        settingsMessageEl.className = 'settings-message';
    }
    vscode.postMessage({ command: 'loadSettings' });
}

function closeSettings() {
    if (!settingsOverlay) return;
    settingsOverlay.classList.remove('visible');
    settingsOverlay.setAttribute('aria-hidden', 'true');
    settingsForm?.reset();
    if (settingsMessageEl) {
        settingsMessageEl.textContent = '';
        settingsMessageEl.className = 'settings-message';
    }
}

function updateStatusLabel(labelEl, configured) {
    if (!labelEl) return;
    labelEl.textContent = configured ? 'Configured' : 'Not set';
    labelEl.classList.toggle('configured', !!configured);
    labelEl.classList.toggle('missing', !configured);
}

settingsBtn?.addEventListener('click', () => openSettings());
closeSettingsBtn?.addEventListener('click', () => closeSettings());
cancelSettingsBtn?.addEventListener('click', () => closeSettings());

settingsOverlay?.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) {
        closeSettings();
    }
});

settingsForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!settingsForm) return;
    const formData = new FormData(settingsForm);
    const activeProvider = String(formData.get('activeProvider') || 'google');
    const payload = {
        command: 'saveSettings',
        activeProvider,
        googleKey: String(googleKeyInput?.value || ''),
        googleModel: String(googleModelInput?.value || ''),
        openrouterKey: String(openrouterKeyInput?.value || ''),
        openrouterModel: String(openrouterModelInput?.value || '')
    };
    if (settingsMessageEl) {
        settingsMessageEl.textContent = 'Saving...';
        settingsMessageEl.className = 'settings-message';
    }
    vscode.postMessage(payload);
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
            const radios = settingsForm?.querySelectorAll('input[name="activeProvider"]');
            radios?.forEach((input) => {
                input.checked = input.value === activeProvider;
            });
            if (googleModelInput && typeof data.googleModel === 'string') {
                googleModelInput.value = data.googleModel;
            }
            if (openrouterModelInput && typeof data.openrouterModel === 'string') {
                openrouterModelInput.value = data.openrouterModel;
            }
            updateStatusLabel(googleStatusEl, !!data.hasGoogleKey);
            updateStatusLabel(openrouterStatusEl, !!data.hasOpenrouterKey);
            if (settingsMessageEl) {
                settingsMessageEl.textContent = '';
                settingsMessageEl.className = 'settings-message';
            }
            break;
        }
        case 'settingsSaved': {
            const payload = message.payload || {};
            if (payload.success) {
                updateStatusLabel(googleStatusEl, !!payload.hasGoogleKey);
                updateStatusLabel(openrouterStatusEl, !!payload.hasOpenrouterKey);
                appendMessage('Settings saved.', 'system');
                closeSettings();
            } else if (settingsMessageEl) {
                settingsMessageEl.textContent = payload.error ? String(payload.error) : 'Failed to save settings.';
                settingsMessageEl.className = 'settings-message error';
            }
            break;
        }
        default:
            break;
    }
});

vscode.postMessage({ command: 'loadSettings' });

