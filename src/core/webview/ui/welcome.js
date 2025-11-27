import { initMentionsUI } from './mentions.js';

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
  const modelMenu = () => document.getElementById('welcomeModelMenu');
  const modelLabel = () => document.getElementById('welcomeModelLabel');

  function showWelcome() {
    root.style.display = '';
    root.classList.add('active');
    root.setAttribute('aria-hidden', 'false');
  }
  function hideWelcome() {
    root.style.display = 'none';
    root.classList.remove('active');
    root.setAttribute('aria-hidden', 'true');
  }

  // Fallback insert-at-cursor for the welcome input, used only if chat's helper isn't passed in
  function fallbackInsertAtCursor(text) {
    const el = input();
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = `${before}${text}${after}`;
    const pos = start + text.length;
    try { el.selectionStart = el.selectionEnd = pos; } catch (_) { }
    el.dispatchEvent(new Event('input'));
    el.focus();
  }

  // Reuse the mentions module exactly like chat, but bound to the welcome input
  const mentions = initMentionsUI(vscode, {
    inputEl: input(),
    mentionBtn: null, // no dedicated @ button on welcome; inline typing opens it
    menuEl: document.getElementById('welcomeMentionMenu'),
    insertAtCursor: fallbackInsertAtCursor,
  });

  function routeSend(text) {
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('sendBtn');
    if (chatInput && chatSend && typeof text === 'string') {
      chatInput.value = text;
      try { chatInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) { }
      chatSend.click();
    } else {
      // Fallback: send directly to host (UI will show assistant only)
      if (text) vscode.postMessage({ command: 'userMessage', text });
    }
  }

  // Buttons
  sendBtn()?.addEventListener('click', (e) => {
    e.preventDefault();
    const val = String(input()?.value || '').trim();
    if (!val) return;
    routeSend(val);
    try { input().value = ''; } catch (_) { }
    hideWelcome();
  });

  plusBtn()?.addEventListener('click', (e) => {
    e.preventDefault();
    // Placeholder: could open file picker / quick actions in future
  });

  input()?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = String(input()?.value || '').trim();
      if (!val) return;
      routeSend(val);
      try { input().value = ''; } catch (_) { }
      hideWelcome();
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
    closeMenus();
  });

  modelMenu()?.addEventListener('click', (e) => {
    const btn = e.target.closest('button.item');
    if (!btn) return;
    const mdl = btn.getAttribute('data-model');
    const label = btn.querySelector('span')?.textContent || 'GPT-5';
    if (modelLabel()) modelLabel().textContent = label;
    closeMenus();
  });

  document.addEventListener('mousedown', (e) => {
    if (modeMenu() && !modeMenu().contains(e.target) && modeToggle() && !modeToggle().contains(e.target)) modeMenu().classList.remove('visible');
    if (modelMenu() && !modelMenu().contains(e.target) && modelToggle() && !modelToggle().contains(e.target)) modelMenu().classList.remove('visible');
  });

  // Expose helpers
  window.showWelcome = showWelcome;
  window.hideWelcome = hideWelcome;

  return {
    showWelcome,
    hideWelcome,
    // Forwarders so main.js can pass mention data to this instance too
    setMentionRecentNames: (names) => mentions?.setRecentNames?.(names),
    setPickerItems: (items) => mentions?.setPickerItems?.(items),
  };
}
