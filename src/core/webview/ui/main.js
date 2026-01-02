import { initChatUI } from '../chat/chat.js';
import { initSettingsUI } from '../settings/settings.js';
import { initHistoryUI } from '../history/history.js';
import { initWelcomeUI } from '../welcome/welcome.js';
import { initReviewUI } from '../review/review.js';

const vscode = acquireVsCodeApi();

const chat = initChatUI(vscode);
const settings = initSettingsUI(vscode);
const history = initHistoryUI(vscode);
const welcome = initWelcomeUI(vscode, { insertAtCursor: chat.insertAtCursor, chat });
const review = initReviewUI(vscode);

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
    const payload = message.payload || {};

    // Helper to check if a message is intended for the currently active session
    const isMessageForCurrentSession = () => {
        // If no sessionId is provided in payload, assume it's a global message (like settings)
        if (!payload.sessionId) return true;
        return String(payload.sessionId) === String(chat.getActiveSessionId());
    };

    switch (message.type) {
        case 'assistantMessage':
            if (!isMessageForCurrentSession()) return;
            // Finalize streaming if active before showing final message
            if (typeof chat.finalizeStreamingMessage === 'function') {
                chat.finalizeStreamingMessage();
            }
            // If we're currently streaming, replace the streaming bubble with final message
            if (typeof chat.replaceStreamingMessage === 'function') {
                chat.replaceStreamingMessage(
                    String(payload.text || ''),
                    typeof payload.html === 'string' ? payload.html : undefined,
                    typeof payload.markdown === 'string' ? payload.markdown : undefined
                );
            } else {
                chat.appendMessage(
                    String(payload.text || ''),
                    'ai',
                    typeof payload.html === 'string' ? payload.html : undefined,
                    typeof payload.markdown === 'string' ? payload.markdown : undefined
                );
            }
            chat.toggleBusy(false);
            break;
        case 'streamingChunk': {
            if (!isMessageForCurrentSession()) return;
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
            if (!isMessageForCurrentSession()) return;
            if (payload.type === 'tool_execution_start') {
                // Show tool execution UI with loading state
                if (typeof chat.showToolExecution === 'function') {
                    chat.showToolExecution({
                        toolId: payload.toolId,
                        toolName: payload.toolName,
                        filename: payload.filename,
                        status: 'loading',
                        args: payload.args
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
            if (!isMessageForCurrentSession()) return;
            chat.appendMessage(String(payload.text || ''), 'system');
            chat.toggleBusy(false);
            break;
        case 'clear':
            chat.renderSession(chat.getActiveSessionId(), []);
            if (welcome && typeof welcome.showWelcome === 'function') welcome.showWelcome();
            chat.toggleBusy(false);
            break;
        case 'error':
            if (!isMessageForCurrentSession()) return;
            chat.appendMessage(String(payload.text || 'Something went wrong.'), 'error');
            chat.toggleBusy(false);
            break;
        case 'showSettings':
            if (welcome && typeof welcome.hideWelcome === 'function') welcome.hideWelcome();
            const section = payload.section || 'general';
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
            const newSessionId = payload.sessionId || null;
            chat.renderSession(newSessionId, []);
            break;
        case 'sessionHydrated': {
            chat.renderSession(payload.sessionId, Array.isArray(payload.messages) ? payload.messages : []);
            if (payload.isBusy) {
                chat.toggleBusy(true);
                if (typeof chat.showThinkingIndicator === 'function') {
                    chat.showThinkingIndicator();
                }
            }
            break;
        }
        case 'settingsData':
            settings.applySettingsData(payload || {});
            break;
        case 'historyData':
            history.applyHistoryData(payload || {});
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
            const text = String(payload.text || '');
            if (text && typeof chat.insertAtCursor === 'function') {
                chat.insertAtCursor(text + ' ');
            }
            break;
        }
        case 'mentionRecentFilesData': {
            const names = Array.isArray(payload.names) ? payload.names : [];
            if (typeof chat.setMentionRecentNames === 'function') chat.setMentionRecentNames(names);
            if (typeof welcome.setMentionRecentNames === 'function') welcome.setMentionRecentNames(names);
            break;
        }
        case 'mentionActiveFileData': {
            const name = String(payload.name || '');
            if (name && typeof chat.setMentionRecentNames === 'function') chat.setMentionRecentNames([name]);
            if (name && typeof welcome.setMentionRecentNames === 'function') welcome.setMentionRecentNames([name]);
            break;
        }
        case 'mentionWorkspaceItems': {
            const items = Array.isArray(payload.items) ? payload.items : [];
            // Forward to mentions UI via chat instance wrapper
            try { chat.setPickerItems?.(items); } catch (_) { }
            try { welcome.setPickerItems?.(items); } catch (_) { }
            break;
        }
        case 'historyDeleteFailed': {
            // Reload authoritative list and notify user
            vscode.postMessage({ command: 'loadHistory' });
            if (payload && payload.error) {
                try { alert('Delete failed: ' + String(payload.error)); } catch (_) { }
            }
            break;
        }
        case 'modelsListed':
            settings.applyModelList(payload || {});
            break;
        case 'modelsError':
            settings.handleModelsError();
            break;
        case 'usageData':
            settings.applyUsageData(payload || {});
            break;
        case 'settingsSaved': {
            // const payload = message.payload || {};
            // if (payload.success) {
            //     settings.closeSettings();
            // }
            break;
        }
        case 'showQuestion': {
            if (payload.id && payload.question && Array.isArray(payload.suggestions)) {
                chat.showQuestion?.(payload.id, payload.question, payload.suggestions);
            }
            break;
        }
        case 'requestReview': {
            if (payload.text) {
                review.showReviewBanner(payload.text);
            }
            break;
        }
        case 'availableModels': {
            console.log('[AssistaCoder] Webview received availableModels:', payload.models);
            const models = Array.isArray(payload.models) ? payload.models : [];
            if (typeof chat.populateModelDropdown === 'function') {
                chat.populateModelDropdown(models);
            }
            break;
        }
        default:
            break;
    }
});

vscode.postMessage({ command: 'loadSettings' });