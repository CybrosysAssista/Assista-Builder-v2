export function getSettingsModalHtml(): string {
  // Wrapped in a container so we can show/hide it inside the webview
  return `
    <div id="settingsPage" style="display:none">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        /* Ensure no outer padding/margins so sidebar is flush to the panel edge */
        html, body, #settingsPage { margin: 0 !important; padding: 0 !important; }
        .sidebar { width: 200px; border-right: none; display: flex; flex-direction: column; overflow-y: auto; transition: width 0.3s ease; background-color: transparent; box-shadow: none; }
        .sidebar.collapsed { width: 50px; }
        .sidebar-item { position: relative; padding: 12px 16px 12px 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #cccccc; transition: background-color 0.2s; }
        .sidebar-item:hover { background-color: #2a2d2e; }
        .sidebar-item.active { background-color: #094771; }
        /* Remove accent bar so active background starts at absolute left */
        .sidebar-item::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: transparent; }
        .sidebar-item-icon { font-size: 16px; flex-shrink: 0; }
        .sidebar-item-icon svg { width: 16px; height: 16px; fill: currentColor; display: block; }
        .sidebar-item-text { overflow: hidden; text-overflow: ellipsis; transition: opacity 0.2s; }
        .sidebar.collapsed .sidebar-item { padding: 12px; justify-content: center; }
        .sidebar.collapsed .sidebar-item-text { opacity: 0; width: 0; }
        .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; background-color: transparent; border-left: none; padding-left: 0; }
        .settings-frame { display: flex; height: 100vh; min-height: 100vh; gap: 0; background-color: transparent; }
        .sidebar, .settings-frame { margin: 0; padding: 0; }
        .sidebar { height: 100%; align-self: stretch; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0; padding: 12px 16px; border-bottom: 1px solid #333; flex-wrap: nowrap; column-gap: 12px; }
        .header h1 { font-size: 24px; font-weight: 400; color: #cccccc; margin: 0; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
{{ ... }}
        .header-buttons .btn { white-space: nowrap; }
        .btn { padding: 8px 16px; border: none; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn.btn-save { background-color: #0e639c; color: white; }
        .btn.btn-done { background-color: #3c3c3c; color: #cccccc; }
        .section { margin-bottom: 30px; }
        /* Ensure content aligns with subheader padding */
        .content-body { padding: 0 12px; }
        .settings-container { padding: 0 8px 16px 12px; }
        .section-title { font-size: 13px; color: #cccccc; margin-bottom: 8px; font-weight: 600; }
        .section-description { font-size: 12px; color: #888; margin-bottom: 15px; }
        /* Make content section headings bold (e.g., General Settings h2) */
        .settings-container h2, .content-body h2 { font-weight: 600 !important; }
        .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
        .profile-row select { flex: 1; }
        .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
        .icon-btn { background: none; border: none; color: #cccccc; cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
        .checkbox-group { display: flex; align-items: center; margin-bottom: 12px; }
        .checkbox-group input[type="checkbox"] { width: auto; margin-right: 10px; cursor: pointer; }
        .info-text { font-size: 12px; color: #888; margin-top: 5px; }
        .info-box { background-color: #252526; padding: 15px; border-radius: 4px; margin-top: 15px; font-size: 12px; line-height: 1.6; color: #cccccc; }
        select, input[type="text"], input[type="password"] { width: 100%; padding: 8px 12px; background-color: #3c3c3c; border: 1px solid #3c3c3c; color: #cccccc; border-radius: 3px; font-size: 13px; outline: none; }
        /* Neutral focus for Settings fields: no colored outline/border */
        select:focus, select:focus-visible,
        input[type="text"]:focus, input[type="text"]:focus-visible,
        input[type="password"]:focus, input[type="password"]:focus-visible {
          outline: none;
          border-color: #3c3c3c;
          box-shadow: none;
          background-color: #3c3c3c;
        }
        /* focus style intentionally neutralized via rules above */

        /* Subheading for active section (text only) */
        .subheader { display: flex; align-items: center; height: 32px; padding: 0 12px; color: #cccccc; background-color: #1f1f1f; margin-bottom: 5px; }
        .subheader .subheader-text { font-size: 13px; font-weight: 500; }

        /* Responsive tweaks */
        @media (max-width: 768px) {
          .sidebar { width: 50px; }
          .sidebar-item { padding: 12px; justify-content: center; }
          .sidebar-item-text { opacity: 0; width: 0; }
        }
        @media (max-width: 600px) {
          .settings-container { padding: 20px 16px; }
          .header { flex-direction: row; align-items: center; }
        }
      </style>
      <div class="header">
        <h1>Settings</h1>
        <div class="header-buttons">
          <button class="btn btn-save" id="settingsSaveBtn">Save</button>
          <button class="btn btn-done" id="settingsDoneBtn">Done</button>
        </div>
      </div>
      <div class="settings-frame">
        <div class="sidebar" id="sidebar">
          <div class="sidebar-item active" onclick="showSection('providers')">
            <span class="sidebar-item-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 7V3H9V7H15V3H17V7H18C19.66 7 21 8.34 21 10V12C21 13.66 19.66 15 18 15H13V20C13 21.1 12.1 22 11 22C9.9 22 9 21.1 9 20V15H6C4.34 15 3 13.66 3 12V10C3 8.34 4.34 7 6 7H7ZM6 9C5.45 9 5 9.45 5 10V12C5 12.55 5.45 13 6 13H18C18.55 13 19 12.55 19 12V10C19 9.45 18.55 9 18 9H6Z"/>
              </svg>
            </span>
            <span class="sidebar-item-text">Providers</span>
          </div>
          <div class="sidebar-item" onclick="showSection('general')">
            <span class="sidebar-item-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.14 12.94C19.19 12.64 19.22 12.33 19.22 12C19.22 11.67 19.19 11.36 19.14 11.06L21.19 9.47C21.36 9.34 21.41 9.1 21.32 8.9L19.32 5.1C19.22 4.9 19 4.82 18.81 4.89L16.43 5.84C16 5.5 15.53 5.22 15.03 5.01L14.66 2.5C14.63 2.28 14.44 2.12 14.22 2.12H9.78C9.56 2.12 9.37 2.28 9.34 2.5L8.97 5.01C8.47 5.22 7.99 5.5 7.57 5.84L5.19 4.89C5 4.81 4.77 4.9 4.68 5.1L2.68 8.9C2.58 9.1 2.64 9.34 2.81 9.47L4.86 11.06C4.81 11.36 4.78 11.67 4.78 12C4.78 12.33 4.81 12.64 4.86 12.94L2.81 14.53C2.64 14.66 2.59 14.9 2.68 15.1L4.68 18.9C4.78 19.1 5 19.18 5.19 19.11L7.57 18.16C8 18.5 8.47 18.78 8.97 18.99L9.34 21.5C9.37 21.72 9.56 21.88 9.78 21.88H14.22C14.44 21.88 14.63 21.72 14.66 21.5L15.03 18.99C15.53 18.78 16 18.5 16.43 18.16L18.81 19.11C19 19.19 19.23 19.1 19.32 18.9L21.32 15.1C21.41 14.9 21.36 14.66 21.19 14.53L19.14 12.94ZM12 15.5C10.07 15.5 8.5 13.93 8.5 12C8.5 10.07 10.07 8.5 12 8.5C13.93 8.5 15.5 10.07 15.5 12C15.5 13.93 13.93 15.5 12 15.5Z"/>
              </svg>
            </span>
            <span class="sidebar-item-text">General</span>
          </div>
        </div>
        <div class="main-content" id="providersSection">
          <div class="subheader"><span class="subheader-text">Providers</span></div>
          <div class="content-body">

            <div class="section">
              <div class="section-title">API Provider </div>
              <select id="provider">
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google (Gemini)</option>
                <option value="azure">Azure OpenAI</option>
                <option value="cohere">Cohere</option>
                <option value="huggingface">HuggingFace</option>
                <option value="mistral">Mistral AI</option>
              </select>
            </div>

            <div class="section">
              <div class="section-title" id="apiKeyLabel">OpenRouter API Key</div>
              <input type="password" id="apiKey" />
              <div class="info-text">API keys are stored securely in VSCode's Secret Storage</div>
            </div>

            <div class="section"><div class="checkbox-group"><input type="checkbox" id="customUrl" /><label for="customUrl">Use custom base URL</label></div></div>
            <div class="section" id="customUrlField" style="display:none;">
              <div class="section-title">Custom Base URL</div>
              <input type="text" id="baseUrl" placeholder="https://api.example.com/v1" />
              <div class="info-text">Custom base URL</div>
            </div>

            <div class="section">
              <div class="section-title">Model</div>
              <select id="model"></select>
              <div class="error-message" id="errorMessage" style="display: none;">✕ The model ID you provided is not available. Please choose a different model.</div>
              
            </div>
          </div>

          <div class="settings-container" id="generalSection" style="display:none;">
            <div class="subheader"><span class="subheader-text">General</span></div>
            <div class="section">
              <h2 style="font-size: 18px; font-weight: 500; margin-bottom: 20px;">General Settings</h2>
              <p style="color: #888;">General configuration options will appear here.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}