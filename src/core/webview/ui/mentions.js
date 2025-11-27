export function initMentionsUI(vscode, opts) {
  const { inputEl, mentionBtn, menuEl, insertAtCursor } = opts || {};
  const menu = menuEl;
  if (!menu) return { open: () => { }, close: () => { } };

  const recentEls = [
    menu.querySelector('.mention-recent-1'),
    menu.querySelector('.mention-recent-2'),
    menu.querySelector('.mention-recent-3'),
  ];

  // Picker elements (scoped to menu)
  const defaultSection = menu.querySelector('.mention-default-section');
  const pickFilesEl = menu.querySelector('.mention-pick-files');
  const pickerPanel = menu.querySelector('.mention-picker-panel');
  const pickerSearch = menu.querySelector('.mention-picker-search-input');
  const pickerList = menu.querySelector('.mention-picker-list');

  let open = false;
  let pickerOpen = false;
  let lastQuery = '';
  let inlineTyping = false; // when true, keep focus in chat input while showing results
  let menuPosition = null; // Store the initial menu position to prevent jumping

  // Custom tooltip (styled) for full paths
  let mentionTooltipEl = null;
  function getMentionTooltip() {
    if (mentionTooltipEl) return mentionTooltipEl;
    const el = document.createElement('div');
    el.className = 'mention-tooltip';
    el.setAttribute('role', 'tooltip');
    el.style.display = 'none';
    document.body.appendChild(el);
    mentionTooltipEl = el;
    return el;
  }
  function showMentionTooltip(text, clientX, clientY) {
    const el = getMentionTooltip();
    el.textContent = text || '';
    el.style.display = 'block';
    const pad = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Ensure sizes after text set
    const rect = { w: el.offsetWidth || 260, h: el.offsetHeight || 24 };
    let x = clientX + pad, y = clientY + pad;
    if (x + rect.w + 4 > vw) x = vw - rect.w - 4;
    if (y + rect.h + 4 > vh) y = clientY - rect.h - pad;
    if (y < 0) y = 4;
    el.style.left = `${Math.max(4, x)}px`;
    el.style.top = `${Math.max(4, y)}px`;
  }
  function hideMentionTooltip() {
    const el = getMentionTooltip();
    el.style.display = 'none';
  }
  function attachTooltipEvents(target, textProvider) {
    if (!target) return;
    const onEnter = (e) => showMentionTooltip(String(textProvider()), e.clientX, e.clientY);
    const onMove = (e) => showMentionTooltip(String(textProvider()), e.clientX, e.clientY);
    const onLeave = () => hideMentionTooltip();
    target.addEventListener('mouseenter', onEnter);
    target.addEventListener('mousemove', onMove);
    target.addEventListener('mouseleave', onLeave);
    // Also hide if mouse leaves the tooltip itself (if it ever gets pointer events)
    if (mentionTooltipEl) {
      mentionTooltipEl.addEventListener('mouseleave', hideMentionTooltip);
    }
  }

  // Returns an <img> tag for known types from the bundled icon pack, or a badge fallback
  function fileIconFor(name, isFolder = false) {
    const filesBase = (window.__ASSISTA_ICON_FILES_BASE__ || '').toString();
    const foldersBase = (window.__ASSISTA_ICON_FOLDERS_BASE__ || '').toString();
    const img = (base, n) => (base && n) ? `<img class="file-icon" alt="" src="${base}/${n}"/>` : null;
    const badge = (label, bg, fg = '#111') =>
      `<svg style="width:16px;height:16px;flex:0 0 16px;" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
         <rect x="1.5" y="1.5" rx="3.5" ry="3.5" width="17" height="17" fill="${bg}" />
         <text x="10" y="13" text-anchor="middle" font-size="8" font-family="Segoe UI, Arial" fill="${fg}">${label}</text>
       </svg>`;
    if (isFolder) {
      return img(foldersBase, 'folder.svg')
        || `<svg style="width:16px;height:16px;flex:0 0 16px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa4b2" d="M10 4l2 2h7a3 3 0 0 1 3 3v7a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3h5z"/></svg>`;
    }
    const nm = String(name || '').toLowerCase();
    const ext = nm.split('.').pop() || '';
    const map = {
      'py': 'python.svg', 'js': 'js.svg', 'jsx': 'js.svg', 'mjs': 'js.svg', 'cjs': 'js.svg',
      'ts': 'ts.svg', 'tsx': 'ts.svg', 'go': 'go.svg', 'java': 'java.svg', 'rs': 'rust.svg',
      'rb': 'ruby.svg', 'php': 'php.svg', 'cs': 'csharp.svg', 'c': 'c.svg', 'h': 'h.svg',
      'cpp': 'cplus.svg', 'cxx': 'cplus.svg', 'cc': 'cplus.svg', 'kt': 'kotlin.svg', 'swift': 'swift.svg',
      'lua': 'lua.svg', 'r': 'r.svg',
      'html': 'code-orange.svg', 'css': 'code-blue.svg', 'scss': 'sass.svg', 'sass': 'sass.svg',
      'md': 'markdown.svg', 'markdown': 'markdown.svg', 'xml': 'xml.svg',
      'json': 'document.svg', 'yaml': 'yaml.svg', 'yml': 'yaml.svg', 'csv': 'csv.svg', 'ini': 'gear.svg', 'toml': 'gear.svg',
      'sh': 'shell.svg', 'bash': 'shell.svg', 'zsh': 'shell.svg', 'ps1': 'shell.svg',
      'sql': 'database.svg',
      'png': 'image.svg', 'jpg': 'image.svg', 'jpeg': 'image.svg', 'gif': 'image.svg', 'bmp': 'image.svg', 'webp': 'image.svg', 'svg': 'svg.svg',
      'mp4': 'video.svg', 'webm': 'video.svg', 'mkv': 'video.svg', 'mp3': 'audio.svg', 'wav': 'audio.svg', 'ogg': 'audio.svg',
      'pdf': 'pdf.svg', 'lock': 'lock.svg', 'txt': 'text.svg'
    };
    if (nm.endsWith('package.json')) {
      const t = img(filesBase, 'npm.svg') || img(filesBase, 'document.svg');
      if (t) return t;
    }
    const iconName = map[ext];
    if (iconName) {
      const t = img(filesBase, iconName);
      if (t) return t;
    }
    const lbl = ext ? ext.slice(0, 3).toUpperCase() : 'FILE';
    return badge(lbl, '#6b7280', '#e5e7eb');
  }

  function positionMenu() {
    if (!menu) return;

    // If we already have a stored position and the menu is open, use it
    // This prevents the menu from jumping when the picker panel opens
    if (menuPosition && open) {
      menu.style.left = `${menuPosition.left}px`;
      menu.style.bottom = `${menuPosition.bottom}px`;
      menu.style.top = 'auto'; // Clear top positioning
      return;
    }

    const anchor = mentionBtn || inputEl;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();

    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Calculate space available above the input
    const spaceAbove = rect.top;

    // Position from bottom of viewport
    // Distance from bottom = viewport height - anchor top + margin
    const bottom = vh - rect.top + margin;

    // Align to anchor's left similar to model dropdown
    let left = rect.left;
    // Clamp horizontally in viewport
    const menuWidth = 280; // approximate width
    left = Math.max(margin, Math.min(left, vw - menuWidth - margin));

    menu.style.left = `${left}px`;
    menu.style.bottom = `${bottom}px`;
    menu.style.top = 'auto'; // Clear any top positioning
    menu.style.maxHeight = `${spaceAbove - margin * 2}px`; // Limit height to available space

    // Store the position for future use
    menuPosition = { left, bottom };
  }

  // --- Picker panel logic ---
  function openPicker() {
    if (!menu || !pickerPanel || !defaultSection) return;
    defaultSection.style.display = 'none';
    pickerPanel.style.display = 'block';
    // Hide picker search when inline typing from chat
    try { pickerPanel.classList.toggle('inline-mode', !!inlineTyping); } catch (_) { }
    pickerOpen = true;
    // Load MRU items
    try { vscode.postMessage({ command: 'mentionWorkspaceRecent' }); } catch (_) { }
    // Do not steal focus from chat input when typing inline after '@'
    try { if (!inlineTyping && pickerSearch) pickerSearch.focus(); } catch (_) { }
    // Don't reposition - keep the menu in its original position
  }

  function closePicker() {
    if (!pickerPanel || !defaultSection) return;
    pickerPanel.style.display = 'none';
    try { pickerPanel.classList.remove('inline-mode'); } catch (_) { }
    defaultSection.style.display = '';
    pickerOpen = false;
    lastQuery = '';
    if (pickerSearch) pickerSearch.value = '';
    if (pickerList) pickerList.innerHTML = '';
  }
  // Helper to insert mention and handle existing '@' prefix
  function insertMention(name) {
    hideMentionTooltip();
    closeMenu();
    const base = (String(name).split(/[\\\/]/).pop()) || String(name);
    const textToInsert = `@${base} `;

    if (inputEl) {
      const val = inputEl.value;
      const sel = inputEl.selectionStart;
      // Search backwards for @
      const lastAt = val.lastIndexOf('@', sel - 1);
      if (lastAt >= 0) {
        const potentialQuery = val.slice(lastAt + 1, sel);
        // If query has no spaces, assume it's the mention being typed
        if (!/\s/.test(potentialQuery)) {
          const before = val.slice(0, lastAt);
          const after = val.slice(sel);
          inputEl.value = before + textToInsert + after;
          const newPos = before.length + textToInsert.length;
          inputEl.selectionStart = inputEl.selectionEnd = newPos;
          inputEl.focus();
          inputEl.dispatchEvent(new Event('input'));
          return;
        }
      }
    }
    // Fallback
    if (typeof insertAtCursor === 'function') {
      insertAtCursor(textToInsert);
    }
  }

  function renderPickerItems(items) {
    if (!pickerList) return;
    pickerList.innerHTML = '';
    const arr = Array.isArray(items) ? items : [];
    const iconFor = (it) => fileIconFor(it.relPath, String(it.kind) === 'folder');

    if (arr.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No results';
      pickerList.appendChild(empty);
      // Don't reposition - keep menu stable
      return;
    }

    arr.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'option');
      row.dataset.relPath = String(it.relPath || '');
      const fullPath = String(it.description || it.relPath || '');
      row.innerHTML = `${iconFor(it)}<span class="label">${it.label || ''}</span><span class="desc"><span>${it.description || ''}</span></span>`;
      // Attach styled tooltip on hover (full path)
      if (fullPath) {
        attachTooltipEvents(row, () => fullPath);
        const descSpan = row.querySelector('.desc');
        if (descSpan) attachTooltipEvents(descSpan, () => fullPath);
      }
      row.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const rel = row.dataset.relPath;
        if (rel) insertMention(rel);
      };
      pickerList.appendChild(row);
    });
    // Don't reposition - keep menu stable
  }

  function requestSearch(q) {
    try { vscode.postMessage({ command: 'mentionWorkspaceSearch', query: q }); } catch (_) { }
  }

  // Events

  function openMenu() {
    if (!menu) return;
    // Show then position to avoid off-screen placement
    menu.style.display = 'block';
    menu.setAttribute('aria-hidden', 'false');
    open = true;
    positionMenu();
    // Reposition on next frame and after layout settles
    try { requestAnimationFrame(() => positionMenu()); } catch (_) { }
    setTimeout(() => { if (open) positionMenu(); }, 50);
    try { vscode.postMessage({ command: 'mentionRecentFiles' }); } catch (_) { }
  }

  function closeMenu() {
    if (!menu) return;
    menu.style.display = 'none';
    menu.setAttribute('aria-hidden', 'true');
    open = false;
    closePicker();
    // Reset stored position so it recalculates on next open
    menuPosition = null;
  }

  function setRecentNames(names) {
    const arr = Array.isArray(names) ? names.slice(0, 3) : [];
    for (let i = 0; i < recentEls.length; i++) {
      const el = recentEls[i];
      const name = arr[i];
      if (!el) continue;
      if (name) {
        el.style.display = 'block';
        el.innerHTML = `${fileIconFor(name, false)}<span class="label">${name}</span>`;
        attachTooltipEvents(el, () => name);
        el.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          insertMention(name);
        };
      } else {
        el.style.display = 'none';
        el.onclick = null;
      }
    }
  }
  // Don't reposition - keep menu stable


  // Events
  pickFilesEl?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation(); // Ensure no other handlers run
    if (!open) openMenu();
    openPicker();
  });

  mentionBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      inputEl?.focus();
      if (typeof insertAtCursor === 'function') {
        insertAtCursor('@');
      } else {
        openMenu();
      }
    } catch (_) { }
  });

  // Inline mention: typing "@query" in the chat input opens picker and searches while keeping focus in chat
  let inlineAtTimer;
  inputEl?.addEventListener('input', () => {
    try {
      const val = String(inputEl.value || '');
      const sel = inputEl.selectionStart ?? val.length;
      const at = val.lastIndexOf('@', sel - 1);
      let hasAt = at >= 0;
      let inlineQuery = '';
      if (hasAt) {
        const raw = val.slice(at + 1, sel);
        // If the text from @ to cursor contains a delimiter, we are past the mention
        if (/[\s\n\t\"']/.test(raw)) {
          hasAt = false;
        } else {
          inlineTyping = true;
          inlineQuery = raw;
        }
      }

      clearTimeout(inlineAtTimer);
      inlineAtTimer = setTimeout(() => {
        if (hasAt) {
          if (!open) openMenu();
          if (!pickerOpen) openPicker();
          // Ensure panel reflects inline mode styling
          try { pickerPanel?.classList.toggle('inline-mode', true); } catch (_) { }
          // Do NOT mirror text into the picker's search input while inline typing
          if (!inlineTyping && pickerSearch) pickerSearch.value = inlineQuery;
          lastQuery = inlineQuery;
          if (inlineQuery) requestSearch(inlineQuery);
          else { try { vscode.postMessage({ command: 'mentionWorkspaceRecent' }); } catch (_) { } }
        } else {
          // No active @ token near caret -> close dialog and exit inline mode
          inlineTyping = false;
          try { pickerPanel?.classList.remove('inline-mode'); } catch (_) { }
          if (open) closeMenu();
        }
      }, 120);
    } catch (_) { }
  });

  document.addEventListener('mousedown', (e) => {
    if (menu && !menu.contains(e.target) && e.target !== mentionBtn) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      closeMenu();
    }
  });

  // Keep positioned on viewport changes
  window.addEventListener('resize', () => { if (open) positionMenu(); });
  window.addEventListener('scroll', () => { if (open) positionMenu(); }, true);

  // Picker controls
  // Debounced search
  let t;
  pickerSearch?.addEventListener('input', () => {
    const q = String(pickerSearch.value || '').trim();
    if (q === lastQuery) return;
    lastQuery = q;
    clearTimeout(t);
    t = setTimeout(() => {
      if (!pickerOpen) return;
      if (!q) { try { vscode.postMessage({ command: 'mentionWorkspaceRecent' }); } catch (_) { } }
      else { requestSearch(q); }
    }, 160);
  });

  return {
    open: openMenu,
    close: closeMenu,
    setRecentNames,
    setPickerItems: renderPickerItems,
  };
}
