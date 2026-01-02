import * as vscode from 'vscode';
import * as fs from 'fs';
import { getSettingsModalHtml } from '../settings/settingsHtml.js';
import { getHistoryHtml } from '../history/historyHtml.js';
import { getWelcomeHtml } from '../welcome/welcomeHtml.js';
import { getReviewBannerHtml } from '../review/reviewHtml.js';

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getModelMenuHtml(idPrefix: string, assets?: { model?: string; dropdown?: string }): string {
  const modelIcon = assets?.model ? `<img class="chip-icon" src="${assets.model}" alt="Model icon" />` : '';
  const dropdownIcon = assets?.dropdown ? `<img class="dropdown-icon" src="${assets.dropdown}" alt="Dropdown" />` : '';

  const rootId = idPrefix ? `${idPrefix}ModelMenu` : 'modelMenu';
  const toggleId = idPrefix ? `${idPrefix}ModelToggle` : 'modelToggle';
  const labelId = idPrefix ? `${idPrefix}ModelLabel` : 'modelLabel';
  const dropdownId = idPrefix ? `${idPrefix}ModelDropdown` : 'modelDropdown';

  return `
    <div class="menu" id="${rootId}">
      <button class="chip-btn" id="${toggleId}" title="Model">
        ${modelIcon}
        <span id="${labelId}">GPT-5 (low reasoning)</span>
        ${dropdownIcon}
      </button>
      <div class="dropdown" id="${dropdownId}" role="listbox">
        <button class="item" data-model="gpt5-low"><span>GPT-5 (low reasoning)</span><span style="opacity:.6;font-size:11px">0.5x</span></button>
        <button class="item" data-model="gpt5-high"><span>GPT-5 (high reasoning)</span><span style="opacity:.6;font-size:11px">3x</span></button>
        <button class="item" data-model="gpt4"><span>GPT-4</span><span style="opacity:.6;font-size:11px">2x</span></button>
        <button class="item" data-model="sonnet-4.5"><span>Claude Sonnet 4.5</span><span style="opacity:.6;font-size:11px">2x</span></button>
        <button class="item" data-model="sonnet-4-thinking"><span>Claude Sonnet 4.5 Thinking</span><span style="opacity:.6;font-size:11px">3x</span></button>
        <button class="item custom" data-action="custom-api"><span>Use custom API key…</span></button>
      </div>
    </div>`;
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

  // Helper to get CSS URI with fallback
  const getCssUri = (pathSegments: string[]) => {
    const outPath = vscode.Uri.joinPath(extensionUri, 'out', ...pathSegments).fsPath;
    const path = fs.existsSync(outPath) ? ['out', ...pathSegments] : ['src', ...pathSegments];
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...path));
  };

  const baseCssUri = getCssUri(['core', 'webview', 'ui', 'base.css']);
  const chatCssUri = getCssUri(['core', 'webview', 'chat', 'chat.css']);
  const toolsCssUri = getCssUri(['core', 'webview', 'chat', 'tools.css']);
  const diffCssUri = getCssUri(['core', 'webview', 'chat', 'diff.css']);
  const mentionsCssUri = getCssUri(['core', 'webview', 'mentions', 'mentions.css']);

  const settingsCssUri = getCssUri(['core', 'webview', 'settings', 'settings.css']);
  const reviewCssUri = getCssUri(['core', 'webview', 'review', 'review.css']);

  // Markdown rendering libraries
  const markedScript = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'libs', 'marked.js'));
  const dompurifyScript = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'libs', 'purify.min.js'));
  const hljsScript = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'libs', 'highlight.js'));
  const hljsCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'libs', 'highlight.css'));

  // Helper to get JS URI with fallback
  const getJsUri = (pathSegments: string[]) => {
    const outPath = vscode.Uri.joinPath(extensionUri, 'out', ...pathSegments).fsPath;
    const path = fs.existsSync(outPath) ? ['out', ...pathSegments] : ['src', ...pathSegments];
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...path));
  };

  const markdownRendererUri = getJsUri(['core', 'webview', 'utils', 'markdownRenderer.js']);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Assista Coder</title>
    <link rel="stylesheet" href="${welcomeCssUri}">
    <link rel="stylesheet" href="${baseCssUri}">
    <link rel="stylesheet" href="${chatCssUri}">
    <link rel="stylesheet" href="${mentionsCssUri}">
    <link rel="stylesheet" href="${toolsCssUri}">
    <link rel="stylesheet" href="${diffCssUri}">

    <link rel="stylesheet" href="${settingsCssUri}">
    <link rel="stylesheet" href="${reviewCssUri}">
    <link rel="stylesheet" href="${hljsCss}">
  </head>
  <body>
    
    <div id="welcomeScreen" style="display:none;" aria-hidden="true">${getWelcomeHtml({
    logo: String(welcomeLogo),
    plus: String(welcomePlus),
    submit: String(welcomeSubmit),
    code: String(welcomeCode),
    model: String(welcomeModel),
    dropdown: String(welcomeDropdown),
    modelMenuHtml: getModelMenuHtml('welcome', { model: String(welcomeModel), dropdown: String(welcomeDropdown) }),
  })}</div>
    <div id="messages"></div>
    ${getSettingsModalHtml()}
    ${getHistoryHtml()}
    ${getReviewBannerHtml()}
    <div class="input-bar">
      <div class="chatbox">
        <div id="chatInput" contenteditable="plaintext-only" role="textbox" aria-multiline="true" placeholder="Ask anything (Ctrl+L)"></div>
        <div class="chatbox-toolbar">
          <div class="left">
            <div class="menu" id="modeMenu">
              <button class="chip-btn" id="modeToggle" title="Mode">
                <span id="modeIcon">
                  <!-- Chat Icon (hidden by default) -->
                  <svg class="icon-svg mode-icon-chat" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 2H4C2.9 2 2 2.9 2 4V16C2 17.1 2.9 18 4 18H6L10 22L14 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" stroke-linejoin="round"/>
                    <path d="M7 9H17"/>
                    <path d="M7 13H13"/>
                  </svg>
                  <!-- Agent Icon (code brackets, visible by default) -->
                  <svg class="icon-svg mode-icon-agent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                </span>
                <span id="modeLabel">Agent</span>
              </button>
              <div class="dropdown" id="modeDropdown">
                <button class="item" data-mode="chat"><span>Chat</span><span class="desc" style="opacity:.6;font-size:11px">Chat with Cascade</span></button>
                <button class="item" data-mode="agent"><span>Agent</span><span class="desc" style="opacity:.6;font-size:11px">Cascade can write and edit code</span></button>
              </div>
            </div>
            ${getModelMenuHtml('')}
          </div>
          <div class="right">
            <button class="icon-btn" id="mentionBtn" title="Mention">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.8 6C10.8 3.34903 8.65098 1.2 6 1.2C3.34903 1.2 1.2 3.34903 1.2 6C1.2 8.65098 3.34903 10.8 6 10.8C6.98508 10.8 7.90086 10.5032 8.66286 9.99426L9.32856 10.9928C8.37612 11.6291 7.23138 12 6 12C2.68629 12 0 9.31368 0 6C0 2.68629 2.68629 0 6 0C9.31368 0 12 2.68629 12 6V6.9C12 8.0598 11.0598 9 9.9 9C9.17748 9 8.54016 8.63508 8.16228 8.07954C7.61652 8.6469 6.84948 9 6 9C4.34315 9 3 7.65684 3 6C3 4.34315 4.34315 3 6 3C6.67548 3 7.29882 3.22325 7.8003 3.6H9V6.9C9 7.39704 9.40296 7.8 9.9 7.8C10.397 7.8 10.8 7.39704 10.8 6.9V6ZM6 4.2C5.00586 4.2 4.2 5.00586 4.2 6C4.2 6.99414 5.00586 7.8 6 7.8C6.99414 7.8 7.8 6.99414 7.8 6C7.8 5.00586 6.99414 4.2 6 4.2Z" fill="currentColor"/>
              </svg>
            </button>
            <button class="icon-btn send-btn" id="stopBtn" type="button" title="Stop">
              <svg class="icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="7" y="7" width="10" height="10" rx="1.5"/>
              </svg>
            </button>
            <button class="icon-btn send-btn" id="sendBtn" type="button" title="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
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
    <!-- Markdown rendering libraries -->
    <script nonce="${nonce}" src="${markedScript}"></script>
    <script nonce="${nonce}" src="${dompurifyScript}"></script>
    <script nonce="${nonce}" src="${hljsScript}"></script>
    <script nonce="${nonce}" src="${markdownRendererUri}"></script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}
