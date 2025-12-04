export function getWelcomeHtml(assets: {
  logo: string;
  plus: string;
  submit: string;
  code: string;
  model: string;
  dropdown: string;
}): string {
  return `
  <div class="welcome-container" role="region" aria-label="Welcome">
    <div class="welcome-logo-wrap">
      <img class="welcome-logo" src="${assets.logo}" alt="Assista logo" />
    </div>
    <div class="welcome-greeting">Hey, John Doe</div>
    <div class="welcome-tagline">Sketch the logic, get the implementation.</div>

    <div class="welcome-input" role="group" aria-label="Compose">
      <button id="welcomePlusBtn" class="welcome-icon-btn" title="Add">
        <img src="${assets.plus}" alt="Add" />
      </button>
      <div id="welcomeInput" contenteditable="true" role="textbox" aria-multiline="false" placeholder="Plan, @ for context, / for commands"></div>
      <button id="welcomeSendBtn" class="welcome-icon-btn" title="Send">
        <img src="${assets.submit}" alt="Send" />
      </button>
    </div>

    <div class="welcome-actions">
      <div class="menu" id="welcomeModeMenuRoot">
        <button id="welcomeModeToggle" class="chip-btn" title="Mode">
          <span class="chip-icon">
            <!-- Chat Icon (hidden by default) -->
            <svg class="mode-icon-chat" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V16C2 17.1 2.9 18 4 18H6L10 22L14 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" stroke-linejoin="round"/>
              <path d="M7 9H17"/>
              <path d="M7 13H13"/>
            </svg>
            <!-- Agent Icon (code brackets, visible by default) -->
            <svg class="mode-icon-agent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </span>
          <span id="welcomeModeLabel">Agent</span>
          <img class="dropdown-icon" src="${assets.dropdown}" alt="Dropdown" />
        </button>
        <div id="welcomeModeMenu" class="dropdown" role="listbox">
          <button class="item" data-mode="code"><span>Agent</span><span class="desc" style="opacity:.6;font-size:11px">Assista can write and edit code</span></button>
          <button class="item" data-mode="chat"><span>Chat</span><span class="desc" style="opacity:.6;font-size:11px">Chat with Assista</span></button>
        </div>
      </div>

      <div class="menu" id="welcomeModelMenuRoot">
        <button id="welcomeModelToggle" class="chip-btn" title="Model">
          <img class="chip-icon" src="${assets.model}" alt="Model icon" />
          <span id="welcomeModelLabel">GPT-5</span>
          <img class="dropdown-icon" src="${assets.dropdown}" alt="Dropdown" />
        </button>
        <div id="welcomeModelMenu" class="dropdown" role="listbox">
          <div class="section-title">Recently Used</div>
          <button class="item" data-model="gpt5-low"><span>GPT-5 (low reasoning)</span><span style="opacity:.6;font-size:11px">0.5x</span></button>
          <button class="item" data-model="gpt5-high"><span>GPT-5 (high reasoning)</span><span style="opacity:.6;font-size:11px">3x</span></button>
          <div class="section-title">Recommended</div>
          <button class="item" data-model="gpt4"><span>GPT-4</span><span style="opacity:.6;font-size:11px">2x</span></button>
          <button class="item" data-model="sonnet-4.5"><span>Claude Sonnet 4.5</span><span style="opacity:.6;font-size:11px">2x</span></button>
          <button class="item" data-model="sonnet-4-thinking"><span>Claude Sonnet 4.5 Thinking</span><span style="opacity:.6;font-size:11px">3x</span></button>
          <button class="item custom" data-action="custom-api"><span>Use custom API key…</span></button>
        </div>
      </div>
    </div>

    <!-- Independent Mention Menu for Welcome Screen -->
    <div id="welcomeMentionMenu" class="mention-menu" role="menu" aria-hidden="true">
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
  `;
}
