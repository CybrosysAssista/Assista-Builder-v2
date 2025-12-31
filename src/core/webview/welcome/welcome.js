import { initMentionsUI } from '../mentions/mentions.js';

export function initWelcomeUI(vscode, opts = {}) {
  // opts is kept for future expansion; we intentionally insert into the welcome input
  const root = document.getElementById('welcomeScreen');
  if (!root) return {};

  const input = () => document.getElementById('welcomeInput');
  const sendBtn = () => document.getElementById('welcomeSendBtn');
  const plusBtn = () => document.getElementById('welcomePlusBtn');
  const modeToggle = () => document.getElementById('welcomeModeToggle');
  const modeMenu = () => document.getElementById('welcomeModeMenu');
  const modeLabel = () => document.getElementById('welcomeModeLabel');
  const modelToggle = () => document.getElementById('welcomeModelToggle');
  const modelMenu = () => document.getElementById('welcomeModelDropdown');
  const modelLabel = () => document.getElementById('welcomeModelLabel');
  const toolbarMount = () => document.getElementById('welcomeToolbarMount');
  const chatToolbarLeft = () => document.querySelector('.chatbox .chatbox-toolbar .left');

  function moveMenusToWelcome() {
    const mount = toolbarMount();
    if (!mount) return;
    const mode = document.getElementById('modeMenu');
    const model = document.getElementById('modelMenu');
    try {
      if (mode) mount.appendChild(mode);
      if (model) mount.appendChild(model);
    } catch (_) { /* no-op */ }
  }

  function moveMenusBackToChat() {
    const left = chatToolbarLeft();
    if (!left) return;
    const mode = document.getElementById('modeMenu');
    const model = document.getElementById('modelMenu');
    try {
      // Maintain original order: mode first, then model
      if (mode) left.appendChild(mode);
      if (model) left.appendChild(model);
    } catch (_) { /* no-op */ }
  }

  function showWelcome() {
    root.style.display = '';
    // Force reflow to ensure display change takes effect before opacity transition
    root.offsetHeight;
    root.classList.add('active');
    root.setAttribute('aria-hidden', 'false');

    // Sync model selection from chat state
    if (opts.chat && opts.chat.getSelectedModelLabel) {
      const label = opts.chat.getSelectedModelLabel();
      if (label && modelLabel()) {
        modelLabel().textContent = label;
      }
    }

    // Reuse exact chat toolbar HTML inside welcome
    moveMenusToWelcome();
  }

  function hideWelcome() {
    // Remove active class to trigger fade-out
    root.classList.remove('active');
    root.setAttribute('aria-hidden', 'true');
    // Move menus back to chat toolbar so chat view has them
    moveMenusBackToChat();
    // Wait for fade-out animation to complete before hiding
    setTimeout(() => {
      root.style.display = 'none';
    }, 300); // Match CSS transition duration
  }

  // Robust insert-at-cursor
  function insertAtCursor(text) {
    const el = input();
    if (!el) return;
    el.focus();

    try {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.innerText += text;
      }
    } catch (e) {
      el.innerText += text;
    }
    el.dispatchEvent(new Event('input'));
  }

  // Reuse the mentions module exactly like chat, but bound to the welcome input
  const mentions = initMentionsUI(vscode, {
    inputEl: input(),
    mentionBtn: null, // no dedicated @ button on welcome; inline typing opens it
    menuEl: document.getElementById('welcomeMentionMenu'),
    insertAtCursor: insertAtCursor,
  });

  function routeSend(text) {
    // Send message directly; the current view implies a new or empty session
    // We avoid sending 'newChat' here to prevent a race condition where the backend
    // sends an empty session update that wipes out our optimistic user message.

    // Small delay to ensure the new chat is initialized before sending the message
    setTimeout(() => {
      const chatInput = document.getElementById('chatInput');
      const chatSend = document.getElementById('sendBtn');
      if (chatInput && chatSend && typeof text === 'string') {
        // Chat input is a contenteditable div, so we must set innerText/textContent, not value
        chatInput.innerText = text;
        chatInput.textContent = text;
        try { chatInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
        chatSend.click();
      } else {
        // Fallback: send directly to host (UI will show assistant only)
        if (text) vscode.postMessage({ command: 'userMessage', text });
      }
    }, 100);
  }

  // Buttons
  sendBtn()?.addEventListener('click', (e) => {
    e.preventDefault();
    const val = String(input()?.innerText || '').trim();
    if (!val) return;
    routeSend(val);
    try { input().innerText = ''; } catch (_) { }
    hideWelcome();
  });

  plusBtn()?.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      input()?.focus();
      insertAtCursor('@');
    } catch (_) { }
  });

  input()?.addEventListener('keydown', (e) => {
    const el = input();
    if (!el) return;

    // Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = String(el.innerText || '').trim();
      if (!val) return;
      routeSend(val);
      try { el.innerText = ''; } catch (_) { }
      hideWelcome();
      return;
    }
  });

  // Fix: Ensure placeholder shows when cleared without breaking undo stack
  input()?.addEventListener('input', () => {
    const el = input();
    if (!el) return;

    // Toggle placeholder visibility based on text content
    const hasText = el.textContent.trim().length > 0 || el.querySelector('.mention-chip');
    if (hasText) {
      el.removeAttribute('data-placeholder-visible');
    } else {
      el.setAttribute('data-placeholder-visible', 'true');
    }
  });

  // Menus
  function toggle(el, on) { if (!el) return; el.classList.toggle('visible', on ?? !el.classList.contains('visible')); }
  function closeMenus() { modeMenu()?.classList.remove('visible'); modelMenu()?.classList.remove('visible'); }

  modeToggle()?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(modeMenu()); modelMenu()?.classList.remove('visible'); });
  modelToggle()?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(modelMenu()); modeMenu()?.classList.remove('visible'); });

  modeMenu()?.addEventListener('click', (e) => {
    const btn = e.target.closest('button.item');
    if (!btn) return;
    const mode = btn.getAttribute('data-mode');
    if (!mode) return;
    const label = mode === 'code' ? 'Agent' : 'Chat';
    if (modeLabel()) modeLabel().textContent = label;

    // Swap icons based on mode
    const chatIcon = document.querySelector('#welcomeModeToggle .mode-icon-chat');
    const agentIcon = document.querySelector('#welcomeModeToggle .mode-icon-agent');

    if (mode === 'chat') {
      if (chatIcon) chatIcon.style.display = '';
      if (agentIcon) agentIcon.style.display = 'none';
    } else {
      if (chatIcon) chatIcon.style.display = 'none';
      if (agentIcon) agentIcon.style.display = '';
    }

    closeMenus();
  });

  modelMenu()?.addEventListener('click', (e) => {
    const btn = e.target.closest('button.item');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const mdl = btn.getAttribute('data-model');
    const label = btn.querySelector('span')?.textContent || 'GPT-5';
    if (modelLabel()) modelLabel().textContent = label;

    try {
      if (action === 'custom-api') {
        // Set chat model to custom-api and open settings so user can add key
        opts.chat?.setSelectedModel?.('custom-api', 'Custom API');
        vscode.postMessage({ command: 'loadSettings' });
      } else if (mdl) {
        // Propagate selected model to chat so Send won't be blocked unexpectedly
        opts.chat?.setSelectedModel?.(mdl, label);
      }
    } catch (_) { /* no-op */ }

    closeMenus();
  });

  document.addEventListener('mousedown', (e) => {
    if (modeMenu() && !modeMenu().contains(e.target) && modeToggle() && !modeToggle().contains(e.target)) modeMenu().classList.remove('visible');
    if (modelMenu() && !modelMenu().contains(e.target) && modelToggle() && !modelToggle().contains(e.target)) modelMenu().classList.remove('visible');
  });

  // Splash screen animation for new chat
  function showSplashAnimation() {
    // Show welcome screen with splash mode
    root.style.display = '';
    root.classList.add('active', 'splash-mode');
    root.setAttribute('aria-hidden', 'false');
    // Ensure menus are shown within welcome during splash
    moveMenusToWelcome();

    // After splash animation plays, transition to full welcome
    setTimeout(() => {
      root.classList.remove('splash-mode');
      root.classList.add('transitioning');

      // Remove transitioning class after animation completes
      setTimeout(() => {
        root.classList.remove('transitioning');
      }, 800);
    }, 550);
  }

  // Expose helpers
  window.showWelcome = showWelcome;
  window.hideWelcome = hideWelcome;
  window.showSplashAnimation = showSplashAnimation;

  return {
    showWelcome,
    hideWelcome,
    showSplashAnimation,
    // Forwarders so main.js can pass mention data to this instance too
    setMentionRecentNames: (names) => mentions?.setRecentNames?.(names),
    setPickerItems: (items) => mentions?.setPickerItems?.(items),
  };
}