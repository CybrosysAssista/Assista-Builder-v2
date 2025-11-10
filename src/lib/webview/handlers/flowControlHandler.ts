/**
 * Handler for flow control operations (stop, cancel, mode switch)
 */
import * as vscode from 'vscode';
import { MessageHandler } from './contextHandler.js';

export class FlowControlHandler implements MessageHandler {
    constructor(
        private readonly requestCancel: () => void
    ) {}

    async handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView }): Promise<boolean> {
        // Stop/Cancel commands
        if (message.command === 'stop' || message.command === 'cancelGeneration' || message.command === 'cancelCurrent') {
            this.requestCancel();
            provider._view?.webview.postMessage({ command: 'generationCancelled', timestamp: Date.now() });
            provider._view?.webview.postMessage({ command: 'statusBubble', action: 'hide' });
            provider._view?.webview.postMessage({ command: 'clearConfirm' });
            return true;
        }

        // Mode switch
        if (message.command === 'modeSwitch') {
            this.requestCancel();
            return true;
        }

        // Button click (legacy)
        if (message.command === 'buttonClick') {
            vscode.window.showInformationMessage(`${message.button} button clicked!`);
            return true;
        }

        return false;
    }
}

