export function getHistoryHtml(): string {
  // Hidden container to be shown by UI on demand
  return `
    <div id="historyPage" style="display:none">
      <style>
        /* Base */
        /* Pin History to the webview viewport to avoid any top gap from document scroll */
        #historyPage { position: fixed; inset: 0; height: 100vh; background: #000; color: #e5e7eb; overflow: hidden; }
        .hx-container { display: flex; flex-direction: column; height: 100%; }
        /* Background dots */
        .hx-bg { position: fixed; inset: 0; opacity: 0.04; pointer-events: none; }
        .hx-bg .pattern { position: absolute; inset: 0; background-image: radial-gradient(circle at 2px 2px, #fff 1px, transparent 0); background-size: 46px 46px; }
        /* Header */
        .hx-header { position: relative; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .hx-header-left { display: flex; align-items: center; gap: 16px; }
        .hx-icon-wrap { position: relative; }
        .hx-icon-wrap .glow { position: absolute; inset: 0; background: rgba(255,255,255,0.2); filter: blur(24px); border-radius: 12px; }
        .hx-icon { position: relative; padding: 10px; background: rgba(255,255,255,0.08); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); }
        .hx-title { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 0.2px; }
        .hx-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
        .hx-done { padding: 10px 16px; font-size: 13px; font-weight: 600; color: #000; background: #fff; border-radius: 12px; border: none; cursor: pointer; transition: transform .15s ease, filter .15s ease; box-shadow: 0 8px 18px rgba(255,255,255,0.18); }
        .hx-done:hover { filter: brightness(0.95); transform: scale(1.02); }
        .hx-done:active { transform: scale(0.98); }
        /* Search */
        .hx-search { position: relative; z-index: 10; padding: 20px 24px 12px; background: rgba(0,0,0,0.4); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(49, 78, 117, 0.06); }
        .hx-search .wrap { position: relative; }
        /* soft glowing background layer */
        .hx-search .back { position: absolute; inset: 0; background: rgba(255,255,255,0.05); border-radius: 28px; filter: blur(20px); transition: background .3s ease, filter .3s ease; }
        .hx-search .wrap:hover .back { background: rgba(255,255,255,0.10); filter: blur(24px); }
        .hx-input { position: relative; width: 100%; padding: 14px 16px 14px 48px; background: #0b0b0c; color: #e5e7eb; border: 1px solid rgba(255,255,255,0.08); border-radius: 28px; outline: none; font-size: 13px; transition: background .25s ease, border-color .25s ease, box-shadow .25s ease; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.25); }
        .hx-input:focus {  background: #0b0b0c; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 2px rgba(255,255,255,0.14), 0 8px 22px rgba(0,0,0,0.3); }
        .hx-input::placeholder { color:rgba(154, 160, 166, 0.2); }
        .hx-search .icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: #9ca3af; transition: color .25s ease; z-index: 10; opacity: 0.9; }
        .hx-search .wrap:hover .icon { color: #d1d5db; opacity: 1; }
        /* Filters */
        .hx-filters { position: relative; z-index: 10; display: flex; gap: 12px; padding: 0 24px 16px; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); }
        .hx-select { flex: 1; padding: 12px 14px; background: #0b0b0c; color: #fff; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; font-size: 13px; box-shadow: inset 0 0 0 0 rgba(251,191,36,0); appearance: none; -webkit-appearance: none; color-scheme: dark; }
        .hx-select:focus { outline: none; border-color: rgba(251,191,36,0.6); box-shadow: 0 0 0 2px rgba(251,191,36,0.4); background: #0f0f10; }
        /* Ensure the dropdown list matches dark theme in Chromium-based webviews */
        .hx-select option, .hx-select optgroup { background: #0b0b0c; color: #e5e7eb; }
        /* Keep dropdown options same color on hover/selection */
        .hx-select option:hover,
        .hx-select option:checked,
        .hx-select option:focus,
        .hx-select option:active { background: #0b0b0c !important; color: #e5e7eb !important; }
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

        /* Confirm Modal */
        .hx-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 9999; }
        .hx-confirm { width: 520px; max-width: calc(100% - 24px); background: #0b0b0c; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); color: #e5e7eb; }
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
            <input id="historySearch" class="hx-input" type="text" placeholder="Search your conversations..." />
          </div>
        </div>

        <div class="hx-filters">
          <select id="historyWorkspace" class="hx-select">
            <option value="all">Workspace: All</option>
            <option value="current">Workspace: Current</option>
          </select>
          <select id="historySort" class="hx-select">
            <option value="recent">Sort: Most Recent</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="tokens">Sort: Most Tokens</option>
          </select>
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
