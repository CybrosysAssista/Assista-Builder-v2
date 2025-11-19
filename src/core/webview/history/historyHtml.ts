export function getHistoryHtml(): string {
  // Hidden container to be shown by UI on demand
  return `
    <div id="historyPage" style="display:none">
      <style>
        /* Base */
        /* Pin History to the webview viewport to avoid any top gap from document scroll */
        #historyPage { position: fixed; inset: 0; height: 100vh; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); overflow: hidden; }
        .hx-container { display: flex; flex-direction: column; height: 100%; }
        /* Background dots */
        .hx-bg { position: fixed; inset: 0; opacity: 0.04; pointer-events: none; }
        .hx-bg .pattern { position: absolute; inset: 0; background-image: radial-gradient(circle at 2px 2px, #fff 1px, transparent 0); background-size: 46px 46px; }
        /* Header */
        .hx-header { position: relative; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: transparent; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .hx-header-left { display: flex; align-items: center; gap: 16px; }
        .hx-icon-wrap { position: relative; }
        .hx-icon-wrap .glow { position: absolute; inset: 0; background: rgba(255,255,255,0.2); filter: blur(24px); border-radius: 12px; }
        .hx-icon { position: relative; padding: 10px; background: rgba(255,255,255,0.08); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); }
        .hx-title { font-size: 18px; font-weight: 700; color: var(--vscode-editor-foreground); letter-spacing: 0.2px; }
        .hx-sub { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
        .hx-done { padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-radius: 12px; border: none; cursor: pointer; transition: transform .15s ease, filter .15s ease; box-shadow: 0 8px 18px rgba(0,0,0,0.18); }
        .hx-done:hover { filter: brightness(1.1); transform: scale(1.02); }
        .hx-done:active { transform: scale(0.98); }
        /* Search */
        .hx-search { position: relative; z-index: 10; padding: 20px 24px 12px; background: transparent; border-bottom: 1px solid rgba(49, 78, 117, 0.06); }
        .hx-search .wrap { position: relative; }
        /* soft glowing background layer */
        .hx-search .back { position: absolute; inset: 0; background: rgba(255,255,255,0.05); border-radius: 14px; filter: blur(20px); transition: background .3s ease, filter .3s ease; }
        .hx-search .wrap:hover .back { background: rgba(255,255,255,0.10); filter: blur(24px); }
        .hx-input { position: relative; width: 100%; padding: 14px 16px 14px 48px; background: var(--vscode-input-background); color: inherit; border: 1px solid var(--vscode-input-border); border-radius: 14px; outline: none; font-size: 13px; }
        /* Neutral focus for search: no glow/border change */
        .hx-input:focus,
        .hx-input:focus-visible { outline: none; box-shadow: none; border-color: var(--vscode-focusBorder); background: var(--vscode-input-background); }
        .hx-input::placeholder { color: var(--vscode-input-placeholderForeground); }
        .hx-search .icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: #9ca3af; transition: color .25s ease; z-index: 10; opacity: 0.9; }
        .hx-search .wrap:hover .icon { color: #d1d5db; opacity: 1; }
        /* Filters */
        .hx-filters { position: relative; z-index: 20; display: flex; gap: 12px; padding: 0 24px 16px; background: transparent; }
        
        /* Custom Dropdown Styles */
        .hx-dd-wrap { position: relative; flex: 1; min-width: 0; }
        .hx-dd-btn { 
          width: 100%; 
          padding: 12px 14px; 
          background: var(--vscode-input-background); 
          color: var(--vscode-input-foreground); 
          border: 1px solid var(--vscode-input-border); 
          border-radius: 14px; 
          font-size: 13px; 
          text-align: left; 
          cursor: pointer; 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          transition: all 0.2s ease;
        }
        .hx-dd-btn:hover { border-color: var(--vscode-focusBorder); }
        .hx-dd-btn:active { transform: scale(0.99); }
        .hx-dd-icon { opacity: 0.5; transform: rotate(0deg); transition: transform 0.2s ease; }
        .hx-dd-wrap.open .hx-dd-icon { transform: rotate(180deg); }
        
        .hx-dd-menu { 
          position: absolute; 
          top: calc(100% + 6px); 
          left: 0; 
          width: 100%; 
          background: var(--vscode-dropdown-background); 
          border: 1px solid var(--vscode-dropdown-border); 
          color: var(--vscode-dropdown-foreground);
          border-radius: 12px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.25); 
          display: none; 
          z-index: 100; 
          overflow: hidden; 
          padding: 4px; 
        }
        .hx-dd-menu.show { display: block; animation: fadeIn 0.1s ease; }
        
        .hx-dd-item { 
          padding: 8px 12px; 
          color: inherit; 
          font-size: 13px; 
          cursor: pointer; 
          border-radius: 8px; 
          transition: background 0.1s; 
        }
        .hx-dd-item:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-list-hoverForeground); }
        .hx-dd-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); font-weight: 500; }

        /* List */
        .hx-list { position: relative; z-index: 10; flex: 1; overflow-y: auto; padding: 16px 24px 24px; }
        .hx-card-wrap { position: relative; margin: 12px 0; }
        .hx-card { position: relative; z-index: 1; background: rgba(255,255,255,0.06); border-radius: 18px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.25); transition: border-color .2s ease, background .2s ease; }
        .hx-card:hover { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.07); }
        .hx-card-content { padding: 20px; display: flex; gap: 16px; }
        .hx-dot { margin-top: 6px; width: 6px; height: 6px; background: rgba(255,255,255,0.4); border-radius: 9999px; transition: all .2s ease; flex-shrink: 0; }
        .hx-card:hover .hx-dot { background: #fff; transform: scale(1.4); }
        .hx-main { flex: 1; min-width: 0; }
        .hx-msg { color: rgba(255,255,255,0.9); font-weight: 500; font-size: 13px; margin: 0 0 10px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hx-actions { position: relative; z-index: 3; display: flex; gap: 8px; opacity: 0; transform: translateX(6px); transition: opacity .2s ease, transform .2s ease; pointer-events: auto; }
        .hx-card:hover .hx-actions { opacity: 1; transform: translateX(0); }
        .hx-action { position: relative; z-index: 4; padding: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; cursor: pointer; color: #cbd5e1; display: inline-flex; align-items: center; justify-content: center; pointer-events: auto; }
        .hx-action:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .hx-meta { display: flex; gap: 20px; font-size: 12px; color: #9ca3af; }
        .hx-arrow { width: 20px; height: 20px; color: rgba(255,255,255,0.45); margin-top: 4px; transition: transform .2s ease, color .2s ease; flex-shrink: 0; }
        .hx-card:hover .hx-arrow { color: rgba(255,255,255,0.7); transform: translateX(5px); }
        .hx-bottomline { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent); }
        .hx-glow { position: absolute; inset: -4px; background: rgba(255,255,255,0.05); border-radius: 18px; filter: blur(12px); pointer-events: none; z-index: 0; }
        .empty-state { height: calc(100vh - 180px); display: none; align-items: center; justify-content: center; color: #9ca3af; }
        /* Scrollbar */
        .hx-list::-webkit-scrollbar { width: 6px; }
        .hx-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .hx-list::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px) scale(0.95);} to { opacity: 1; transform: translateY(0) scale(1);} }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

        /* Confirm Modal */
        .hx-confirm-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.26); display: none; align-items: center; justify-content: center; z-index: 9999; }
        .hx-confirm { width: 520px; max-width: calc(100% - 24px); background:rgba(11, 11, 12, 0.42); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.16); color: #e5e7eb; }
        .hx-confirm .hd { padding: 16px 20px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .hx-confirm .bd { padding: 16px 20px; color: #cbd5e1; }
        .hx-confirm .ft { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08); }
        .hx-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e5e7eb; cursor: pointer; }
        .hx-btn:hover { background: rgba(255,255,255,0.1); }
        .hx-btn.primary { background: #2563eb; border-color: #1e40af; }
        .hx-btn.primary:hover { filter: brightness(0.95); }
      </style>
      <div class="hx-bg"><div class="pattern"></div></div>
      <div class="hx-container">
        <div class="hx-header">
          <div class="hx-header-left">
            
            <div>
              <div class="hx-title">Chat History</div>
              <div class="hx-sub">Your conversation timeline</div>
            </div>
          </div>
          <button class="hx-done" id="historyDoneBtn">Done</button>
        </div>

        <div class="hx-search">
          <div class="wrap">
            <div class="back"></div>
            <!-- Search icon -->
            <input id="historySearch" class="hx-input" type="text" placeholder="Search your conversations..." style="border-radius: 10px;" />
          </div>
        </div>

        <div class="hx-filters">
          <!-- Workspace Dropdown -->
          <div class="hx-dd-wrap" id="ddWorkspace">
            <button class="hx-dd-btn" id="btnWorkspace">
              <span class="label">Workspace: All</span>
              <svg class="hx-dd-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div class="hx-dd-menu">
              <div class="hx-dd-item active" data-value="all">Workspace: All</div>
              <div class="hx-dd-item" data-value="current">Workspace: Current</div>
            </div>
          </div>
          
          <!-- Sort Dropdown -->
          <div class="hx-dd-wrap" id="ddSort">
            <button class="hx-dd-btn" id="btnSort">
              <span class="label">Sort: Most Recent</span>
              <svg class="hx-dd-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div class="hx-dd-menu">
              <div class="hx-dd-item active" data-value="recent">Sort: Most Recent</div>
              <div class="hx-dd-item" data-value="oldest">Sort: Oldest First</div>
              <div class="hx-dd-item" data-value="tokens">Sort: Most Tokens</div>
            </div>
          </div>
        </div>

        <div class="hx-list" id="historyList"></div>
        <div class="empty-state" id="historyEmpty">No conversations yet</div>
      </div>

      <!-- Confirmation Modal -->
      <div id="historyConfirmOverlay" class="hx-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="hxConfirmTitle" aria-describedby="hxConfirmDesc">
        <div class="hx-confirm">
          <div class="hd" id="hxConfirmTitle">Delete Conversation</div>
          <div class="bd" id="hxConfirmDesc">Are you sure you want to delete this conversation? This action cannot be undone.</div>
          <div class="ft">
            <button id="hxConfirmCancel" class="hx-btn" type="button">Cancel</button>
            <button id="hxConfirmDelete" class="hx-btn primary" type="button">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
