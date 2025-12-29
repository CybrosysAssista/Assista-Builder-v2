export function getSettingsModalHtml(): string {
  // Wrapped in a container so we can show/hide it inside the webview
  return `
    <div id="settingsPage" style="display:none">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        /* Ensure no outer padding/margins so sidebar is flush to the panel edge */
        html, body, #settingsPage { margin: 0 !important; padding: 0 !important; }
        .sidebar { width: 48px; border-right: 0.5px solid var(--vscode-panel-border); display: flex; flex-direction: column; overflow-y: auto; transition: width 0.3s ease; background-color: transparent; box-shadow: none; align-items: center; padding-top: 10px; }
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
          color: var(--vscode-editor-foreground);
          transition: background-color 0.2s;
          margin-bottom: 8px;
        }
        .sidebar-item:hover { background-color: var(--vscode-list-hoverBackground); }
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
        .content-body { display: flex; padding: 24px; flex-direction: column; align-items: stretch; gap: 16px; flex: 1 0 0; align-self: stretch; min-height: calc(100vh - 120px); }
        .settings-container { margin: 0; padding: 24px; flex-direction: column; align-items: stretch; gap: 16px; flex: 1 0 0; align-self: stretch; }
        .section-title { font-size: 13px; color: var(--vscode-editor-foreground); margin-bottom: 8px; font-weight: 400; font-style: normal; line-height: normal; flex: 1 0 0; }
        .section-description { font-size: 12px; color: var(--vscode-editor-foreground); margin-bottom: 15px; font-weight: 400; font-style: normal; line-height: normal; }
        /* Make content section headings bold with gradient (e.g., General Settings h2) */
        .settings-container h2, .content-body h2 { font-size: 20px; font-style: normal; font-weight: 700; line-height: normal; background: linear-gradient(91deg, #E3B2B3 0%, #BC8487 99.58%); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
        .profile-row select { flex: 1; }
        .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
        .icon-btn { background: none; border: none; color: var(--vscode-editor-foreground); cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
        .checkbox-group { display: flex; align-items: center; margin-bottom: 12px; }
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
        .subheader { display: flex; align-items: center; height: 32px; padding: 0 12px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editorWidget-background); margin-bottom: 5px; }
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
          
          /* Usage Card Fixes for Narrow Widths */
          .usage-card {
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
        .settings-title-section { padding: 0 24px; margin-bottom: 16px; }
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
        .profile-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding: 0 4px; max-width: 800px; }
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
      <div class="settings-frame">
        <div class="sidebar" id="sidebar">
          <div class="sidebar-item active" onclick="showSection('general')">
            <span class="sidebar-item-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.33329 13.3333H12.6666V14.6667H3.33329V13.3333ZM7.99996 12C5.05444 12 2.66663 9.61221 2.66663 6.66668C2.66663 3.72116 5.05444 1.33334 7.99996 1.33334C10.9455 1.33334 13.3333 3.72116 13.3333 6.66668C13.3333 9.61221 10.9455 12 7.99996 12ZM7.99996 10.6667C10.2091 10.6667 12 8.87581 12 6.66668C12 4.45754 10.2091 2.66668 7.99996 2.66668C5.79082 2.66668 3.99996 4.45754 3.99996 6.66668C3.99996 8.87581 5.79082 10.6667 7.99996 10.6667Z" fill="#CDCDCD"/>
              </svg>
            </span>
            <span class="sidebar-item-text">Profile</span>
          </div>
          <div class="sidebar-item" onclick="showSection('providers')">
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
        </div>
        <div class="main-content">
          <div id="generalSection">
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
          <div id="providersSection" style="display:none;">
          <div class="subheader"><span class="subheader-text">Providers</span></div>
          <div class="content-body">

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
                  <div class="stx-dd-item" data-value="anthropic">Anthropic</div>
                  <div class="stx-dd-item" data-value="openai">OpenAI</div>
                  <div class="stx-dd-item" data-value="google">Google (Gemini)</div>
                </div>
              </div>
              <!-- Hidden select for compatibility -->
              <select id="provider" style="display:none;">
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google (Gemini)</option>
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
              <input type="text" id="baseUrl" placeholder="https://api.example.com/v1" />
              <div class="info-text">Custom base URL</div>
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