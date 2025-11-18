import { initChatUI } from './chat.js';
import { initSettingsUI } from './settings.js';
import { initHistoryUI } from './history.js';

const vscode = acquireVsCodeApi();

const chat = initChatUI(vscode);
const settings = initSettingsUI(vscode);
const history = initHistoryUI(vscode);

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
        case 'showHistory':
            history.openHistory();
            break;
        case 'sessionHydrated': {
            const payload = message.payload || {};
            chat.renderSession(payload.sessionId, Array.isArray(payload.messages) ? payload.messages : []);
            break;
        }
        case 'settingsData':
            settings.applySettingsData(message.payload || {});
            break;
        case 'historyData':
            history.applyHistoryData(message.payload || {});
            break;
        case 'historyOpened':
            // After switching session, close the history overlay
            if (history && typeof history.closeHistory === 'function') {
                history.closeHistory();
            }
            break;
        case 'historyDeleted':
            // No-op: optimistic UI already removed the item. Could show a toast here.
            break;
        case 'mentionInsert': {
            const payload = message.payload || {};
            const text = String(payload.text || '');
            if (text && typeof chat.insertAtCursor === 'function') {
                chat.insertAtCursor(text + ' ');
            }
            break;
        }
        case 'mentionRecentFilesData': {
            const payload = message.payload || {};
            const names = Array.isArray(payload.names) ? payload.names : [];
            if (typeof chat.setMentionRecentNames === 'function') {
                chat.setMentionRecentNames(names);
            }
            break;
        }
        case 'mentionActiveFileData': {
            const payload = message.payload || {};
            const name = String(payload.name || '');
            if (name && typeof chat.setMentionRecentNames === 'function') {
                chat.setMentionRecentNames([name]);
            }
            break;
        }
        case 'mentionWorkspaceItems': {
            const payload = message.payload || {};
            const items = Array.isArray(payload.items) ? payload.items : [];
            // Forward to mentions UI via chat instance wrapper
            if (typeof chat.setMentionRecentNames === 'function') {
                // no-op to keep existing API stable
            }
            try {
                // access mentions via closure: we exported setPickerItems on chat init
                chat.setPickerItems?.(items);
            } catch (_) {}
            break;
        }
        case 'historyDeleteFailed': {
            // Reload authoritative list and notify user
            vscode.postMessage({ command: 'loadHistory' });
            const payload = message.payload || {};
            if (payload && payload.error) {
                try { alert('Delete failed: ' + String(payload.error)); } catch (_) {}
            }
            break;
        }
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
