export function getSettingsModalHtml(): string {
  // Wrapped in a container so we can show/hide it inside the webview
  return `
    <div id="settingsPage" style="display:none">
      <div class="settings-container">
        <div class="header">
          <h1>Settings</h1>
          <div class="header-buttons">
            <button class="btn btn-save" id="settingsSaveBtn">Save</button>
            <button class="btn btn-done" id="settingsDoneBtn">Done</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Configuration Profile</div>
          <div class="profile-row">
            <select id="profile">
              <option value="default">default</option>
            </select>
            <div class="inline-buttons">
              <button class="icon-btn">+</button>
              <button class="icon-btn">✎</button>
              <button class="icon-btn">🗑</button>
            </div>
          </div>
          <div class="section-description">
            Save different API configurations to quickly switch between providers and settings.
          </div>
        </div>

        <div class="section">
          <div class="section-title">
            API Provider
            <a href="#" class="link" id="docLink">OpenRouter documentation</a>
          </div>
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

        <div class="section">
          <div class="checkbox-group">
            <input type="checkbox" id="customUrl" />
            <label for="customUrl">Use custom base URL</label>
          </div>
        </div>

        <div class="section">
          <div class="checkbox-group">
            <input type="checkbox" id="compress" checked />
            <label for="compress">Compress prompts and message chains to the context size (OpenRouter Transforms)</label>
          </div>
        </div>

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

        <div class="section">
          <div class="checkbox-group">
            <input type="checkbox" id="reasoning" />
            <label for="reasoning">Enable reasoning</label>
          </div>
        </div>

        <div class="expandable">
          <span class="arrow">▶</span>
          <span>Advanced settings</span>
        </div>
      </div>
    </div>
  `;
}
