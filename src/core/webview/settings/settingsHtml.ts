export function getSettingsModalHtml(): string {
  // Wrapped in a container so we can show/hide it inside the webview
  return `
    <div id="settingsPage" style="display:none">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #settingsPage { margin: 0 !important; padding: 0 !important; }
        .settings-content { display: flex; flex-direction: column; overflow-y: auto; height: 100vh; background-color: transparent; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0; padding: 12px 24px; border-bottom: none; flex-wrap: nowrap; column-gap: 12px; }
        .header-buttons { display: flex; gap: 10px; }
        .btn { padding: 8px 16px; border: none; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn.btn-save { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .btn.btn-done { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .btn.btn-get-api {
          display: inline-flex;
          min-width: fit-content;
          width: auto;
          justify-content: center;
          align-items: center;
          gap: 6px;
          align-self: stretch;
          border-radius: 8px;
          border: 0.5px solid rgba(188, 132, 135, 0.50);
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          padding: 6px 12px;
          white-space: nowrap;
          cursor: pointer;
          font-size: 13px;
          flex-shrink: 0;
        }
        .btn.btn-get-api:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .api-key-row { display: flex; gap: 10px; align-items: center; }
        .api-key-row input[type="password"] { flex: 1; }
        .section { margin-bottom: 16px; }
        /* Ensure content aligns with subheader padding */
        .content-body { display: flex; padding: 0px 24px; flex-direction: column; align-items: stretch; gap: 16px; align-self: stretch; }
        .settings-container { margin: 0; padding: 24px; flex-direction: column; align-items: stretch; gap: 16px; flex: 1 0 0; align-self: stretch; }
        .section-title { font-size: 13px; color: var(--vscode-editor-foreground); margin-bottom: 8px; font-weight: 400; font-style: normal; line-height: normal; flex: 1 0 0; }
        .section-description { font-size: 12px; color: var(--vscode-editor-foreground); margin-bottom: 15px; font-weight: 400; font-style: normal; line-height: normal; }
        /* Make content section headings bold with gradient (e.g., General Settings h2) */
        .settings-container h2, .content-body h2 { font-size: 20px; font-style: normal; font-weight: 700; line-height: normal; background: linear-gradient(91deg, #E3B2B3 0%, #BC8487 99.58%); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
        .profile-row select { flex: 1; }
        .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
        .icon-btn { background: none; border: none; color: var(--vscode-editor-foreground); cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
        .checkbox-group { display: flex; align-items: center; margin-bottom: 0px; }
        .checkbox-group input[type="checkbox"] { width: auto; margin-right: 10px; cursor: pointer; }
        .checkbox-group label { font-size: 13px; }
        .info-text { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px; font-weight: 400; font-style: normal; line-height: normal; }
        .info-box { background-color: var(--vscode-editorWidget-background); padding: 15px; border-radius: 4px; margin-top: 15px; font-size: 12px; line-height: 1.6; color: var(--vscode-editor-foreground); font-weight: 400; }

        /* Neutral focus for Settings fields: no colored outline/border */
        select:focus, select:focus-visible,
        input[type="text"]:focus, input[type="text"]:focus-visible,
        input[type="password"]:focus, input[type="password"]:focus-visible {
          outline: none;
          border-color: var(--vscode-focusBorder);
          box-shadow: none;
          background-color: var(--vscode-input-background);
        }
        /* focus style intentionally neutralized via rules above */

        /* Model dropdown list styles */
        .model-dropdown-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          max-height: 300px;
          overflow-y: auto;
          background-color: var(--vscode-dropdown-background);
          border: 1px solid var(--vscode-dropdown-border);
          border-radius: 3px;
          margin-top: 4px;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .model-dropdown-item {
          padding: 8px 12px;
          cursor: pointer;
          font-size: 13px;
          color: var(--vscode-dropdown-foreground);
          transition: background-color 0.15s;
        }
        .model-dropdown-item:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .model-dropdown-item.selected {
          background-color: var(--vscode-list-activeSelectionBackground);
        }
        .model-dropdown-empty {
          padding: 12px;
          text-align: center;
          color: var(--vscode-descriptionForeground);
          font-size: 12px;
        }

        /* Custom Provider Dropdown Styles (matching History page) */
        .stx-dd-wrap { position: relative; width: 100%; }
        .stx-dd-btn {
          width: 100%;
          padding: 0 10px;
          height: 28px;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 0.5px solid var(--vscode-input-border);
          border-radius: 8px;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 400;
        }
        .stx-dd-btn:hover { background: var(--vscode-list-hoverBackground); }
        .stx-dd-btn:focus { outline: none; }
        .stx-dd-chevron {
          opacity: 0.7;
          transition: transform 0.2s;
          flex-shrink: 0;
        }
        .stx-dd-wrap.open .stx-dd-chevron {
          transform: rotate(180deg);
        }

        .stx-dd-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          width: 100%;
          background: var(--vscode-dropdown-background);
          border: 1px solid var(--vscode-dropdown-border);
          color: var(--vscode-dropdown-foreground);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          display: none;
          z-index: 1000;
          padding: 4px;
        }
        .stx-dd-menu.show { display: block; }
        .stx-dd-item {
          padding: 8px 12px;
          font-size: 13px;
          cursor: pointer;
          border-radius: 4px;

        }
        .stx-dd-item:hover { background: var(--vscode-list-hoverBackground); }
        .stx-dd-item.active {
          background: var(--vscode-list-activeSelectionBackground);
          color: var(--vscode-list-activeSelectionForeground);
        }

        /* Reusable input field style matching Provider dropdown */
        .settings-input {
          display: flex;
          width: 100%;
          height: 28px;
          padding: 0 10px;
          justify-content: space-between;
          align-items: center;
          background-color: var(--vscode-input-background);
          border: 0.5px solid var(--vscode-input-border);
          color: var(--vscode-input-foreground);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 400;
          box-sizing: border-box;
          outline: none;
        }
        .settings-input:hover { background: var(--vscode-list-hoverBackground); }
        .settings-input:focus { border-color: var(--vscode-focusBorder); background-color: var(--vscode-input-background); }

        /* Subheading for active section (text only) */
        .subheader { display: flex; align-items: center; height: 32px; padding: 0 12px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editorWidget-background); margin: 5px; }
        .subheader .subheader-text { font-size: 14px; font-weight: 500; }

        /* Responsive tweaks */
        @media (max-width: 768px) {
          .sidebar { width: 50px; }
        }
        @media (max-width: 600px) {
          .settings-container { padding: 20px 16px; }
          .header { flex-direction: row; align-items: center; }
        }
        @media (max-width: 320px) {
          .content-body {
            padding: 12px;
          }
          .profile-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 12px;
          }
          .profile-header .avatar {
            margin: 0 auto;
          }
          .user-info {
            align-items: center;
            text-align: center;
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }
          .user-email, .user-meta {
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: normal;
            max-width: 100%;
          }
          .logout-btn {
            width: 100%;
          }

          /* Profile Header Fixes for Narrow Widths */
          .profile-header {
            padding: 12px;
          }
          .usage-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          .usage-meta {
            width: 100%;
            justify-content: space-between;
            margin-top: 4px;
            flex-wrap: wrap;
          }
          .usage-label {
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            margin-bottom: 8px;
          }
          .upgrade-btn {
            width: 100%;
            padding: 8px;
            font-size: 12px;
            white-space: normal;
          }
        }

        /* Confirm overlay (Unsaved Changes) */
        .stx-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: none; align-items: center; justify-content: center; z-index: 99999; }
        .stx-confirm { width: 520px; max-width: calc(100% - 24px); background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 12px; color: var(--vscode-editor-foreground); box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
        .stx-confirm .hd { padding: 16px 20px; font-weight: 700; border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; }
        .stx-confirm .bd { padding: 16px 20px; color: var(--vscode-descriptionForeground); }
        .stx-confirm .ft { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid var(--vscode-panel-border); }
        .stx-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
        .stx-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .stx-btn.primary { background: var(--vscode-button-background); border-color: var(--vscode-button-border); color: var(--vscode-button-foreground); }

        /* Back button styling */
        /* Back button styling matching history page */
        .back-btn {
            display: flex;
            width: auto;
            align-items: center;
            gap: 8px;
            background: transparent;
            border: none;
            color: var(--vscode-editor-foreground);
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            padding: 0;
            transition: opacity 0.2s;
        }
        .back-btn:hover { opacity: 0.8; }
        .back-btn svg { fill: var(--vscode-editor-foreground); }

        /* Settings title section */
        .settings-title-section { padding: 0 24px; margin-bottom: 8px; }
        .settings-title-section h1 {
          font-size: 20px;
          font-style: normal;
          font-weight: 700;
          line-height: normal;
          background: linear-gradient(91deg, #E3B2B3 0%, #BC8487 99.58%);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 4px 0;
        }
        .settings-subtitle { font-size: 13px; color: var(--vscode-descriptionForeground); margin: 0; font-weight: 400; font-style: normal; line-height: normal; }

        /* Profile & Usage Styles */
        .profile-header { display: flex; align-items: center; gap: 16px; margin-top: 8px; margin-bottom: 16px; padding: 16px; max-width: 800px; border: 0.5px solid rgba(188, 132, 135, 0.50); border-radius: 7px; background: rgba(188, 132, 135, 0.05); }
        .avatar {
          display: flex;
          width: 50px;
          height: 50px;
          padding: 10px;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 10px;
          border-radius: 50px;
          border: 0.5px solid rgba(188, 132, 135, 0.50);
          background: rgba(188, 132, 135, 0.05);
          flex-shrink: 0;
        }
        .user-info {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 3px;
          flex: 1 0 0;
          align-self: stretch;
        }
        .user-name { font-size: 15px; font-weight: 500; color: var(--vscode-editor-foreground); margin-bottom: 0; }
        .user-email { font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 0; }
        .user-meta { font-size: 12px; color: var(--vscode-descriptionForeground); display: flex; align-items: center; gap: 4px; }
        .logout-btn {
          display: flex;
          padding: 10px 16px;
          justify-content: center;
          align-items: center;
          gap: 10px;
          border-radius: 8px;
          border: 0.5px solid var(--vscode-button-border);
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          font-size: 12px;
          cursor: pointer;
        }
        .usage-card {
          border: 0.5px solid rgba(188, 132, 135, 0.50);
          border-radius: 7px;
          padding: 16px;
          background: rgba(188, 132, 135, 0.05);
          margin-top: 8px;
          max-width: 800px;
        }
        .usage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 14px; color: var(--vscode-editor-foreground); }
        .usage-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--vscode-descriptionForeground); }
        .badge { background: var(--vscode-badge-background); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); font-size: 11px; color: var(--vscode-badge-foreground); }
        .usage-stats { margin-bottom: 16px; }
        .usage-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
        .progress-bar { height: 8px; background: var(--vscode-progressBar-background); border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #E3B2B3 0%, #BC8487 100%); border-radius: 4px; }
        .upgrade-btn { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--vscode-button-border); color: var(--vscode-button-foreground); border-radius: 8px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
        .upgrade-btn:hover { background: rgba(188, 132, 135, 0.1); }
      </style>
      <div class="header">
        <button class="back-btn" id="settingsBackBtn">
            <svg width="6" height="10" viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.10115 4.72761L5.7782 1.05057L4.72762 0L1.90735e-05 4.72761L4.72762 9.45516L5.7782 8.4046L2.10115 4.72761Z" fill="#CDCDCD"/>
            </svg>
            <span>Back</span>
        </button>
        <div class="header-buttons">
          <button class="btn btn-save" id="settingsSaveBtn">Save</button>
        </div>
      </div>
      <div class="settings-title-section">
        <h1>Settings</h1>
        <p class="settings-subtitle">Your conversation timeline</p>
      </div>
      <div class="settings-content">
            <div class="content-body">
            <div class="profile-header">
                <div class="avatar">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="9" stroke="#CDCDCD" stroke-width="1.5"/>
                        <path d="M7 17C7.5 15 9.5 14 12 14C14.5 14 16.5 15 17 17" stroke="#CDCDCD" stroke-width="1.5" stroke-linecap="round"/>
                        <circle cx="12" cy="9" r="2.5" stroke="#CDCDCD" stroke-width="1.5"/>
                    </svg>
                </div>
                <div class="user-info">
                    <div class="user-name" id="userDisplayName">Loading...</div>
                    <div class="user-email" id="userEmail">Loading...</div>
                </div>
            </div>


            <div class="section">
              <div class="section-title">API Provider </div>
              <div class="stx-dd-wrap" id="ddProvider">
                <button class="stx-dd-btn" id="btnProvider" type="button">
                  <span class="label">OpenRouter</span>
                  <svg class="stx-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="#CDCDCD" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div class="stx-dd-menu">
                  <div class="stx-dd-item active" data-value="openrouter">OpenRouter</div>
                  <!-- <div class="stx-dd-item" data-value="anthropic">Anthropic</div> -->
                  <!-- <div class="stx-dd-item" data-value="openai">OpenAI</div> -->
                  <!-- <div class="stx-dd-item" data-value="google">Google (Gemini)</div> -->
                </div>
              </div>
              <!-- Hidden select for compatibility -->
              <select id="provider" style="display:none;">
                <option value="openrouter">OpenRouter</option>
                <!-- <option value="anthropic">Anthropic</option> -->
                <!-- <option value="openai">OpenAI</option> -->
                <!-- <option value="google">Google (Gemini)</option> -->
              </select>
            </div>

            <div class="section">
              <div class="section-title" id="apiKeyLabel">OpenRouter API Key</div>
              <div class="api-key-row">
                <input type="password" id="apiKey" class="settings-input" />
                <button class="btn btn-get-api" id="getApiKeyBtn">Get OpenRouter API</button>
              </div>
            </div>

            <div class="section"><div class="checkbox-group"><input type="checkbox" id="customUrl" /><label for="customUrl">Use custom base URL</label></div></div>
            <div class="section" id="customUrlField" style="display:none;">
              <div class="section-title">Custom Base URL</div>
              <input type="text" id="baseUrl" class="settings-input" placeholder="https://api.example.com/v1" />
            </div>

            <div class="section">
              <div class="section-title">Model</div>
              <div style="position: relative;">
                <input type="text" id="model" class="settings-input" autocomplete="off" />
                <div id="modelDropdownList" class="model-dropdown-list" style="display: none;">
                  <!-- Model items will be populated here by JavaScript -->
                </div>
              </div>
              <div class="error-message" id="errorMessage" style="display: none;">✕ The model ID you provided is not available. Please choose a different model.</div>

            </div>

            <div class="section">
              <div class="section-title">RAG Service (Odoo Documentation)</div>
              <div class="checkbox-group">
                <input type="checkbox" id="ragEnabled" />
                <label for="ragEnabled">Enable RAG to retrieve relevant Odoo documentation context</label>
              </div>
              <div class="info-text">When enabled, the AI will retrieve relevant Odoo documentation from the RAG server before generating responses, improving accuracy for Odoo-specific queries.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Unsaved Changes Modal -->
      <div id="unsavedChangesModal" class="stx-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="unsavedTitle">
        <div class="stx-confirm">
          <div class="hd" id="unsavedTitle">Unsaved Changes</div>
          <div class="bd">Do you want to discard changes and continue?</div>
          <div class="ft">
            <button id="cancelDiscardBtn" class="stx-btn" type="button">Cancel</button>
            <button id="confirmDiscardBtn" class="stx-btn primary" type="button">Discard changes</button>
          </div>
        </div>
      </div>

    </div>
  `;
}
