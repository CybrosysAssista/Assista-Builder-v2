import { initChatUI } from './chat.js';
import { initSettingsUI } from './settings.js';

const vscode = acquireVsCodeApi();

const chat = initChatUI(vscode);
const settings = initSettingsUI(vscode);

const bootState = typeof vscode.getState === 'function' ? vscode.getState() : undefined;
if (bootState && Array.isArray(bootState.messages)) {
    chat.renderSession(bootState.activeSessionId, bootState.messages);
}

window.addEventListener('message', (event) => {
    const message = event.data || {};

    switch (message.type) {
        case 'assistantMessage':
            chat.appendMessage(
                String(message.text || ''),
                'ai',
                typeof message.html === 'string' ? message.html : undefined
            );
            chat.toggleBusy(false);
            break;
        case 'systemMessage':
            chat.appendMessage(String(message.text || ''), 'system');
            chat.toggleBusy(false);
            break;
        case 'clear':
            chat.clearMessages();
            chat.toggleBusy(false);
            break;
        case 'error':
            chat.appendMessage(String(message.text || 'Something went wrong.'), 'error');
            chat.toggleBusy(false);
            break;
        case 'showSettings':
            settings.openSettings();
            break;
        case 'sessionHydrated': {
            const payload = message.payload || {};
            chat.renderSession(payload.sessionId, Array.isArray(payload.messages) ? payload.messages : []);
            break;
        }
        case 'settingsData':
            settings.applySettingsData(message.payload || {});
            break;
        case 'modelsListed':
            settings.applyModelList(message.payload || {});
            break;
        case 'modelsError':
            settings.handleModelsError();
            break;
        case 'settingsSaved': {
            const payload = message.payload || {};
            if (payload.success) {
                settings.closeSettings();
            }
            break;
        }
        default:
            break;
    }
});

vscode.postMessage({ command: 'loadSettings' });
