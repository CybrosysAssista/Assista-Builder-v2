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
  let isInserting = false;
  let lastRange = null; // Track cursor position to restore it after focus loss

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
      `<span class="mention-badge" style="background-color:${bg};color:${fg}" data-label="${label}"></span>`;
    if (isFolder) {
      return img(foldersBase, 'folder.svg')
        || `<svg style="width:16px;height:16px;flex:0 0 16px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#9aa4b2" d="M10 4l2 2h7a3 3 0 0 1 3 3v7a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3h5z"/></svg>`;
    }
    const nm = String(name || '').toLowerCase();
    const ext = nm.split('.').pop() || '';
    const map = {
      'py': 'python.svg', 'js': 'js.svg', 'jsx': 'js.svg', 'mjs': 'js.svg', 'cjs': 'js.svg', 'ts': 'ts.svg', 'tsx': 'ts.svg',
      'go': 'go.svg', 'java': 'java.svg', 'rs': 'rust.svg', 'rb': 'ruby.svg', 'php': 'php.svg', 'cs': 'csharp.svg', 'c': 'c.svg',
      'h': 'h.svg', 'cpp': 'cplus.svg', 'cxx': 'cplus.svg', 'cc': 'cplus.svg', 'kt': 'kotlin.svg', 'swift': 'swift.svg',
      'lua': 'lua.svg', 'r': 'r.svg', 'html': 'code-orange.svg', 'css': 'code-blue.svg', 'scss': 'sass.svg', 'sass': 'sass.svg',
      'md': 'markdown.svg', 'markdown': 'markdown.svg', 'xml': 'xml.svg', 'json': 'document.svg', 'yaml': 'yaml.svg',
      'yml': 'yaml.svg', 'csv': 'csv.svg', 'ini': 'gear.svg', 'toml': 'gear.svg', 'sh': 'shell.svg', 'bash': 'shell.svg',
      'zsh': 'shell.svg', 'ps1': 'shell.svg', 'sql': 'database.svg', 'png': 'image.svg', 'jpg': 'image.svg', 'jpeg': 'image.svg',
      'gif': 'image.svg', 'bmp': 'image.svg', 'webp': 'image.svg', 'svg': 'svg.svg', 'mp4': 'video.svg', 'webm': 'video.svg',
      'mkv': 'video.svg', 'mp3': 'audio.svg', 'wav': 'audio.svg', 'ogg': 'audio.svg', 'pdf': 'pdf.svg', 'lock': 'lock.svg', 'txt': 'text.svg'
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
    if (menuPosition && open) {
      Object.assign(menu.style, { left: `${menuPosition.left}px`, bottom: `${menuPosition.bottom}px`, top: 'auto' });
      return;
    }
    const anchor = inputEl || mentionBtn;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8, vw = window.innerWidth, vh = window.innerHeight;
    const spaceAbove = rect.top;
    const bottom = vh - rect.top + margin;
    let left = Math.max(margin, Math.min(rect.left, vw - 280 - margin));

    Object.assign(menu.style, { left: `${left}px`, bottom: `${bottom}px`, top: 'auto', maxHeight: `${spaceAbove - margin * 2}px` });
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
  function insertMention(name, isFolder = null) {
    hideMentionTooltip();
    closeMenu();

    // Guess if it's a folder if not explicitly provided (e.g. from drag and drop)
    if (isFolder === null) {
      const nm = String(name || '').toLowerCase();
      const lastPart = nm.split(/[\\\/]/).pop() || '';
      isFolder = lastPart && !lastPart.includes('.');
    }

    const base = (String(name).split(/[\\\/]/).pop()) || String(name);
    const iconHtml = fileIconFor(name, isFolder);

    if (inputEl) {
      inputEl.focus();
      const sel = window.getSelection();
      if (lastRange) {
        sel.removeAllRanges();
        sel.addRange(lastRange);
      }

      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);

        // Find and delete the '@' that triggered this
        let node = range.startContainer, offset = range.startOffset;
        if (node.nodeType === 1 && offset > 0 && node.childNodes[offset - 1].nodeType === 3) {
          node = node.childNodes[offset - 1]; offset = node.textContent.length;
        }

        if (node.nodeType === 3) {
          const text = node.textContent;
          let lastAt = text.lastIndexOf('@', offset - 1);
          if (lastAt === -1 && offset < text.length && text[offset] === '@') lastAt = offset;

          if (lastAt >= 0) {
            range.setStart(node, lastAt);
            range.setEnd(node, (lastAt === offset) ? lastAt + 1 : offset);
          } else {
            const prev = node.previousSibling;
            if (prev?.nodeType === 3) {
              const prevAt = prev.textContent.lastIndexOf('@');
              if (prevAt >= 0) {
                range.setStart(prev, prevAt);
                range.setEnd(node, offset);
              }
            }
          }
        }

        // Ensure the range is selected
        sel.removeAllRanges();
        sel.addRange(range);

        // Create chip element manually to avoid browser-injected wrappers
        const chip = document.createElement('span');
        chip.className = 'mention-chip';
        chip.contentEditable = 'false';
        chip.dataset.mention = base;
        chip.innerHTML = `${iconHtml}<span style="margin-left:4px">@${base}</span>`;

        // Delete the '@' and insert [ZWSP][CHIP][SPACE]
        range.deleteContents();

        const zwsp = document.createTextNode('\u200B');
        const space = document.createTextNode(' ');

        const frag = document.createDocumentFragment();
        frag.appendChild(zwsp);
        frag.appendChild(chip);
        frag.appendChild(space);

        range.insertNode(frag);

        // Move the cursor to after the space
        sel.removeAllRanges();
        const finalRange = document.createRange();
        finalRange.setStartAfter(space);
        finalRange.collapse(true);
        sel.addRange(finalRange);

        isInserting = true;
        inputEl.dispatchEvent(new Event('input'));
        isInserting = false;
        return;
      }
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

      return;
    }

    arr.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'option');
      row.dataset.relPath = String(it.relPath || '');
      const fullPath = String(it.description || it.relPath || '');
      row.innerHTML = `${iconFor(it)}<span class="label">${it.label || ''}</span><span class="desc"><span>${it.description || ''}</span></span>`;
      if (fullPath) {
        attachTooltipEvents(row, () => fullPath);
        const descSpan = row.querySelector('.desc');
        if (descSpan) attachTooltipEvents(descSpan, () => fullPath);
      }
      row.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const rel = row.dataset.relPath;
        if (rel) insertMention(rel, String(it.kind) === 'folder');
      };
      pickerList.appendChild(row);
    });

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
    hideMentionTooltip(); // Ensure tooltip is hidden when menu closes
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
          insertMention(name, false); // Assume recent items are files for now, or we need to store kind
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

  // Track cursor position
  const updateLastRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && inputEl.contains(sel.anchorNode)) {
      lastRange = sel.getRangeAt(0).cloneRange();
    }
  };
  inputEl?.addEventListener('keyup', updateLastRange);
  inputEl?.addEventListener('mouseup', updateLastRange);

  // Inline mention: typing "@query" in the chat input opens picker and searches while keeping focus in chat
  let inlineAtTimer;
  inputEl?.addEventListener('input', () => {
    updateLastRange();
    if (isInserting) return;

    let val = '';
    let selPos = 0;
    const isInput = inputEl.tagName === 'INPUT' || inputEl.tagName === 'TEXTAREA';

    if (isInput) {
      val = inputEl.value || '';
      selPos = inputEl.selectionStart || 0;
    } else {
      try {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const node = sel.anchorNode;
        if (node && node.nodeType === 3) { // Text node
          val = node.textContent || '';
          selPos = sel.anchorOffset;
        } else if (node === inputEl) {
          // Empty or at start/end of container
          val = inputEl.textContent || '';
          // If offset is 0, we are at the start. If > 0, we are likely at the end of some content.
          selPos = sel.anchorOffset === 0 ? 0 : val.length;
        } else {
          return;
        }
      } catch (_) { return; }
    }

    const at = val.lastIndexOf('@', selPos - 1);
    let hasAt = at >= 0;
    let inlineQuery = '';

    if (hasAt) {
      const raw = val.slice(at + 1, selPos);
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
    if (pickerSearch) pickerSearch.scrollLeft = pickerSearch.scrollWidth;
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
    insertMention,
    setRecentNames,
    setPickerItems: renderPickerItems,
  };
}
