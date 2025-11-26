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
      <input id="welcomeInput" type="text" placeholder="Plan, @ for context, / for commands" />
      <button id="welcomeSendBtn" class="welcome-icon-btn" title="Send">
        <img src="${assets.submit}" alt="Send" />
      </button>
    </div>

    <div class="welcome-actions">
      <div class="menu" id="welcomeModeMenuRoot">
        <button id="welcomeModeToggle" class="chip-btn" title="Mode">
          <img class="chip-icon" src="${assets.code}" alt="Code icon" />
          <span id="welcomeModeLabel">Code</span>
          <img class="dropdown-icon" src="${assets.dropdown}" alt="Dropdown" />
        </button>
        <div id="welcomeModeMenu" class="dropdown" role="listbox">
          <button class="item" data-mode="code"><span>Code</span></button>
          <button class="item" data-mode="chat"><span>Chat</span></button>
        </div>
      </div>

      <div class="menu" id="welcomeModelMenuRoot">
        <button id="welcomeModelToggle" class="chip-btn" title="Model">
          <img class="chip-icon" src="${assets.model}" alt="Model icon" />
          <span id="welcomeModelLabel">GPT-5</span>
          <img class="dropdown-icon" src="${assets.dropdown}" alt="Dropdown" />
        </button>
        <div id="welcomeModelMenu" class="dropdown" role="listbox">
          <button class="item" data-model="gpt5"><span>GPT-5</span></button>
          <button class="item" data-model="gpt5-high"><span>GPT-5 (high reasoning)</span></button>
        </div>
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
            <button class="icon-btn mention-picker-back" title="Back" style="padding:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg></button>
            <input class="mention-picker-search-input" type="text" placeholder="Search files and folders..." />
          </div>
          <div class="mention-list mention-picker-list" role="listbox"></div>
        </div>
      </div>
    </div>
  </div>
  `;
}
