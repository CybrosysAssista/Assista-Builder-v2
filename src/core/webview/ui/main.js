import { initChatUI } from '../chat/chat.js';
import { initSettingsUI } from '../settings/settings.js';
import { initHistoryUI } from '../history/history.js';
import { initWelcomeUI } from '../welcome/welcome.js';

const vscode = acquireVsCodeApi();

const chat = initChatUI(vscode);
const settings = initSettingsUI(vscode);
const history = initHistoryUI(vscode);
const welcome = initWelcomeUI(vscode, { insertAtCursor: chat.insertAtCursor, chat });

const bootState = typeof vscode.getState === 'function' ? vscode.getState() : undefined;
if (bootState) {
    if (Array.isArray(bootState.messages) && bootState.messages.length > 0) {
        chat.renderSession(bootState.activeSessionId, bootState.messages);
    } else {
        chat.renderSession(bootState.activeSessionId || null, []);
        if (welcome && typeof welcome.showWelcome === 'function') welcome.showWelcome();
    }
    if (bootState.selectedModel) {
        chat.setSelectedModel(bootState.selectedModel, bootState.selectedModelLabel);
    }
    if (bootState.selectedMode) {
        chat.setSelectedMode(bootState.selectedMode);
    }
} else {
    chat.renderSession(null, []);
    if (welcome && typeof welcome.showWelcome === 'function') welcome.showWelcome();
}

window.addEventListener('message', (event) => {
    const message = event.data || {};

    switch (message.type) {
        case 'assistantMessage':
            // Finalize streaming if active before showing final message
            if (typeof chat.finalizeStreamingMessage === 'function') {
                chat.finalizeStreamingMessage();
            }
            // If we're currently streaming, replace the streaming bubble with final message
            if (typeof chat.replaceStreamingMessage === 'function') {
                chat.replaceStreamingMessage(
                    String(message.text || ''),
                    typeof message.html === 'string' ? message.html : undefined,
                    typeof message.markdown === 'string' ? message.markdown : undefined
                );
            } else {
                chat.appendMessage(
                    String(message.text || ''),
                    'ai',
                    typeof message.html === 'string' ? message.html : undefined,
                    typeof message.markdown === 'string' ? message.markdown : undefined
                );
            }
            chat.toggleBusy(false);
            break;
        case 'streamingChunk': {
            const payload = message.payload || {};
            if (payload.type === 'stream_start') {
                // Start streaming - create new message
                if (typeof chat.appendStreamingChunk === 'function') {
                    chat.appendStreamingChunk(String(payload.text || ''));
                }
            } else if (payload.type === 'stream_append') {
                // Append to streaming message
                if (typeof chat.appendStreamingChunk === 'function') {
                    chat.appendStreamingChunk(String(payload.text || ''));
                }
            } else if (payload.type === 'stream_end') {
                // End streaming - finalize message (will be replaced by final assistantMessage)
                if (typeof chat.finalizeStreamingMessage === 'function') {
                    chat.finalizeStreamingMessage();
                }
            }
            break;
        }
        case 'toolExecution': {
            const payload = message.payload || {};
            if (payload.type === 'tool_execution_start') {
                // Show tool execution UI with loading state
                if (typeof chat.showToolExecution === 'function') {
                    chat.showToolExecution({
                        toolId: payload.toolId,
                        toolName: payload.toolName,
                        filename: payload.filename,
                        status: 'loading'
                    });
                }
            } else if (payload.type === 'tool_execution_complete') {
                // Update tool execution UI to completed state
                if (typeof chat.updateToolExecution === 'function') {
                    chat.updateToolExecution({
                        toolId: payload.toolId,
                        status: payload.status,
                        result: payload.result
                    });
                }
            }
            break;
        }
        case 'systemMessage':
            chat.appendMessage(String(message.text || ''), 'system');
            chat.toggleBusy(false);
            break;
        case 'clear':
            chat.renderSession(chat.getActiveSessionId(), []);
            if (welcome && typeof welcome.showWelcome === 'function') welcome.showWelcome();
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