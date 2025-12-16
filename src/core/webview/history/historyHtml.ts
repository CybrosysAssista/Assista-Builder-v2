export function getHistoryHtml(): string {
  // Hidden container to be shown by UI on demand
  return `
    <div id="historyPage" style="display:none">
      <style>
        /* Base */
        /* Pin History to the webview viewport to avoid any top gap from document scroll */
        #historyPage { position: fixed; inset: 0; height: 100vh; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); overflow: hidden; }
        .hx-container { display: flex; flex-direction: column; height: 100%; }
        /* Background dots - Removed */
        
        /* Header */
        .hx-header { 
            position: relative; 
            z-index: 10; 
            display: flex; 
            flex-direction: column; 
            align-items: flex-start; 
            padding: 16px 24px; 
            background: transparent; 
            /* border-bottom: 1px solid rgba(255,255,255,0.1); Removed border to match clean look */
        }

        /* Back Button */
        .hx-back-btn {
            display: flex;
            width: auto; /* User said 44.778px but auto is safer with text */
            align-items: center;
            gap: 8px; /* Increased gap slightly for better look */
            background: transparent;
            border: none;
            color: #CDCDCD;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            padding: 0;
            margin-bottom: 16px;
            transition: opacity 0.2s;
        }
        .hx-back-btn:hover { opacity: 0.8; }

        /* Title */
        .hx-title { 
            font-family: Ubuntu, sans-serif;
            font-size: 20px;
            font-style: normal;
            font-weight: 700;
            line-height: normal;
            background: linear-gradient(91deg, #E3B2B3 0%, #BC8487 99.58%);
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            color: #BC8487; /* Fallback */
            margin-bottom: 4px;
        }

        .hx-sub { font-size: 12px; color: var(--vscode-descriptionForeground); }

        /* Search */
        .hx-search { position: relative; z-index: 10; padding: 0 24px 12px; background: transparent; }
        .hx-search .wrap { position: relative; }
        .hx-input { position: relative; width: 100%; padding: 10px 16px 10px 16px; background: var(--vscode-input-background); color: inherit; border: 1px solid var(--vscode-input-border); border-radius: 8px; outline: none; font-size: 13px; font-weight: 500;}
        .hx-input:focus { border-color: var(--vscode-focusBorder); }
        .hx-search .icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: #9ca3af; pointer-events: none; }
        
        /* Filters */
        .hx-filters { position: relative; z-index: 20; display: flex; gap: 12px; padding: 0 24px 16px; background: transparent; }
        
        /* Custom Dropdown Styles */
        .hx-dd-wrap { position: relative; flex: 1; min-width: 0; }
        .hx-dd-btn { 
          width: 100%; 
          padding: 10px 12px; 
          background: var(--vscode-input-background); 
          color: var(--vscode-input-foreground); 
          border: 1px solid var(--vscode-input-border); 
          border-radius: 8px; 
          font-size: 13px; 
          text-align: left; 
          cursor: pointer; 
          display: flex; 
          justify-content: flex-start; 
          align-items: center;
          gap: 8px;
        }
        .hx-dd-btn:hover { }
        .hx-dd-btn:focus { outline: none; }
        .hx-dd-icon { opacity: 0.7; }
        
        .hx-dd-menu { 
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
          z-index: 100; 
          padding: 4px; 
        }
        .hx-dd-menu.show { display: block; }
        .hx-dd-item { padding: 6px 10px; font-size: 13px; cursor: pointer; border-radius: 4px; }
        .hx-dd-item:hover { background: var(--vscode-list-hoverBackground); }
        .hx-dd-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }

        /* List - Adjusted padding-right to 10px to widen cards */
        .hx-list { position: relative; z-index: 10; flex: 1; overflow-y: auto; padding: 0 10px 24px 24px; }
        
        /* Section Headers for time grouping */
        .hx-section-header {
          font-size: 13px;
          font-weight: 500;
          color: var(--vscode-foreground);
          padding: 16px 0 8px 0;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hx-section-header:first-child {
          margin-top: 0;
        }
        
        .hx-card-wrap { margin-bottom: 10px; }
        .hx-card { 
            background: rgba(255,255,255,0.04); 
            border: 1px solid rgba(255,255,255,0.08); 
            border-radius: 8px; 
            padding: 12px 16px 12px 8px;
            cursor: pointer;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .hx-card:hover { background: rgba(255,255,255,0.08); }
        
        .hx-card-content { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; position: relative; }
        .hx-dot { display: none; }
        .hx-main { flex: 1; min-width: 0; }
        .hx-msg { 
            font-size: 13px; 
            font-weight: 500; 
            color: var(--vscode-editor-foreground); 
            margin: 0 0 4px 0; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
        }
        .hx-meta { font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; align-items: center; gap: 6px; }
        
        .hx-arrow { 
            width: 20px; 
            height: 20px; 
            color: var(--vscode-descriptionForeground); 
            opacity: 0.5; 
            flex-shrink: 0;
            transition: transform .2s ease, color .2s ease; 
        }
        
        /* Actions (Copy/Delete) - Hidden by default, visible on hover */
        .hx-actions { 
            position: absolute;
            right: 40px;
            top: 50%;
            transform: translateY(-50%);
            display: flex; 
            gap: 6px; 
            opacity: 0; 
            pointer-events: none;
            transition: opacity 0.2s ease; 
            z-index: 10;
        }
        .hx-card:hover .hx-actions { 
            opacity: 1; 
            pointer-events: auto;
        }
        .hx-action { 
            padding: 6px; 
            background: transparent; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            color: var(--vscode-descriptionForeground); 
            display: inline-flex; 
            align-items: center; 
            justify-content: center; 
            transition: color 0.2s ease, background 0.2s ease;
        }
        .hx-action:hover { 
            color: var(--vscode-editor-foreground); 
            background: rgba(255,255,255,0.1); 
        }
        
        .empty-state { flex: 1; display: none; align-items: center; justify-content: center; color: var(--vscode-descriptionForeground); }

        /* Scrollbar */
        .hx-list::-webkit-scrollbar { width: 6px; }
        .hx-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        
        /* Clear All Button - Inline with section headers */
        .hx-clear-btn {
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s, color 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            margin-left: auto;
        }
        .hx-clear-btn:hover {
            background: rgba(255,255,255,0.1);
            color: var(--vscode-errorForeground);
        }

        /* Confirm Modal */
        .hx-confirm-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: none; align-items: center; justify-content: center; z-index: 9999; }
        .hx-confirm { width: 400px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
        .hx-confirm .hd { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid var(--vscode-widget-border); }
        .hx-confirm .bd { padding: 16px; font-size: 13px; }
        .hx-confirm .ft { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 16px; }
        .hx-btn { padding: 6px 12px; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; font-size: 12px; }
        .hx-btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
      </style>
      
      <div class="hx-container">
        <div class="hx-header">
          <button class="hx-back-btn" id="historyDoneBtn">
            <svg width="6" height="10" viewBox="0 0 6 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.10115 4.72761L5.7782 1.05057L4.72762 0L1.90735e-05 4.72761L4.72762 9.45516L5.7782 8.4046L2.10115 4.72761Z" fill="#CDCDCD"/>
            </svg>
            <span>Back</span>
          </button>
          


          <div>
            <div class="hx-title">Chat History</div>
            <div class="hx-sub">Your conversation timeline</div>
          </div>
        </div>

        <div class="hx-search">
          <div class="wrap">
            <div class="icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
            <input id="historySearch" class="hx-input" type="text" placeholder="Search your conversations..." />
          </div>
        </div>

        <div class="hx-filters">
          <!-- Workspace Dropdown -->
          <div class="hx-dd-wrap" id="ddWorkspace">
            <button class="hx-dd-btn" id="btnWorkspace">
              <svg class="hx-dd-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0.740556C0 0.331562 0.331562 0 0.740556 0H5.18389C5.5929 0 5.92444 0.331562 5.92444 0.740556V5.18389C5.92444 5.5929 5.5929 5.92444 5.18389 5.92444H0.740556C0.331562 5.92444 0 5.5929 0 5.18389V0.740556ZM0 8.14611C0 7.7371 0.331562 7.40556 0.740556 7.40556H5.18389C5.5929 7.40556 5.92444 7.7371 5.92444 8.14611V12.5894C5.92444 12.9985 5.5929 13.33 5.18389 13.33H0.740556C0.331562 13.33 0 12.9985 0 12.5894V8.14611ZM7.40556 0.740556C7.40556 0.331562 7.7371 0 8.14611 0H12.5894C12.9985 0 13.33 0.331562 13.33 0.740556V5.18389C13.33 5.5929 12.9985 5.92444 12.5894 5.92444H8.14611C7.7371 5.92444 7.40556 5.5929 7.40556 5.18389V0.740556ZM7.40556 8.14611C7.40556 7.7371 7.7371 7.40556 8.14611 7.40556H12.5894C12.9985 7.40556 13.33 7.7371 13.33 8.14611V12.5894C13.33 12.9985 12.9985 13.33 12.5894 13.33H8.14611C7.7371 13.33 7.40556 12.9985 7.40556 12.5894V8.14611ZM8.88667 1.48111V4.44333H11.8489V1.48111H8.88667ZM8.88667 8.88667V11.8489H11.8489V8.88667H8.88667ZM1.48111 1.48111V4.44333H4.44333V1.48111H1.48111ZM1.48111 8.88667V11.8489H4.44333V8.88667H1.48111Z" fill="#CDCDCD"/>
              </svg>
              <span class="label">All</span>
            </button>
            <div class="hx-dd-menu">
              <div class="hx-dd-item active" data-value="all">All</div>
              <div class="hx-dd-item" data-value="current">Current</div>
            </div>
          </div>
          
          <!-- Sort Dropdown -->
          <div class="hx-dd-wrap" id="ddSort">
            <button class="hx-dd-btn" id="btnSort">
              <svg class="hx-dd-icon" width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.33 0V9.40941H15.6824L12.5459 13.33L9.40941 9.40941H11.7618V0H13.33ZM7.05706 10.9776V12.5459H0V10.9776H7.05706ZM8.62529 5.48882V7.05706H0V5.48882H8.62529ZM8.62529 0V1.56824H0V0H8.62529Z" fill="#CDCDCD"/>
              </svg>
              <span class="label">Most Recent</span>
            </button>
            <div class="hx-dd-menu">
              <div class="hx-dd-item active" data-value="recent">Most Recent</div>
              <div class="hx-dd-item" data-value="oldest">Oldest First</div>
              <div class="hx-dd-item" data-value="tokens">Most Tokens</div>
            </div>
          </div>
        </div>

        <div class="hx-list" id="historyList"></div>
        <div class="empty-state" id="historyEmpty">No conversations yet</div>
      </div>

      <!-- Confirmation Modal -->
      <div id="historyConfirmOverlay" class="hx-confirm-overlay">
        <div class="hx-confirm">
          <div class="hd" id="hxConfirmTitle">Delete Conversation</div>
          <div class="bd" id="hxConfirmDesc">Are you sure you want to delete this conversation?</div>
          <div class="ft">
            <button id="hxConfirmCancel" class="hx-btn" type="button">Cancel</button>
            <button id="hxConfirmDelete" class="hx-btn primary" type="button">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
