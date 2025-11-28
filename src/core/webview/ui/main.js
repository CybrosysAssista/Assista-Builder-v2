import { initChatUI } from './chat.js';
import { initSettingsUI } from './settings.js';
import { initHistoryUI } from './history.js';
import { initWelcomeUI } from './welcome.js';

const vscode = acquireVsCodeApi();

const chat = initChatUI(vscode);
const settings = initSettingsUI(vscode);
const history = initHistoryUI(vscode);
const welcome = initWelcomeUI(vscode, { insertAtCursor: chat.insertAtCursor });

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
            if (welcome && typeof welcome.hideWelcome === 'function') welcome.hideWelcome();
            const section = message.payload?.section || 'general';
            settings.openSettings(section);
            break;
        case 'showHistory':
            if (welcome && typeof welcome.hideWelcome === 'function') welcome.hideWelcome();
            history.openHistory();
            break;
        case 'showWelcomeSplash':
            // Close overlays
            if (history && typeof history.closeHistory === 'function') history.closeHistory();
            if (settings && typeof settings.closeSettings === 'function') settings.closeSettings();

            // Trigger splash screen animation
            if (welcome && typeof welcome.showSplashAnimation === 'function') {
                welcome.showSplashAnimation();
            }
            // Clear session state (persist as empty/welcome)
            const newSessionId = message.payload?.sessionId || null;
            chat.renderSession(newSessionId, []);
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
            if (typeof chat.setMentionRecentNames === 'function') chat.setMentionRecentNames(names);
            if (typeof welcome.setMentionRecentNames === 'function') welcome.setMentionRecentNames(names);
            break;
        }
        case 'mentionActiveFileData': {
            const payload = message.payload || {};
            const name = String(payload.name || '');
            if (name && typeof chat.setMentionRecentNames === 'function') chat.setMentionRecentNames([name]);
            if (name && typeof welcome.setMentionRecentNames === 'function') welcome.setMentionRecentNames([name]);
            break;
        }
        case 'mentionWorkspaceItems': {
            const payload = message.payload || {};
            const items = Array.isArray(payload.items) ? payload.items : [];
            // Forward to mentions UI via chat instance wrapper
            try { chat.setPickerItems?.(items); } catch (_) { }
            try { welcome.setPickerItems?.(items); } catch (_) { }
            break;
        }
        case 'historyDeleteFailed': {
            // Reload authoritative list and notify user
            vscode.postMessage({ command: 'loadHistory' });
            const payload = message.payload || {};
            if (payload && payload.error) {
                try { alert('Delete failed: ' + String(payload.error)); } catch (_) { }
            }
            break;
        }
        case 'modelsListed':
            settings.applyModelList(message.payload || {});
            break;
        case 'modelsError':
            settings.handleModelsError();
            break;
        case 'usageData':
            settings.applyUsageData(message.payload || {});
            break;
        case 'settingsSaved': {
            const payload = message.payload || {};
            // if (payload.success) {
            //     settings.closeSettings();
            // }
            break;
        }
        case 'showQuestion': {
            const payload = message.payload || {};
            if (payload.id && payload.question && Array.isArray(payload.suggestions)) {
                chat.showQuestion?.(payload.id, payload.question, payload.suggestions);
            }
            break;
        }
        default:
            break;
    }
});

vscode.postMessage({ command: 'loadSettings' });
