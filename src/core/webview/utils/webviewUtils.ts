import * as vscode from 'vscode';
import * as fs from 'fs';
import { getSettingsModalHtml } from '../settings/settingsHtml.js';
import { getHistoryHtml } from '../history/historyHtml.js';
import { getWelcomeHtml } from '../welcome/welcomeHtml.js';

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getHtmlForWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();
  const outPath = vscode.Uri.joinPath(extensionUri, 'out', 'core', 'webview', 'ui', 'main.js').fsPath;
  const scriptPath = fs.existsSync(outPath)
    ? ['out', 'core', 'webview', 'ui', 'main.js']
    : ['src', 'core', 'webview', 'ui', 'main.js'];

  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...scriptPath));
  const welcomeCssOut = vscode.Uri.joinPath(extensionUri, 'out', 'core', 'webview', 'welcome', 'welcome.css').fsPath;
  const welcomeCssPath = fs.existsSync(welcomeCssOut)
    ? ['out', 'core', 'webview', 'welcome', 'welcome.css']
    : ['src', 'core', 'webview', 'welcome', 'welcome.css'];
  const welcomeCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeCssPath));
  // Welcome assets
  const welcomeBase = ['media', 'icons', 'welcome_screen'];
  const welcomeLogo = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeBase, 'Assista Logo.svg'));
  const welcomePlus = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeBase, 'Upload Media.svg'));
  const welcomeSubmit = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeBase, 'Submit.svg'));
  const welcomeCode = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeBase, 'Code.svg'));
  const welcomeModel = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeBase, 'Model.svg'));
  const welcomeDropdown = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...welcomeBase, 'Dropdown.svg'));
  const iconsFilesBase = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'icons', 'file_icons', 'files')
  );
  const iconsFoldersBase = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'icons', 'file_icons', 'folders')
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Assista X</title>
    <link rel="stylesheet" href="${welcomeCssUri}">
    <style>

      :root {
        color-scheme: var(--vscode-color-scheme, dark light);
      }
      body {
        margin: 0;
        padding: 0;
        font-family: var(--vscode-font-family, Sans-Serif);
        background: var(--vscode-sideBar-background);
        color: var(--vscode-editor-foreground);
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      /* Force VS Code UI font in chat area (but not messages) */
      #messages,
      .chatbox textarea,
      .chatbox-toolbar,
      .chip-btn,
      .icon-btn {
        font-family: var(--vscode-font-family, Sans-Serif);
      }
      .top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        background: var(--vscode-sideBar-background);
      }
      .top-bar .title {
        font-weight: 600;
        font-size: 14px;
      }
      .top-bar button {
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, inherit);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .top-bar button:hover {
        background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.08));
      }
      #messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
        -webkit-mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
      }
      /* User message container - right aligned with flex */
      .message-row:has(.message.user) {
        display: flex;
        padding: 10px;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
      }
      /* AI message container - left aligned, with background and rounded corners */
      /* AI message container - left aligned, with background and rounded corners */
      .message-row:has(.message.ai) {
        display: flex;
        padding: 10px;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        max-width: fit-content;
        border-radius: 0 16px 16px 16px;
        border: 0.5px solid #2A2A2A;
        background: #1F1F1F;
        font-family: var(--vscode-font-family, "Segoe UI", "Helvetica Neue", sans-serif);
        color: #CDCDCD;
        font-size: 13px;
        line-height: 16px;
      }
      /* System and error message containers */
      .message-row:has(.message.system),
      .message-row:has(.message.error) {
        display: flex;
        justify-content: center;
      }
      /* User message bubble - compact, pill-shaped, auto-width */
      .message.user {
        background: rgba(188, 132, 135, 0.05);
        color: var(--vscode-editor-foreground);
        border: 0.5px solid rgba(188, 132, 135, 0.50);
        border-radius: 16px 0 16px 16px;
        padding: 8px 16px;
        max-width: fit-content;
        word-break: break-word;
        white-space: pre-wrap;
        font-family: var(--vscode-font-family, "Segoe UI", "Helvetica Neue", sans-serif);
        font-size: 13px;
        font-weight: 400;
        line-height: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      /* AI message - full width, no bubble background */
      .message.ai {
        background: transparent;
        color: #CDCDCD;
        font-family: var(--vscode-font-family, "Segoe UI", "Helvetica Neue", sans-serif);
        font-size: 13px;
        font-style: normal;
        font-weight: 400;
        line-height: 16px;
        padding: 0;
        border-radius: 0;
        width: 100%;
        max-width: 100%;
        word-break: break-word;
        white-space: normal;
        box-shadow: none;
        align-self: stretch;
      }
      /* System messages */
      .message.system {
        background: transparent;
        color: var(--vscode-descriptionForeground);
        padding: 8px 12px;
        border-radius: 8px;
        max-width: 80%;
        font-size: 12px;
        text-align: center;
      }
      /* Error messages */
      .message.error {
        background: rgba(255, 0, 0, 0.1);
        color: var(--vscode-errorForeground);
        border: 1px solid var(--vscode-errorForeground, rgba(255,0,0,0.3));
        padding: 10px 14px;
        border-radius: 8px;
        max-width: 80%;
        width: fit-content;
        box-sizing: border-box;
        font-size: 13px;
        word-break: break-all;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .message.markdown {
        white-space: normal;
        line-height: 1.6;
        font-family: var(--vscode-font-family, "Segoe UI", "Helvetica Neue", sans-serif);
        color: #CDCDCD;
        font-size: 13px;
      }
      /* Force ALL markdown content to have the same size */
      .message.markdown * {
        font-size: 13px !important;
        line-height: 1.6 !important;
      }
      .message.markdown p {
        margin: 0 0 0.8em;
      }
      .message.markdown p:last-child {
        margin-bottom: 0;
      }
      .message.markdown pre {
        background: var(--vscode-textCodeBlock-background, rgba(255, 255, 255, 0.05));
        color: var(--vscode-editor-foreground, #E1E4E8);
        padding: 0;
        overflow-x: auto;
        font-size: var(--vscode-editor-font-size, 13px) !important;
        line-height: 1.5;
        border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
        font-family: var(--vscode-editor-font-family, "Fira Code", monospace);
        white-space: pre;
        word-break: normal;
        overflow-wrap: normal;
        
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        align-self: stretch;
      }
      .message.markdown code {
        font-family: var(--vscode-editor-font-family, "Fira Code", monospace);
        background: rgba(255,255,255,0.08); /* Subtle background for inline code */
        padding: 0.2em 0.4em;
        border-radius: 4px;
        font-size: var(--vscode-editor-font-size, 13px) !important;
        color: #FFAB70; /* Orange color for inline code */
      }
      .message.markdown pre code {
        padding: 8px;
        background: transparent;
        font-size: inherit !important;
        white-space: pre;
        color: inherit; /* Inherit syntax highlighting colors */
      }

      /* Syntax Highlighting - Specific Mapping from User */
      /* Keywords (Pink) */
      .hljs-keyword, .hljs-selector-tag, .hljs-tag { color: #F97583 !important; }
      
      /* Strings (Light Blue) */
      .hljs-string, .hljs-template-tag { color: #9ECBFF !important; }
      
      /* Classes / Interfaces / Functions (Purple) - "navitem" */
      .hljs-title, .hljs-title.class_, .hljs-function, .hljs-section { color: #B392F0 !important; }
      
      /* Object Keys / Properties / Attributes (Orange) - "lable" */
      .hljs-attr, .hljs-attribute, .hljs-variable.constant_, .hljs-property { color: #FFAB70 !important; }
      
      /* Types / Built-ins (Blue) - "string" */
      .hljs-type, .hljs-built_in, .hljs-literal { color: #79B8FF !important; }
      
      /* Variables / Parameters / Default (Light Gray) */
      .hljs-variable, .hljs-params, .hljs-operator, .hljs-punctuation { color: #E1E4E8 !important; }
      
      /* Comments (Gray) */
      .hljs-comment, .hljs-quote { color: #6A737D !important; font-style: italic; }
      
      /* Numbers (Orange - usually same as constants) */
      .hljs-number { color: #FFAB70 !important; }

      /* Fallback for other renderers */
      .token.keyword { color: #F97583 !important; }
      .token.string { color: #9ECBFF !important; }
      .token.class-name, .token.function { color: #B392F0 !important; }
      .token.property, .token.attr-name { color: #FFAB70 !important; }
      .token.builtin, .token.type-alias { color: #79B8FF !important; }
      .token.comment { color: #6A737D !important; }
      
      /* Code Block Wrapper and Header */
      .code-block-wrapper {
        margin: 0.85em 0;
        border-radius: 4px;
        overflow: hidden;
        border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      }
      .code-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
      }
      .code-filename {
        font-size: 12px;
        color: var(--vscode-descriptionForeground, #9ca3af);
        font-family: var(--vscode-font-family, Sans-Serif);
      }
      .code-copy-btn {
        background: transparent;
        border: none;
        color: var(--vscode-descriptionForeground, #9ca3af);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, color 0.2s;
      }
      .code-copy-btn:hover {
        background: rgba(255,255,255,0.1);
        color: var(--vscode-editor-foreground);
      }
      .code-block-wrapper pre {
        margin: 0;
        border-radius: 0;
        border: none;
      }
      .message.markdown ul,
      .message.markdown ol {
        padding-left: 1.4em;
        margin: 0.5em 0 0.75em;
      }
      .message.markdown li + li {
        margin-top: 0.35em;
      }
      .message.markdown blockquote {
        border-left: 3px solid var(--vscode-editorLineNumber-foreground, rgba(255,255,255,0.25));
        margin: 0.75em 0;
        padding-left: 0.85em;
        color: var(--vscode-descriptionForeground);
      }
      .message.markdown table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.75em 0;
        font-size: 12px;
      }
      .message.markdown th,
      .message.markdown td {
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        padding: 6px 8px;
        text-align: left;
      }
      .message.markdown a {
        color: var(--vscode-textLink-foreground, #3794ff);
        text-decoration: none;
      }
      .message.markdown a:hover {
        text-decoration: underline;
      }
      /* Input bar container at the bottom */
      .input-bar {
        padding: 0px 8px 8px 8px;
        border-top: none;
        background: transparent;
      }
      /* Chatbox styled like the reference */
      .chatbox {
        background: #2a2a2a;
        border: 1px solid var(--vscode-input-border, #3a3a3a);
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.25);
        overflow: visible;
      }
      .chatbox textarea {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        padding: 12px 14px 8px 14px;
        font-family: inherit;
        font-size: 13px;
        color: inherit;
        resize: none;
      }
      .chatbox-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px 8px 8px;
      }
      .chatbox-toolbar .left,
      .chatbox-toolbar .right { display: flex; align-items: center; gap: 8px; }
      /* Tighter spacing between Code chip and Model chip */
      .chatbox-toolbar .left { gap: 6px; }
      /* Tighter spacing on the right icon cluster */
      .chatbox-toolbar .right { gap: 6px; }
      .chatbox-toolbar .right .icon-btn { padding: 4px; }
      .chatbox-toolbar .right .icon-svg { width: 14px; height: 14px; }
      .icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; }
      .icon-btn:hover { background: var(--vscode-editorWidget-background); }
      /* Mode button (Code/Agent) - boxed style */
      #modeToggle {
        display: flex;
        padding: 4px 8px;
        justify-content: center;
        align-items: center;
        gap: 2px;
        border-radius: 5px;
        border: 0.5px solid #3a3a3a;
        background: #2a2a2a;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        cursor: pointer;
      }
      #modeToggle:hover { color: inherit; background: var(--vscode-editorWidget-background); }
      /* Model button (GPT-5) - transparent style */
      #modelToggle {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 6px;
      }
      #modelToggle:hover { color: inherit; background: transparent; }
      .menu { position: relative; }
      .dropdown { position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; width: 260px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.12)); border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,0.35); display: none; overflow: hidden; z-index: 9999; }
      .dropdown.visible { display: block; }
      .dropdown .section-title { padding: 8px 10px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08)); }
      .dropdown button.item { width: 100%; text-align: left; padding: 8px 10px; background: transparent; color: inherit; border: none; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; cursor: pointer; }
      .dropdown button.item:hover { background: rgba(255,255,255,0.06); }
      .dropdown button.item .desc { display: block; opacity: 0.6; font-size: 11px; line-height: 1.3; }
      .dropdown .item.custom { border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08)); justify-content: flex-start; gap: 8px; }
      .send-btn { padding: 6px; border-radius: 9999px; }
      .send-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
      .icon-svg { width: 16px; height: 16px; display: inline-block; }
      /* Mention dropdown */
      .mention-menu { position: fixed; z-index: 10000; display: none; width: 260px; color: var(--vscode-editor-foreground); max-width: calc(100vw - 16px); }
      .mention-card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.12)); border-radius: 10px; box-shadow: 0 16px 40px rgba(0,0,0,0.35); overflow: hidden; max-height: min(60vh, 380px); }
      .mention-card .title { padding: 8px 12px; font-size: 12px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08)); }
      .mention-card .item { padding: 10px 12px; cursor: pointer; font-size: 13px; }
      .mention-card .item:hover { background: rgba(255,255,255,0.06); }
      .mention-panel { display: none; border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08)); }
      .mention-panel.inline-mode .mention-search { display: none; }
      .mention-search { padding: 8px 12px; }
      .mention-search input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4)); background: var(--vscode-input-background); color: inherit; font-size: 12px; }
      .mention-list { max-height: 240px; overflow-y: auto; overflow-x: hidden; }
      .mention-list .row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; width: 100%; min-width: 0; box-sizing: border-box; }
      .mention-list .row:hover { background: rgba(255,255,255,0.06); }
      .mention-list .empty { padding: 12px; text-align: center; font-size: 12px; color: var(--vscode-descriptionForeground); }
      .mention-list .label { font-size: 13px; flex: 0 0 auto; }
      /* Left/start ellipsis for the path: RTL outer + LTR inner preserves character order */
      .mention-list .desc { font-size: 11px; opacity: .7; margin-left: 6px; flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; direction: rtl; }
      .mention-list .desc > span { direction: ltr; unicode-bidi: plaintext; }
      .file-icon { width: 16px; height: 16px; flex: 0 0 16px; object-fit: contain; opacity: .95; }
      /* Custom tooltip for full paths (no border, slightly darker background) */
      .mention-tooltip {
        position: fixed; z-index: 10001; display: none; padding: 6px 8px; font-size: 11px; border-radius: 6px;
        background: rgba(0,0,0,0.85); color: var(--vscode-editor-foreground);
        border: none; box-shadow: 0 6px 20px rgba(0,0,0,0.35);
        max-width: 70vw; pointer-events: none; white-space: pre; overflow-wrap: anywhere;
      }
      textarea {
        flex: 1;
        resize: none;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        border-radius: 8px;
        padding: 10px 12px;
        font-family: inherit;
        font-size: 13px;
        color: inherit;
        background: var(--vscode-input-background);
      }
      /* Neutral focus for chat textarea: no colored outline/border */
      textarea:focus,
      textarea:focus-visible {
        outline: none;
        border-color: var(--vscode-input-border, rgba(128,128,128,0.4));
        box-shadow: none;
      }
      button {
        border: none;
        border-radius: 8px;
        padding: 0 16px;
        font-size: 13px;
        cursor: pointer;
      }
      /* Keep send button unstyled (no blue background) */
      #sendBtn { background: transparent; color: inherit; }
      #sendBtn.hidden {
        display: none;
      }
      #stopBtn {
        background: var(--vscode-errorForeground);
        color: var(--vscode-editor-background);
        display: none;
      }
      #stopBtn.visible {
        display: inline-flex;
      }
      .settings-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 20;
      }
      .settings-overlay.visible {
        display: flex;
      }
      .settings-modal {
        width: min(480px, 90vw);
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        border-radius: 10px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.35);
        padding: 16px 20px 20px;
      }
      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .settings-header h2 {
        margin: 0;
        font-size: 16px;
      }
      .settings-header button {
        background: transparent;
        color: inherit;
        font-size: 18px;
        padding: 4px 8px;
      }
      .settings-section {
        margin-bottom: 16px;
      }
      .settings-section h3 {
        font-size: 14px;
        margin: 0 0 8px 0;
      }
      .settings-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }
      .settings-group label {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }
      .settings-group input {
        width: 100%;
        box-sizing: border-box;
        border-radius: 6px;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        background: var(--vscode-input-background);
        color: inherit;
        padding: 8px;
        font-size: 13px;
      }
      .settings-group small {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .radio-group {
        display: flex;
        gap: 12px;
        margin: 6px 0 12px;
      }
      .radio-group label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }
      .settings-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }
      .settings-actions button {
        padding: 6px 14px;
      }
      .settings-actions .primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      .settings-actions .secondary {
        background: transparent;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        color: inherit;
      }
      .settings-status {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .settings-status.configured {
        color: var(--vscode-testing-iconPassed, #4caf50);
      }
      .settings-status.missing {
        color: var(--vscode-errorForeground);
      }
      .settings-message {
        font-size: 12px;
        margin-bottom: 8px;
        min-height: 16px;
      }
      .settings-message.error {
        color: var(--vscode-errorForeground);
      }
      .settings-message.success {
        color: var(--vscode-testing-iconPassed, #56c);
      }

      /* New full-page Settings styles */
      #settingsPage {
        padding: 20px;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
      .settings-container { max-width: 800px; margin: 0 auto; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding-bottom: 15px;
        border-bottom: 1px solid var(--vscode-panel-border, #333);
      }
      .header h1 { font-size: 24px; font-weight: 400; }
      .header-buttons { display: flex; gap: 10px; }
      .btn { padding: 8px 16px; border: none; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; }
      .btn-save { background-color: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); }
      .btn-save:hover { filter: brightness(1.05); }
      .btn-done { background-color: var(--vscode-sideBar-background, #3c3c3c); color: var(--vscode-editor-foreground, #ccc); }
      .btn-done:hover { filter: brightness(1.1); }
      .section { margin-bottom: 30px; }
      .section-title { font-size: 13px; margin-bottom: 8px; font-weight: 400; }
      .section-description { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-bottom: 15px; }
      .input-group { margin-bottom: 20px; }
      .input-label { font-size: 13px; margin-bottom: 8px; display: block; }
      .link { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; margin-left: 10px; font-size: 12px; }
      .link:hover { text-decoration: underline; }
      select, input[type="text"], input[type="password"] {
        width: 100%; padding: 8px 12px; background-color: var(--vscode-input-background, #3c3c3c);
        border: 1px solid var(--vscode-input-border, #3c3c3c); color: inherit; border-radius: 3px; font-size: 13px; outline: none;
      }
      select:focus, input:focus { border-color: var(--vscode-focusBorder, #007acc); }
      .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
      .icon-btn { background: none; border: none; color: inherit; cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
      .icon-btn:hover { background-color: var(--vscode-editorWidget-background, #3c3c3c); }
      .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
      .profile-row select { flex: 1; }
      .checkbox-group { display: flex; align-items: center; margin-bottom: 12px; }
      .checkbox-group input[type="checkbox"] { width: auto; margin-right: 10px; cursor: pointer; }
      .checkbox-group label { font-size: 13px; cursor: pointer; }
      .info-text { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-top: 5px; }
      .info-box { background-color: var(--vscode-editorWidget-background, #252526); padding: 15px; border-radius: 4px; margin-top: 15px; font-size: 12px; line-height: 1.6; }
      .info-box ul { list-style: none; padding-left: 15px; }
      .info-box li { margin: 5px 0; }
      .info-box li::before { content: "✓"; color: var(--vscode-testing-iconPassed, #4ec9b0); margin-right: 8px; }
      .error-message { background-color: #5a1d1d; border-left: 3px solid #f48771; padding: 10px; margin: 10px 0; font-size: 12px; color: #f48771; border-radius: 3px; }
      .expandable { cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 13px; margin-top: 15px; padding: 8px 0; }
      .arrow { transition: transform 0.2s; }
      .arrow.expanded { transform: rotate(90deg); }

      /* Responsive Design for Chat Interface */
      @media (max-width: 400px) {
        .input-bar { padding: 8px; }
        .chatbox { border-radius: 8px; }
        .chatbox textarea { padding: 8px 10px 6px 10px; font-size: 12px; }
        .chatbox-toolbar { padding: 0 6px 6px 6px; }
        .chatbox-toolbar .left,
        .chatbox-toolbar .right { gap: 4px; }
        .chip-btn { font-size: 11px; padding: 2px 3px; gap: 3px; }
        .icon-btn { padding: 4px; }
        .icon-svg { width: 14px; height: 14px; }
        .chatbox-toolbar .right .icon-svg { width: 12px; height: 12px; }
        .dropdown { width: 200px; margin-bottom: 6px; }
        .dropdown .section-title { font-size: 10px; padding: 6px 8px; }
        .dropdown button.item { padding: 6px 8px; font-size: 12px; }
        .message { padding: 10px 12px; max-width: 90%; font-size: 13px; }
        #messages { padding: 12px 8px; gap: 6px; }
        .mention-menu { width: 220px; }
        .mention-card { max-height: min(50vh, 300px); }
      }

      @media (max-width: 280px) {
        .input-bar { padding: 6px; }
        .chatbox { border-radius: 6px; }
        .chatbox textarea { padding: 6px 8px 4px 8px; font-size: 11px; min-height: 36px; }
        .chatbox-toolbar { padding: 0 4px 4px 4px; }
        .chatbox-toolbar .left,
        .chatbox-toolbar .right { gap: 3px; }
        .chip-btn { font-size: 10px; padding: 1px 2px; gap: 2px; }
        .chip-btn span { display: none; } /* Hide text labels on very small screens */
        .icon-btn { padding: 3px; }
        .icon-svg { width: 12px; height: 12px; }
        .chatbox-toolbar .right .icon-svg { width: 10px; height: 10px; }
        .dropdown { width: 160px; }
        .dropdown button.item { padding: 5px 6px; font-size: 11px; }
        .message { padding: 8px 10px; max-width: 95%; font-size: 12px; border-radius: 8px; }
        #messages { padding: 8px 6px; gap: 4px; }
        .mention-menu { width: 180px; }
      }
    </style>
  </head>
  <body>
    
    <div id="welcomeScreen" style="display:none;" aria-hidden="true">${getWelcomeHtml({
    logo: String(welcomeLogo),
    plus: String(welcomePlus),
    submit: String(welcomeSubmit),
    code: String(welcomeCode),
    model: String(welcomeModel),
    dropdown: String(welcomeDropdown),
  })}</div>
    <div id="messages"></div>
    ${getSettingsModalHtml()}
    ${getHistoryHtml()}
    <div class="input-bar">
      <div class="chatbox">
        <textarea id="chatInput" rows="1" placeholder="Ask anything (Ctrl+L)" style="max-height:200px; min-height:44px"></textarea>
        <div class="chatbox-toolbar">
          <div class="left">
            <div class="menu" id="modeMenu">
              <button class="chip-btn" id="modeToggle" title="Mode">
                <span id="modeIcon">
                  <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                </span>
                <span id="modeLabel">Agent</span>
              </button>
              <div class="dropdown" id="modeDropdown">
                <button class="item" data-mode="code"><span>Agent</span><span class="desc" style="opacity:.6;font-size:11px">Assista can write and edit code</span></button>
                <button class="item" data-mode="chat"><span>Chat</span><span class="desc" style="opacity:.6;font-size:11px">Chat with Assista</span></button>
              </div>
            </div>
            <div class="menu" id="modelMenu">
              <button class="chip-btn" id="modelToggle" title="Model">
                <span id="modelLabel">GPT-5 (low reasoning)</span>
              </button>
              <div class="dropdown" id="modelDropdown">
                <div class="section-title">Recently Used</div>
                <button class="item" data-model="gpt5-low"><span>GPT-5 (low reasoning)</span><span style="opacity:.6;font-size:11px">0.5x</span></button>
                <button class="item" data-model="gpt5-high"><span>GPT-5 (high reasoning)</span><span style="opacity:.6;font-size:11px">3x</span></button>
                <div class="section-title">Recommended</div>
                <button class="item" data-model="gpt4"><span>GPT-4</span><span style="opacity:.6;font-size:11px">2x</span></button>
                <button class="item" data-model="sonnet-4.5"><span>Claude Sonnet 4.5</span><span style="opacity:.6;font-size:11px">2x</span></button>
                <button class="item" data-model="sonnet-4-thinking"><span>Claude Sonnet 4.5 Thinking</span><span style="opacity:.6;font-size:11px">3x</span></button>
                <button class="item custom" data-action="custom-api"><span>Use custom API key…</span></button>
              </div>
            </div>
          </div>
          <div class="right">
            <button class="icon-btn" id="mentionBtn" title="Mention">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.8 6C10.8 3.34903 8.65098 1.2 6 1.2C3.34903 1.2 1.2 3.34903 1.2 6C1.2 8.65098 3.34903 10.8 6 10.8C6.98508 10.8 7.90086 10.5032 8.66286 9.99426L9.32856 10.9928C8.37612 11.6291 7.23138 12 6 12C2.68629 12 0 9.31368 0 6C0 2.68629 2.68629 0 6 0C9.31368 0 12 2.68629 12 6V6.9C12 8.0598 11.0598 9 9.9 9C9.17748 9 8.54016 8.63508 8.16228 8.07954C7.61652 8.6469 6.84948 9 6 9C4.34315 9 3 7.65684 3 6C3 4.34315 4.34315 3 6 3C6.67548 3 7.29882 3.22325 7.8003 3.6H9V6.9C9 7.39704 9.40296 7.8 9.9 7.8C10.397 7.8 10.8 7.39704 10.8 6.9V6ZM6 4.2C5.00586 4.2 4.2 5.00586 4.2 6C4.2 6.99414 5.00586 7.8 6 7.8C6.99414 7.8 7.8 6.99414 7.8 6C7.8 5.00586 6.99414 4.2 6 4.2Z" fill="#CDCDCD"/>
              </svg>
            </button>
            <button class="icon-btn send-btn" id="stopBtn" type="button" title="Stop">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="1"/>
              </svg>
            </button>
            <button class="icon-btn send-btn" id="sendBtn" type="button" title="Send">
              <svg width="11" height="12" viewBox="0 0 11 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0.282593 0C0.33021 0 0.377059 0.0119894 0.418781 0.0348532L10.8535 5.75324C10.9903 5.82819 11.0402 5.99939 10.965 6.13567C10.9391 6.18247 10.9005 6.22099 10.8535 6.24672L0.418781 11.9651C0.282028 12.04 0.110194 11.9903 0.0349793 11.8541C0.0120328 11.8125 0 11.7658 0 11.7184V0.281574C0 0.126066 0.126523 0 0.282593 0ZM1.13037 1.71023V5.4368H3.95631V6.5631H1.13037V10.2897L8.95815 5.99995L1.13037 1.71023Z" fill="#CDCDCD"/>
              </svg>
            </button>
          </div>
        </div>
        <!-- Mention dropdown, positioned by chat.js near the input caret/button -->
        <div id="mentionMenu" class="mention-menu" role="menu" aria-hidden="true">
          <div class="mention-card">
            <div class="mention-default-section">
              <div class="item mention-recent-1" role="menuitem" style="display:none;">Recent: (1)</div>
              <div class="item mention-recent-2" role="menuitem" style="display:none;">Recent: (2)</div>
              <div class="item mention-recent-3" role="menuitem" style="display:none;">Recent: (3)</div>
              <div class="item mention-pick-files" role="menuitem">Files & Folders</div>
            </div>
            <div class="mention-panel mention-picker-panel">
              <div class="mention-search" style="display:flex; align-items:center; gap:8px;">
                <input class="mention-picker-search-input" type="text" placeholder="Search files and folders..." />
              </div>
              <div class="mention-list mention-picker-list" role="listbox"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script nonce="${nonce}" type="module">
      window.__ASSISTA_ICON_FILES_BASE__ = '${iconsFilesBase}';
      window.__ASSISTA_ICON_FOLDERS_BASE__ = '${iconsFoldersBase}';
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}
