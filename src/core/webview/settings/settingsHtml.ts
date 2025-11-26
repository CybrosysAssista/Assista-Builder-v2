export function getSettingsModalHtml(): string {
  // Wrapped in a container so we can show/hide it inside the webview
  return `
    <div id="settingsPage" style="display:none">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Ubuntu', sans-serif; }
        /* Ensure no outer padding/margins so sidebar is flush to the panel edge */
        html, body, #settingsPage { margin: 0 !important; padding: 0 !important; font-family: 'Ubuntu', sans-serif; }
        .sidebar { width: 48px; border-right: 0.5px solid #2A2A2A; display: flex; flex-direction: column; overflow-y: auto; transition: width 0.3s ease; background-color: transparent; box-shadow: none; align-items: center; padding-top: 10px; }
        .sidebar.collapsed { width: 50px; }
        .sidebar-item { 
          display: flex;
          width: 30px;
          height: 30px;
          padding: 7px;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          border-radius: 7px;
          cursor: pointer;
          color: #CDCDCD;
          transition: background-color 0.2s;
          margin-bottom: 8px;
        }
        .sidebar-item:hover { background-color: #2a2d2e; }
        .sidebar-item.active { 
          border-radius: 7px;
          border: 0.5px solid rgba(188, 132, 135, 0.50);
          background: rgba(188, 132, 135, 0.05);
        }
        /* Remove accent bar so active background starts at absolute left */
        .sidebar-item::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: transparent; }
        .sidebar-item-icon { font-size: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .sidebar-item-icon svg { width: 16px; height: 16px; fill: currentColor; display: block; }
        .sidebar-item-text { display: none; }
        .sidebar.collapsed .sidebar-item { padding: 12px; justify-content: center; }
        .sidebar.collapsed .sidebar-item-text { opacity: 0; width: 0; }
        .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; background-color: transparent; border-left: none; padding-left: 0; }
        .settings-frame { display: flex; height: 100vh; min-height: 100vh; gap: 0; background-color: transparent; }
        .sidebar, .settings-frame { margin: 0; padding: 0; }
        .sidebar { height: 100%; align-self: stretch; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0; padding: 12px 24px; border-bottom: none; flex-wrap: nowrap; column-gap: 12px; }
        .header-buttons { display: flex; gap: 10px; }
        .btn { padding: 8px 16px; border: none; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn.btn-save { background-color: #0e639c; color: white; }
        .btn.btn-done { background-color: #3c3c3c; color: #cccccc; }
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
          background: rgba(188, 132, 135, 0.05);
          color: #CDCDCD;
          padding: 6px 12px;
          white-space: nowrap;
          cursor: pointer;
          font-size: 13px;
          flex-shrink: 0;
        }
        .btn.btn-get-api:hover { background: rgba(188, 132, 135, 0.1); }
        .api-key-row { display: flex; gap: 10px; align-items: center; }
        .api-key-row input[type="password"] { flex: 1; }
        .section { margin-bottom: 16px; }
        /* Ensure content aligns with subheader padding */
        .content-body { display: flex; padding: 24px; flex-direction: column; align-items: stretch; gap: 16px; flex: 1 0 0; align-self: stretch; min-height: calc(100vh - 120px); }
        .settings-container { margin: 0; padding: 24px; flex-direction: column; align-items: stretch; gap: 16px; flex: 1 0 0; align-self: stretch; }
        .section-title { font-family: 'Ubuntu', sans-serif; font-size: 13px; color: #CDCDCD; margin-bottom: 8px; font-weight: 400; font-style: normal; line-height: normal; flex: 1 0 0; }
        .section-description { font-family: 'Ubuntu', sans-serif; font-size: 12px; color: #CDCDCD; margin-bottom: 15px; font-weight: 400; font-style: normal; line-height: normal; }
        /* Make content section headings bold with gradient (e.g., General Settings h2) */
        .settings-container h2, .content-body h2 { font-family: 'Ubuntu', sans-serif; font-size: 20px; font-style: normal; font-weight: 700; line-height: normal; background: linear-gradient(91deg, #E3B2B3 0%, #BC8487 99.58%); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
        .profile-row select { flex: 1; }
        .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
        .icon-btn { background: none; border: none; color: #cccccc; cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
        .checkbox-group { display: flex; align-items: center; margin-bottom: 12px; }
        .checkbox-group input[type="checkbox"] { width: auto; margin-right: 10px; cursor: pointer; }
        .checkbox-group label { font-size: 13px; }
        .info-text { font-family: 'Ubuntu', sans-serif; font-size: 12px; color: #CDCDCD; margin-top: 5px; font-weight: 400; font-style: normal; line-height: normal; }
        .info-box { background-color: #252526; padding: 15px; border-radius: 4px; margin-top: 15px; font-family: 'Ubuntu', sans-serif; font-size: 12px; line-height: 1.6; color: #CDCDCD; font-weight: 400; }
        select, input[type="text"], input[type="password"] { 
          display: flex;
          width: 100%; 
          height: 28px;
          padding: 0 10px; 
          justify-content: space-between;
          align-items: center;
          align-self: stretch;
          background-color: #1F1F1F; 
          border: 0.5px solid #2A2A2A; 
          color: #CDCDCD; 
          border-radius: 8px; 
          font-family: 'Ubuntu', sans-serif; 
          font-size: 13px; 
          font-weight: 400; 
          box-sizing: border-box; 
          outline: none; 
        }
        /* Neutral focus for Settings fields: no colored outline/border */
        select:focus, select:focus-visible,
        input[type="text"]:focus, input[type="text"]:focus-visible,
        input[type="password"]:focus, input[type="password"]:focus-visible {
          outline: none;
          border-color: #2A2A2A;
          box-shadow: none;
          background-color: #1F1F1F;
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
          background-color: #2d2d2d;
          border: 1px solid #3c3c3c;
          border-radius: 3px;
          margin-top: 4px;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .model-dropdown-item {
          padding: 8px 12px;
          cursor: pointer;
          font-size: 13px;
          color: #cccccc;
          transition: background-color 0.15s;
        }
        .model-dropdown-item:hover {
          background-color: #3c3c3c;
        }
        .model-dropdown-item.selected {
          background-color: #094771;
        }
        .model-dropdown-empty {
          padding: 12px;
          text-align: center;
          color: #888;
          font-size: 12px;
        }

        /* Subheading for active section (text only) */
        .subheader { display: flex; align-items: center; height: 32px; padding: 0 12px; color: #cccccc; background-color: #1f1f1f; margin-bottom: 5px; }
        .subheader .subheader-text { font-size: 14px; font-weight: 500; }

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

        /* Confirm overlay (Unsaved Changes) */
        .stx-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: none; align-items: center; justify-content: center; z-index: 99999; }
        .stx-confirm { width: 520px; max-width: calc(100% - 24px); background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: #e5e7eb; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
        .stx-confirm .hd { padding: 16px 20px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; gap: 8px; align-items: center; }
        .stx-confirm .bd { padding: 16px 20px; color: #cbd5e1; }
        .stx-confirm .ft { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08); }
        .stx-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e5e7eb; cursor: pointer; }
        .stx-btn:hover { background: rgba(255,255,255,0.1); }
        .stx-btn.primary { background: #0e639c; border-color: #0b4f7a; color: #fff; }
        
        /* Back button styling */
        /* Back button styling matching history page */
        .back-btn {
            display: flex;
            width: auto;
            align-items: center;
            gap: 8px;
            background: transparent;
            border: none;
            color: #CDCDCD;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            padding: 0;
            transition: opacity 0.2s;
        }
        .back-btn:hover { opacity: 0.8; }
        .back-btn svg { fill: #CDCDCD; }
        
        /* Settings title section */
        .settings-title-section { padding: 0 24px; margin-bottom: 16px; }
        .settings-title-section h1 { 
          font-family: 'Ubuntu', sans-serif; 
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
        .settings-subtitle { font-family: 'Ubuntu', sans-serif; font-size: 13px; color: #CDCDCD; margin: 0; font-weight: 400; font-style: normal; line-height: normal; }
        
        /* Profile & Usage Styles */
        .profile-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding: 0 4px; max-width: 800px; }
        .avatar { width: 48px; height: 48px; border-radius: 50%; border: 1px solid #3C3C3C; display: flex; align-items: center; justify-content: center; background: #1A1A1A; flex-shrink: 0; }
        .user-info { flex: 1; }
        .user-name { font-size: 15px; font-weight: 500; color: #E0E0E0; margin-bottom: 4px; }
        .user-email { font-size: 13px; color: #9D9D9D; margin-bottom: 2px; }
        .user-meta { font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; }
        .logout-btn { background: #252526; border: 1px solid #3C3C3C; color: #CCCCCC; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .usage-card { border: 1px solid #3C3C3C; border-radius: 12px; padding: 16px; background: #1A1A1A; margin-top: 20px; max-width: 800px; }
        .usage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 14px; color: #E0E0E0; }
        .usage-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #666; }
        .badge { background: #252526; padding: 2px 6px; border-radius: 4px; border: 1px solid #333; font-size: 11px; color: #CCC; }
        .usage-stats { margin-bottom: 16px; }
        .usage-label { display: flex; justify-content: space-between; font-size: 12px; color: #9D9D9D; margin-bottom: 8px; }
        .progress-bar { height: 8px; background: #2A2A2A; border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #E3B2B3 0%, #BC8487 100%); border-radius: 4px; }
        .upgrade-btn { width: 100%; padding: 10px; background: transparent; border: 1px solid #BC8487; color: #E0E0E0; border-radius: 8px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
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
      <div class="settings-frame">
        <div class="sidebar" id="sidebar">
          <div class="sidebar-item active" onclick="showSection('providers')">
            <span class="sidebar-item-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clip-path="url(#clip0_90_121)">
                  <path d="M4.66667 3.33332C4.66667 1.86056 5.86057 0.666656 7.33333 0.666656C8.80607 0.666656 10 1.86056 10 3.33332H13.3333C13.7015 3.33332 14 3.6318 14 3.99999V6.78046C14 6.99686 13.8949 7.19979 13.7183 7.32479C13.5415 7.44972 13.3152 7.48112 13.1112 7.40899C12.973 7.36019 12.8237 7.33332 12.6667 7.33332C11.9303 7.33332 11.3333 7.93026 11.3333 8.66666C11.3333 9.40306 11.9303 9.99999 12.6667 9.99999C12.8237 9.99999 12.973 9.97312 13.1112 9.92432C13.3152 9.85219 13.5415 9.88359 13.7183 10.0085C13.8949 10.1335 14 10.3365 14 10.5529V13.3333C14 13.7015 13.7015 14 13.3333 14H2.66667C2.29848 14 2 13.7015 2 13.3333V3.99999C2 3.6318 2.29848 3.33332 2.66667 3.33332H4.66667ZM7.33333 1.99999C6.59695 1.99999 6 2.59694 6 3.33332C6 3.49035 6.02687 3.63967 6.0757 3.77782C6.14781 3.98187 6.11641 4.20822 5.99145 4.38492C5.86649 4.56161 5.66355 4.66666 5.44714 4.66666H3.33333V12.6667H12.6667V11.3333C11.1939 11.3333 10 10.1394 10 8.66666C10 7.19392 11.1939 5.99999 12.6667 5.99999V4.66666H9.21953C9.00313 4.66666 8.8002 4.56161 8.6752 4.38492C8.55027 4.20822 8.51887 3.98187 8.591 3.77782C8.6398 3.63967 8.66667 3.49036 8.66667 3.33332C8.66667 2.59694 8.06973 1.99999 7.33333 1.99999Z" fill="#CDCDCD"/>
                  </g>
                  <defs>
                  <clipPath id="clip0_90_121">
                  <rect width="16" height="16" fill="white"/>
                  </clipPath>
                  </defs>
                </svg>
            </span>
            <span class="sidebar-item-text">Providers</span>
          </div>
          <div class="sidebar-item" onclick="showSection('general')">
            <span class="sidebar-item-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.33329 13.3333H12.6666V14.6667H3.33329V13.3333ZM7.99996 12C5.05444 12 2.66663 9.61221 2.66663 6.66668C2.66663 3.72116 5.05444 1.33334 7.99996 1.33334C10.9455 1.33334 13.3333 3.72116 13.3333 6.66668C13.3333 9.61221 10.9455 12 7.99996 12ZM7.99996 10.6667C10.2091 10.6667 12 8.87581 12 6.66668C12 4.45754 10.2091 2.66668 7.99996 2.66668C5.79082 2.66668 3.99996 4.45754 3.99996 6.66668C3.99996 8.87581 5.79082 10.6667 7.99996 10.6667Z" fill="#CDCDCD"/>
              </svg>
            </span>
            <span class="sidebar-item-text">General</span>
          </div>
        </div>
        <div class="main-content">
          <div id="providersSection">
          <div class="subheader"><span class="subheader-text">Providers</span></div>
          <div class="content-body">

            <div class="section">
              <div class="section-title">API Provider </div>
              <select id="provider">
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google (Gemini)</option>
              </select>
            </div>

            <div class="section">
              <div class="section-title" id="apiKeyLabel">OpenRouter API Key</div>
              <div class="api-key-row">
                <input type="password" id="apiKey"  />
                <button class="btn btn-get-api" id="getApiKeyBtn">Get OpenRouter API</button>
              </div>
            </div>

            <div class="section"><div class="checkbox-group"><input type="checkbox" id="customUrl" /><label for="customUrl">Use custom base URL</label></div></div>
            <div class="section" id="customUrlField" style="display:none;">
              <div class="section-title">Custom Base URL</div>
              <input type="text" id="baseUrl" placeholder="https://api.example.com/v1" />
              <div class="info-text">Custom base URL</div>
            </div>

            <div class="section">
              <div class="section-title">Model</div>
              <div style="position: relative;">
                <input type="text" id="model"  autocomplete="off" />
                <div id="modelDropdownList" class="model-dropdown-list" style="display: none;">
                  <!-- Model items will be populated here by JavaScript -->
                </div>
              </div>
              <div class="error-message" id="errorMessage" style="display: none;">✕ The model ID you provided is not available. Please choose a different model.</div>
              
            </div>
          </div>

          </div>
          <div id="generalSection" style="display:none;">
            <div class="subheader"><span class="subheader-text">Profile</span></div>
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
                    <div class="user-name">John Doe</div>
                    <div class="user-email">johndoe@gmail.com</div>
                    <div class="user-meta">Signed in with Google | User ID <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></div>
                </div>
                <button class="logout-btn">Logout</button>
            </div>

            <div class="usage-card">
                <div class="usage-header">
                    <span>Estimated Usage</span>
                    <div class="usage-meta">
                        <span>Resets on 12/11</span>
                        <span class="badge">GPT-5</span>
                    </div>
                </div>
                <div class="usage-stats">
                    <div class="usage-label">
                        <span>Credits</span>
                        <span>254 / 300 Responses</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 85%;"></div>
                    </div>
                </div>
                <button class="upgrade-btn">Upgrade Plan</button>
            </div>
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