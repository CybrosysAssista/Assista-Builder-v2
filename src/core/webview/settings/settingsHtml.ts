export function getSettingsModalHtml(): string {
  // Wrapped in a container so we can show/hide it inside the webview
  return `
    <div id="settingsPage" style="display:none">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .sidebar { width: 200px; background-color: #252526; border-right: 1px solid #333; display: flex; flex-direction: column; overflow-y: auto; transition: width 0.3s ease; }
        .sidebar.collapsed { width: 50px; }
        .sidebar-item { position: relative; padding: 12px 20px 12px 24px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #cccccc; transition: background-color 0.2s; }
        .sidebar-item:hover { background-color: #2a2d2e; }
        .sidebar-item.active { background-color: #094771; }
        .sidebar-item::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; }
        .sidebar-item.active::before { background: #0e639c; }
        .sidebar-item-icon { font-size: 16px; flex-shrink: 0; }
        .sidebar-item-text { overflow: hidden; text-overflow: ellipsis; transition: opacity 0.2s; }
        .sidebar.collapsed .sidebar-item { padding: 12px; justify-content: center; }
        .sidebar.collapsed .sidebar-item-text { opacity: 0; width: 0; }
        .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; }
        .settings-frame { display: flex; height: 100vh; min-height: 100vh; gap: 12px; }
        .sidebar { height: 100%; align-self: stretch; }
        .settings-container { flex: 1; overflow-y: auto; padding: 20px 40px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 1px solid #333; }
        .header h1 { font-size: 24px; font-weight: 400; color: #cccccc; }
        .header-buttons { display: flex; gap: 10px; }
        .btn { padding: 8px 16px; border: none; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn.btn-save { background-color: #0e639c; color: white; }
        .btn.btn-done { background-color: #3c3c3c; color: #cccccc; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 13px; color: #cccccc; margin-bottom: 8px; font-weight: 400; }
        .section-description { font-size: 12px; color: #888; margin-bottom: 15px; }
        .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
        .profile-row select { flex: 1; }
        .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
        .icon-btn { background: none; border: none; color: #cccccc; cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
        .checkbox-group { display: flex; align-items: center; margin-bottom: 12px; }
        .checkbox-group input[type="checkbox"] { width: auto; margin-right: 10px; cursor: pointer; }
        .info-text { font-size: 12px; color: #888; margin-top: 5px; }
        .info-box { background-color: #252526; padding: 15px; border-radius: 4px; margin-top: 15px; font-size: 12px; line-height: 1.6; color: #cccccc; }
        select, input[type="text"], input[type="password"] { width: 100%; padding: 8px 12px; background-color: #3c3c3c; border: 1px solid #3c3c3c; color: #cccccc; border-radius: 3px; font-size: 13px; outline: none; }
        select:focus, input:focus { border-color: #007acc; }

        /* Responsive tweaks */
        @media (max-width: 768px) {
          .sidebar { width: 50px; }
          .sidebar-item { padding: 12px; justify-content: center; }
          .sidebar-item-text { opacity: 0; width: 0; }
        }
        @media (max-width: 600px) {
          .settings-container { padding: 20px 16px; }
          .header { flex-direction: column; align-items: flex-start; gap: 10px; }
        }
      </style>
      <div class="settings-frame">
        <div class="sidebar" id="sidebar">
          <div class="sidebar-item active" onclick="showSection('providers')">
            <span class="sidebar-item-icon">🔌</span>
            <span class="sidebar-item-text">Providers</span>
          </div>
          <div class="sidebar-item" onclick="showSection('general')">
            <span class="sidebar-item-icon">⚙️</span>
            <span class="sidebar-item-text">General</span>
          </div>
        </div>
        <div class="main-content">
          <div class="header">
            <h1>Settings</h1>
            <div class="header-buttons">
              <button class="btn btn-save" id="settingsSaveBtn">Save</button>
              <button class="btn btn-done" id="settingsDoneBtn">Done</button>
            </div>
          </div>

          <div class="settings-container" id="providersSection">
            <div class="section">
              <div class="section-title">Configuration Profile</div>
              <div class="profile-row">
                <select id="profile"><option value="default">default</option></select>
                <div class="inline-buttons">
                  <button class="icon-btn">+</button>
                  <button class="icon-btn">✎</button>
                  <button class="icon-btn">🗑</button>
                </div>
              </div>
              <div class="section-description">Save different API configurations to quickly switch between providers and settings.</div>
            </div>

            <div class="section">
              <div class="section-title">API Provider <a href="#" class="link" id="docLink">OpenRouter documentation</a></div>
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
              <input type="password" id="apiKey" placeholder="••••••••••••••••••••••••••••••••" />
              <div class="info-text">API keys are stored securely in VSCode's Secret Storage</div>
            </div>

            <div class="section"><div class="checkbox-group"><input type="checkbox" id="customUrl" /><label for="customUrl">Use custom base URL</label></div></div>
            <div class="section"><div class="checkbox-group"><input type="checkbox" id="compress" checked /><label for="compress">Compress prompts and message chains to the context size (OpenRouter Transforms)</label></div></div>

            <div class="section">
              <div class="section-title">Model</div>
              <select id="model"></select>
              <div class="error-message" id="errorMessage" style="display: none;">✕ The model ID you provided is not available. Please choose a different model.</div>
              <div class="info-box" id="modelInfo">
                <div id="modelDescription" style="margin-bottom: 10px;">Select a provider and model to see details.</div>
                <a href="#" class="link" id="modelMoreLink" style="display: none;">More</a>
                <div id="modelSpecs" style="margin-top: 15px; display: none;"></div>
              </div>
            </div>

            <div class="section"><div class="checkbox-group"><input type="checkbox" id="reasoning" /><label for="reasoning">Enable reasoning</label></div></div>
            <div class="expandable"><span class="arrow">▶</span><span>Advanced settings</span></div>
          </div>

          <div class="settings-container" id="generalSection" style="display:none;">
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
