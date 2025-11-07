const vscode = acquireVsCodeApi();
        
function decorateFilePaths(root) {
    const clean = (p) => String(p).trim()
      .replace(/[)\]\}.,;:'"]+$/, '')
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '');
    const extOf = (p) => {
      const m = clean(p).toLowerCase().match(/\.([a-z0-9]+)$/);
      return m ? m[1] : '';
    };
    const baseName = (p) => {
      const s = clean(p).replace(/\\/g, '/');
      const parts = s.split('/');
      return parts[parts.length - 1] || s;
    };
    const likely = (t) => {
      const s = clean(t);
      if (!s) return false;
      if (!/\.[a-z0-9]+$/i.test(s)) return false;
      return s.includes('/') || s.includes('\\') ||
        /^[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/.test(s);
    };

    // Colored icons approximating VS Code Explorer theme
    const iconSvg = (ext) => {
      switch ((ext || '').toLowerCase()) {
        case 'folder':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#C6913E" d="M10 4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h6z"/>
          </svg>`;
        case 'py':
          return `
            <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
              <path fill="currentColor" d="M13.016 2H18.984A4 4 0 0 1 22.984 6V12.37c0 1.8-1.507 3.259-3.366 3.259H12.251c-2.197 0-3.978 1.725-3.978 3.852V26.148A3.852 3.852 0 0 0 12.016 30H18.984A3.852 3.852 0 0 0 22.836 26.148V23.481H16.076V22.741H26.022C28.219 22.741 30 21.016 30 18.889V13.111C30 10.984 28.219 9.259 26.022 9.259H23.727V5.852A3.852 3.852 0 0 0 19.875 2H13.016z"/>
            </svg>`;
        case 'js':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#F7DF1E" d="M2 2h20v20H2z"/>
            <path fill="#1F1F1F" d="M14.4 17.3c0 1.5-.9 2.4-2.4 2.4-1.2 0-2-.6-2.4-1.5l1.4-.8c.2.3.4.6.8.6.4 0 .6-.2.6-.6v-4.8h1.9v4.7zM18.7 19.7c-1.5 0-2.6-.7-3.2-1.8l1.4-.8c.3.5.7.9 1.4.9.6 0 1-.3 1-.8 0-.5-.3-.8-1.1-1.1l-.4-.2c-1.2-.5-2-1.1-2-2.4 0-1.2.9-2.2 2.3-2.2 1 0 1.8.3 2.3 1.3l-1.3.9c-.3-.4-.5-.6-1-.6-.5 0-.8.3-.8.6 0 .4.3.6 1.1.9l.4.2c1.3.6 2 1.2 2 2.5 0 1.3-1 2.3-2.5 2.3z"/>
          </svg>`;
        case 'html':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#E34F26" d="M1.5 0h21l-1.9 21.6L12 24l-8.6-2.4L1.5 0z"/>
            <path fill="#EF652A" d="M12 22l6.9-1.9L20.6 2H12v20z"/>
            <path fill="#fff" d="M12 9.3H7.4l.2 2.5H12v2.5H9.8l.1 1.9L12 17v2.6l-4.7-1.3-.3-3.5H5.5l.4 4.8L12 22v-2.6l2.1-.6.3-3.5h-2.4v-2.5h3.7l.3-2.5H12V9.3z"/>
          </svg>`;
        case 'css':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#264DE4" d="M1.5 0h21l-1.9 21.6L12 24l-8.6-2.4L1.5 0z"/>
            <path fill="#2965F1" d="M12 22l6.9-1.9L20.6 2H12v20z"/>
            <path fill="#EBEBEB" d="M12 13.5H8.4l-.3-3.5H12V7.5H5.8l.6 7.5H12v-1.5z"/>
            <path fill="#fff" d="M12 17l2.1-.6.3-3.5H12V17z"/>
          </svg>`;
        case 'json':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#F7B93E" d="M5 3h3v3H5v12h3v3H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm11 0h3c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2h-3v-3h3V6h-3V3z"/>
          </svg>`;
        case 'md':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#083FA1" d="M4 4h16v16H4z"/>
            <path fill="#fff" d="M6 8h3l1 1 1-1h3v8h-2v-5l-2 2-2-2v5H6zM16 8l2 3 2-3v8h-2v-4l-2 3z"/>
          </svg>`;
        case 'xml':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#E54D26" d="M9 16l-4-4 4-4 1.4 1.4L7.8 12l2.6 2.6L9 16zm6-8l4 4-4 4-1.4-1.4L16.2 12l-2.6-2.6L15 8z"/>
          </svg>`;
        case 'sh':
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4EAA25" d="M4 4h16v16H4z"/>
            <path fill="#fff" d="M7 8h2v2H7zM7 12h2v2H7zM11 8h6v2h-6zM11 12h6v2h-6z"/>
          </svg>`;
        default:
          return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#7A7A7A" d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 2v4h4"/></svg>`;
      }
    };

    // Replace inline code with minimal chips (safe name rendering)
    root.querySelectorAll('code').forEach((el) => {
      if (el.parentElement && el.parentElement.tagName === 'PRE') return; // handled below
      const txt = el.textContent || '';
      if (!likely(txt)) return;
      const p = clean(txt);
      const ext = extOf(p);
      const wrap = document.createElement('span');
      wrap.className = 'vsc-fe';
      wrap.setAttribute('data-ext', ext || 'file');
      const nameElWrap = document.createElement('span');
      nameElWrap.className = 'name';
      nameElWrap.textContent = baseName(p);
      wrap.innerHTML = iconSvg(ext);
      wrap.appendChild(nameElWrap);
      el.replaceWith(wrap);
    });

    // Code blocks listing only paths -> transform each line into a chip
    root.querySelectorAll('pre>code').forEach((block) => {
      const raw = block.textContent || '';
      const lines = raw.split(/\r?\n/);
      const all = lines.every(l => !l.trim() || likely(l));
      if (!all) return;
      const frag = document.createElement('div');
      lines.forEach((l, i) => {
        const s = clean(l);
        if (!s) return;
        const ext = extOf(s);
        const row = document.createElement('span');
        row.className = 'vsc-fe';
        row.setAttribute('data-ext', ext || 'file');
        const nm = document.createElement('span');
        nm.className = 'name';
        nm.textContent = baseName(s);
        row.innerHTML = iconSvg(ext);
        row.appendChild(nm);
        frag.appendChild(row);
        if (i < lines.length - 1) frag.appendChild(document.createElement('br'));
      });
      const pre = block.parentElement; if (pre) { pre.innerHTML = ''; pre.appendChild(frag); }
    });
}
  
        function renderChatFromSession(id){
            try {
                const s = loadSessions();
                const session = (s.sessions||[]).find(x=>String(x.id)===String(id));
                if (session) {
                    const messagesHtml = session.messages.map(m=>renderMessage(m)).join('');
                    messages.innerHTML = messagesHtml;
                    decorateFilePaths(messages);
                    messages.scrollTop = messages.scrollHeight;
                }
            } catch {}
        }
const chatInput = document.getElementById('chatInput');
        const messages = document.getElementById('messages');
        const sendBtn = document.getElementById('sendBtn');
        const chatWrapper = document.querySelector('.input-wrapper');
        const highlightLayer = document.getElementById('highlightLayer');
        const addImageBtn = document.getElementById('addImageBtn');
        const enhanceBtn = document.getElementById('enhanceBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        // Confirm elements
        const confirmBar = document.getElementById('confirmBar');
        const confirmLabel = document.getElementById('confirmLabel');
        const proceedBtn = document.getElementById('proceedBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        // Pending generation payload after plan preview (set when confirmApplyPlan arrives)
        let pendingGenPayload = null;
        // History elements
        const historyOverlay = document.getElementById('historyOverlay');
        const openHistoryBtn = document.getElementById('openHistoryBtn');
        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        const newSessionBtn = document.getElementById('newSessionBtn');
        const deleteSessionBtn = document.getElementById('deleteSessionBtn');
        const restoreSessionBtn = document.getElementById('restoreSessionBtn');
        const historySessions = document.getElementById('historySessions');
        const historyMessages = document.getElementById('historyMessages');
        // History assets loader and renderer (lib/webview/ui/history.css + lib/webview/ui/history.js)
        const historyAssetsMeta = document.getElementById('historyAssets');
        let historyAssetsLoaded = false;
        // Inline status bubble (Analyzing… / Generating…) rendered as a normal AI chat bubble
        let statusBubbleEl = null;
        function ensureStatusBubble() {
            if (statusBubbleEl && statusBubbleEl.tagName) return statusBubbleEl;
            const el = document.createElement('div');
            el.className = 'message ai fade-in';
            el.innerHTML = '<div class="status-bubble"><span class="label">Analyzing</span><span class="dots"><span></span><span></span><span></span></span></div>';
            statusBubbleEl = el;
            return el;
        }
        function showStatusBubble(kind) {
            try {
                const el = ensureStatusBubble();
                const label = el.querySelector('.label');
                if (label) label.textContent = String(kind || 'Working');
                // Always append to the end so it sits under the latest chat item
                if (messages) {
                    messages.appendChild(el);
                    messages.scrollTop = messages.scrollHeight;
                }
            } catch {}
        }
        function updateStatusBubble(kind) {
            try {
                if (!statusBubbleEl) return;
                const label = statusBubbleEl.querySelector('.label');
                if (label) label.textContent = String(kind || 'Working');
                if (messages && statusBubbleEl.parentElement !== messages) {
                    messages.appendChild(statusBubbleEl);
                }
            } catch {}
        }
        function hideStatusBubble() {
            try { if (statusBubbleEl && statusBubbleEl.parentElement) statusBubbleEl.parentElement.removeChild(statusBubbleEl); } catch {}
            statusBubbleEl = null;
        }
        function showPostTaskConfirm() {
            try {
                if (confirmLabel) confirmLabel.textContent = 'Start a new chat or continue in this chat?';
                if (proceedBtn) { proceedBtn.textContent = 'Start New Chat'; proceedBtn.setAttribute('aria-label', 'Start New Chat'); }
                if (cancelBtn) { cancelBtn.textContent = 'Cancel'; cancelBtn.setAttribute('aria-label', 'Cancel'); }
                if (confirmBar) { confirmBar.dataset.mode = 'posttask'; confirmBar.classList.add('visible'); confirmBar.setAttribute('aria-hidden','false'); }
            } catch {}
        }
        function hideConfirm(){
            try {
                if (confirmBar) {
                    confirmBar.classList.remove('visible');
                    confirmBar.setAttribute('aria-hidden','true');
                    delete confirmBar.dataset.mode;
                }
            } catch {}
        }
        function loadHistoryAssetsOnce(cb) {
            if (historyAssetsLoaded) { try { cb && cb(); } catch {} return; }
            try {
                const cssHref = historyAssetsMeta?.getAttribute('data-css');
                const jsSrc = historyAssetsMeta?.getAttribute('data-js');
                const head = document.head || document.getElementsByTagName('head')[0];
                // Reuse the current script nonce for CSP
                const currentScriptWithNonce = document.querySelector('script[nonce]');
                let currentNonce = '';
                try {
                    if (currentScriptWithNonce) {
                        // @ts-ignore - nonce property exists on HTMLScriptElement at runtime
                        currentNonce = (currentScriptWithNonce.nonce || currentScriptWithNonce.getAttribute('nonce') || '');
                    }
                } catch {}
                let pending = 0;
                function done(){ if (--pending <= 0){ historyAssetsLoaded = true; try { cb && cb(); } catch {} } }
                if (cssHref) {
                    pending++;
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = cssHref;
                    link.onload = done;
                    link.onerror = done;
                    head.appendChild(link);
                }
                if (jsSrc) {
                    pending++;
                    const script = document.createElement('script');
                    script.src = jsSrc;
                    if (currentNonce) script.setAttribute('nonce', String(currentNonce));
                    script.onload = done;
                    script.onerror = done;
                    head.appendChild(script);
                }
                if (pending === 0) { historyAssetsLoaded = true; try { cb && cb(); } catch {} }
            } catch { try { cb && cb(); } catch {} }
        }
        function renderHistoryUI(){
            try {
                const root = document.getElementById('historyRoot');
                const api = (window && window['AssistaXHistory']) ? (window['AssistaXHistory']) : undefined;
                if (!root) return;
                if (!api || typeof api.render !== 'function') {
                    // Fallback UI to indicate why history isn't visible
                    root.innerHTML = '<div style="padding:16px;color:var(--vscode-descriptionForeground);">Loading history UI… If this persists, please Reload Window.</div>';
                    console.warn('[Assista X] History API not yet available');
                    return;
                }
                const s = loadSessions();
                const sessions = Array.isArray(s.sessions) ? s.sessions : [];
                api.render(root, sessions, {
                    onDone: ()=>{ try { historyOverlay && historyOverlay.classList.remove('active'); } catch {} },
                    onSelect: (id)=>{
                        try {
                            const st = loadSessions();
                            if ((st.sessions||[]).find(x=>String(x.id)===String(id))) {
                                saveSessions(st.sessions, id);
                            }
                        } catch {}
                        // Switch chat to the selected session
                        try { renderChatFromSession(id); } catch {}
                        try { historyOverlay && historyOverlay.classList.remove('active'); historyOverlay.setAttribute('aria-hidden','true'); } catch {}
                    },
                    onDelete: (id)=>{
                        try {
                            const st = loadSessions();
                            const next = (st.sessions||[]).filter(x=>String(x.id)!==String(id));
                            const newCurrent = next.length ? next[next.length-1].id : null;
                            saveSessions(next, newCurrent);
                        } catch {}
                        // Re-render list after deletion
                        try { renderHistoryUI(); } catch {}
                        // Render chat for new current (if any)
                        try { renderChatFromSession(); } catch {}
                    },
                    onRestore: (id)=>{
                        try {
                            const st = loadSessions();
                            if ((st.sessions||[]).find(x=>String(x.id)===String(id))) {
                                saveSessions(st.sessions, id);
                            }
                        } catch {}
                        try { renderChatFromSession(id); } catch {}
                        try { historyOverlay && historyOverlay.classList.remove('active'); historyOverlay.setAttribute('aria-hidden','true'); } catch {}
                    }
                });
            } catch {}
        }
        // Smart auto-scroll state: true when user is at bottom; false when user scrolls up
        let shouldAutoScroll = true;
        let isGenerating = false;
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            try { stopBtn.setAttribute('aria-hidden', 'true'); } catch {}
            try { stopBtn.setAttribute('tabindex', '-1'); } catch {}
            try { stopBtn.disabled = true; } catch {}
        }
        const sendBtnEl = document.getElementById('sendBtn');
        const sendBtnMirrorEl = document.getElementById('sendBtnMirror');
        const addContextBtn = document.getElementById('addContextBtn');
        const contextChips = document.getElementById('contextChips');
        let contextItems = []; // {type:'file'|'folder', name, path}
        // Tracks context items attached via the Add Context picker for chip rendering
        // Shape: { path: string, kind: 'file'|'folder' }
        let attachedContext = [];
        // Restore previously selected context items from webview state
        try {
            const st0 = getState();
            if (Array.isArray(st0.contextItems)) {
                contextItems = st0.contextItems.map(x=>({ type: x.type, name: x.name, path: x.path }));
                // Initial render if any
                if (contextItems.length) { renderContextChips(); }
            }
        } catch {}

// ---- Dev-main style planning panel (no settings needed) ----
let planState = { total: 0, done: 0, sections: { requirements: '', tasks: '', menu: '' } };
let planActive = false;
let planUpdatedAt = 0; // ms epoch when plan content last updated
let planHostEl = null; // <div id="planView">
function ensurePlanHost() {
  try {
    if (planHostEl && planHostEl.parentElement) return planHostEl;
    const el = document.createElement('div');
    el.id = 'planView';
    el.className = 'message ai';
    el.innerHTML = '<div class="plan-card"></div>';
    if (messages) messages.appendChild(el);
    planHostEl = el;
    return el;
  } catch { return null; }
}
function sanitize(s){ return String(s||'').replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function chipify(text){
  // convert backticked file paths to chips, showing FULL module-relative path
  return text.replace(/`([^`\n]+)`/g, (m,p)=>{
    const full = String(p||'').trim();
    const safe = sanitize(full);
    return `<span class="vsc-fe" data-ext="file" data-path="${safe}"><span class="name" title="${safe}">${safe}</span></span>`;
  });
}
function chipifyHtml(root){
  try {
    // Replace <code>...</code> with file-like chips using FULL path
    const codes = root.querySelectorAll('code');
    codes.forEach(c=>{
      const raw = c.textContent || '';
      const name = (raw || '').trim();
      const chip = root.ownerDocument.createElement('span');
      chip.className = 'vsc-fe';
      chip.setAttribute('data-ext','file');
      try { chip.setAttribute('data-path', name); } catch {}
      const nm = root.ownerDocument.createElement('span');
      nm.className = 'name';
      nm.textContent = name;
      try { nm.title = name; } catch {}
      chip.appendChild(nm);
      c.replaceWith(chip);
    });
  } catch {}
}
function parseDevMainHtml(html){
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html||''), 'text/html');
  const content = doc.body || doc;
  chipifyHtml(content);
  const groups = [];
  const h3s = Array.from(content.querySelectorAll('h3'));
  h3s.forEach(h3=>{
    const title = h3.textContent?.trim() || '';
    // nextElementSiblings until next h3: collect li items
    let el = h3.nextElementSibling;
    const items = [];
    while (el && el.tagName.toLowerCase() !== 'h3') {
      if (el.tagName.toLowerCase() === 'ul') {
        const lis = Array.from(el.querySelectorAll(':scope > li'));
        lis.forEach(li=>{
          items.push({ html: li.innerHTML });
        });
      }
      el = el.nextElementSibling;
    }
    groups.push({ title, items });
  });
  return groups;
}
function extractTextFromHtml(html){
  try {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
  } catch {
    return String(html || '').replace(/<[^>]+>/g, '').trim();
  }
}
function normalizeFilePaths(items){
  const paths = [];
  (items || []).forEach(it=>{
    let raw = '';
    if (typeof it === 'string') raw = it;
    else if (it && typeof it.text === 'string') raw = it.text;
    else if (it && typeof it.html === 'string') raw = extractTextFromHtml(it.html);
    const split = String(raw || '')
      .split(/<br\s*\/?>/i)
      .map(s=>s.replace(/^[\-*\d\.\s]+/, '').trim())
      .filter(Boolean);
    split.forEach(seg=>{
      const cleaned = seg.replace(/\\/g, '/').replace(/^\/*/, '').replace(/\/*$/, '');
      if (cleaned) paths.push(cleaned);
    });
  });
  const seen = new Set();
  return paths.filter(p=>{
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}
function buildFileTree(paths){
  const root = { name: '', children: new Map(), isFile: false };
  let segmentsList = paths.map(p=>p.split('/').filter(Boolean));
  if (segmentsList.length) {
    const first = segmentsList[0][0];
    const allSame = first && segmentsList.every(parts => parts[0] === first);
    if (allSame) {
      segmentsList = segmentsList.map(parts => parts.slice(1));
    }
  }
  segmentsList.forEach(parts=>{
    if (!parts.length) return;
    let node = root;
    parts.forEach((part, idx)=>{
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map(), isFile: false });
      }
      const child = node.children.get(part);
      if (idx === parts.length - 1) child.isFile = true;
      node = child;
    });
  });
  return root;
}
function formatFileTreeLines(node, prefix=''){
  const entries = Array.from(node.children.values());
  entries.sort((a, b)=>{
    const aDir = a.children.size > 0 && !a.isFile;
    const bDir = b.children.size > 0 && !b.isFile;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const lines = [];
  entries.forEach((entry, idx)=>{
    const isLast = idx === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    lines.push(prefix + connector + entry.name);
    if (entry.children.size) {
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(...formatFileTreeLines(entry, nextPrefix));
    }
  });
  return lines;
}
function renderFileTree(items){
  const paths = normalizeFilePaths(items);
  if (!paths.length) {
    return '<div class="empty-tree">No files detected.</div>';
  }
  const tree = buildFileTree(paths);
  const lines = formatFileTreeLines(tree);
  const escaped = lines.map(line=>line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;'))
    .join('\n');
  return `<pre class="file-tree" role="presentation">${escaped}</pre>`;
}
function parseTasks(md){
  const lines = String(md||'').split(/\r?\n/);
  const groups = [];
  let cur = null;
  for (const raw of lines){
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (!/^[-*]\s*\[/.test(line)) {
      // heading
      cur = { title: line.replace(/^#+\s*/,'').trim(), items: [] };
      groups.push(cur);
      continue;
    }
    const m = line.match(/^[-*]\s*\[( |x|X)\]\s*(.*)$/);
    if (m){
      if (!cur) { cur = { title: '', items: [] }; groups.push(cur); }
      cur.items.push({ done: m[1].toLowerCase()==='x', text: m[2] });
    }
  }
  return groups;
}
function renderPlan(){
  const host = ensurePlanHost(); if (!host) return;
  const card = host.querySelector('.plan-card'); if (!card) return;
  const percent = planState.total>0 ? Math.round(100*planState.done/planState.total) : 0;
  const reqHtml = planState.sections.requirements ? `<section class="plan-sec"><h3>Requirements</h3><div class="plan-body">${chipify(sanitize(planState.sections.requirements))}</div></section>` : '';
  const menuHtml = planState.sections.menu ? `<section class="plan-sec"><h3>Menu Structure</h3><div class="plan-body">${chipify(sanitize(planState.sections.menu))}</div></section>` : '';
  // Tasks structured
  let tasksHtml = '';
  if (planState.sections.tasks){
    let groups = [];
    const isHtml = /<\s*ul|<\s*h3|<\s*li|<\s*code/i.test(planState.sections.tasks);
    if (isHtml) {
      groups = parseDevMainHtml(planState.sections.tasks);
    } else {
      groups = parseTasks(planState.sections.tasks);
    }
    const blocks = groups.map(g=>{
      const items = (g.items||[]).map(it=>{
        if (it.html) {
          return `<li class="task-item"><span class="rb" aria-hidden="true"></span><span class="ttext">${it.html}</span></li>`;
        }
        const mark = it.done ? 'checked' : '';
        return `<li class="task-item"><label><input type="checkbox" disabled ${mark}/> <span class="ttext">${chipify(sanitize(it.text))}</span></label></li>`;
      }).join('');
      const groupInner = `<div class="task-group"><h4>${sanitize(g.title||'')}</h4><ul class="task-list">${items}</ul></div>`;
      // If this is the files list group, wrap it with a bordered box
      if (/^\s*files\s+to\s+be\s+created\s*$/i.test(String(g.title||''))) {
        const treeHtml = renderFileTree(g.items || []);
        return `<div class="files-box file-tree-box"><div class="task-group file-tree-group"><h4>${sanitize(g.title||'')}</h4>${treeHtml}</div></div>`;
      }
      return groupInner;
    }).join('');
    tasksHtml = `<section class="plan-sec"><div class="plan-head"><h3>Tasks</h3></div>${blocks}</section>`;
  }
  card.innerHTML = `${reqHtml}${tasksHtml}${menuHtml}`;
  try { decorateFilePaths(card); } catch {}
  // keep scroll to end like chat
  try { messages.scrollTop = messages.scrollHeight; } catch {}
}

        // Initial visibility: in Generate mode (default), hide Add Context button
        try { if (addContextBtn) addContextBtn.style.display = 'none'; } catch {}

        function renderContextChips(){
            try {                                                                                                                                                                               
                if (!contextChips) return;
                // Preserve current-file chip if present
                let currentChip = null;
                try { currentChip = contextChips.querySelector('.current-file-chip') || null; } catch {}
                contextChips.innerHTML = '';
                if (currentChip) {
                    try { contextChips.appendChild(currentChip); } catch {}
                }
                contextItems.forEach((it, idx)=>{
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    const ext = it.type === 'folder' ? 'folder' : (it.name.includes('.') ? it.name.split('.').pop() : 'file');
                    // icon dot
                    const icon = document.createElement('span');
                    icon.className = 'chip-icon';
                    chip.appendChild(icon);
                    // file name
                    const nm = document.createElement('span');
                    nm.className = 'chip-text';
                    nm.textContent = it.name;
                    chip.appendChild(nm);
                    // badge (match current-file chip styling, different label)
                    const badge = document.createElement('span');
                    badge.className = 'chip-badge';
                    badge.textContent = it.type === 'folder' ? 'Folder' : 'Attached';
                    chip.appendChild(badge);
                    // remove button
                    const close = document.createElement('button');
                    close.className = 'chip-close';
                    close.textContent = '×';
                    close.title = 'Remove';
                    close.addEventListener('click', ()=>{
                        contextItems.splice(idx,1);
                        renderContextChips();
                        try { setState({ ...(getState()), contextItems }); } catch {}
                    });
                    chip.appendChild(close);
                    contextChips.appendChild(chip);
                });
            } catch {}
        }

        // Use VS Code native QuickPick flow via extension
        if (addContextBtn && 'addEventListener' in addContextBtn){
            addContextBtn.addEventListener('click', ()=>{
                try { vscode.postMessage({ command: 'openContextPicker' }); } catch {}
            });
        }

        // Receive selected items from extension
        window.addEventListener('message', (event)=>{
            try {
                const msg = event.data || {};
                if (msg.command === 'contextAdded' && Array.isArray(msg.items)){
                    const items = msg.items.map(x=>({ type: x.type, name: x.name, path: x.path }));
                    // de-dup by path
                    const seen = new Set(contextItems.map(i=>i.path));
                    items.forEach(i=>{ if (!seen.has(i.path)) { contextItems.push(i); seen.add(i.path); } });
                    renderContextChips();
                    try { if (contextChips) contextChips.setAttribute('data-count', String(contextItems.length)); } catch {}
                    // persist selections
                    try { setState({ ...(getState()), contextItems }); } catch {}
                }
            } catch {}
        });
        // Mode toggle buttons (Generate/Edit) — ensure blue highlight moves with selection
        const modeGenerateBtn = document.getElementById('modeGenerateBtn');
        const modeEditBtn = document.getElementById('modeEditBtn');
        let currentMode = 'generate'; // default
        // Remember the last active file info broadcast from the extension
        let lastActiveFileInfo = null;
        // Prevent duplicate success announcements
        let modeSwitchAnnounced = false;
        // One-shot flag to suppress starting a new chat when switching modes
        let suppressNewChatOnce = false;
        // Edit Silent Mode: while true, suppress assistant aiReply messages (used during Edit project scan)
        let editSilentMode = false;
        // One-shot flag to suppress the edit-mode announcement when coming from Welcome's "Edit Existing Project"
        let suppressEditAnnouncementOnce = false;
        // Flow guard: increment on each mode switch; tag all outbound/inbound messages
        let currentFlowId = 1;
        function bumpFlow() { try { currentFlowId = (currentFlowId|0) + 1; } catch { currentFlowId = Date.now()|0; } return currentFlowId; }
        // Clear pending plan/generation UI and state inside the webview
        function resetFlowState() {
            try { pendingGenPayload = null; } catch {}
            try { hideConfirm(); } catch {}
            try { hideStatusBubble(); } catch {}
            try { setGenerating(false); } catch {}
            try {
                if (progressPanel) { progressPanel.classList.remove('active'); progressPanel.classList.remove('pulse'); }
                if (progressText) { progressText.textContent = ''; }
            } catch {}
            // Notify extension to cancel any running tasks bound to previous mode
            try { vscode.postMessage({ command: 'cancelCurrent' }); } catch {}
        }

        // --- Welcome Screen: defensive init to ensure it shows on first load ---
        (function ensureWelcomeInit(){
            try {
                const welcome = document.getElementById('welcomeScreen');
                if (!welcome || !messages) return;
                const showWelcome = ()=>{
                    try { welcome.style.display = 'flex'; welcome.classList.add('active'); welcome.setAttribute('aria-hidden','false'); } catch {}
                    try { messages.classList.remove('active'); } catch {}
                    try { document.body && document.body.classList && document.body.classList.add('welcome-active'); } catch {}
                };
                const hideWelcome = ()=>{
                    try { welcome.style.display = 'none'; welcome.classList.remove('active'); welcome.setAttribute('aria-hidden','true'); } catch {}
                    try { messages.classList.add('active'); } catch {}
                    try { const mc = document.querySelector('.main-content'); if (mc) mc.style.display = 'flex'; } catch {}
                    try { document.body && document.body.classList && document.body.classList.remove('welcome-active'); } catch {}
                };
                const isEmpty = ()=>{ try { return (messages.children.length === 0); } catch { return true; } };
                // Initial paint: always show the welcome panel upon opening the extension
                showWelcome();
                // React to chat mutations to toggle welcome
                try {
                    const mo = new MutationObserver(()=>{ if (isEmpty()) showWelcome(); else hideWelcome(); });
                    mo.observe(messages, { childList: true });
                } catch {}
                // Hide on first Enter submit as a fallback
                try {
                    const ti = document.getElementById('chatInput');
                    if (ti && 'addEventListener' in ti) {
                        ti.addEventListener('keydown', (e)=>{ if (e && e.key === 'Enter' && !e.shiftKey) { hideWelcome(); } });
                    }
                } catch {}
                // Wire quick action cards if present
                try {
                    const btnNew = document.getElementById('wsNewProjectBtn');
                    const btnEdit = document.getElementById('wsEditProjectBtn');
                    if (btnNew && 'addEventListener' in btnNew) {
                        btnNew.addEventListener('click', ()=>{
                            hideWelcome();
                            try { if (typeof setModeActive === 'function') setModeActive('generate'); } catch {}
                            try { vscode.postMessage({ command: 'markGenerateFromWelcome' }); } catch {}
                            try { chatInput && chatInput.focus && chatInput.focus(); } catch {}
                        });
                    }
                    if (btnEdit && 'addEventListener' in btnEdit) {
                        btnEdit.addEventListener('click', ()=>{
                            hideWelcome();
                            // Suppress the generic "Switched to Edit mode..." announcement for this flow
                            try { suppressEditAnnouncementOnce = true; } catch {}
                            try { if (typeof setModeActive === 'function') setModeActive('edit'); } catch {}
                            try { vscode.postMessage({ command: 'requestActiveFile' }); } catch {}
                            try { vscode.postMessage({ command: 'startEditExisting' }); } catch {}
                        });
                    }
                } catch {}
            } catch {}
        })();
        function setModeActive(which) {
            try {
                const genActive = which === 'generate';
                const prevMode = currentMode;
                currentMode = genActive ? 'generate' : 'edit';

                // Show Add Context only in Edit mode (works even if mode buttons are removed)
                try { if (addContextBtn) addContextBtn.style.display = (currentMode === 'edit') ? '' : 'none'; } catch {}

                // If mode buttons exist, update their visual/aria state; otherwise skip
                if (modeGenerateBtn && modeEditBtn) {
                    modeGenerateBtn.setAttribute('aria-pressed', genActive ? 'true' : 'false');
                    modeEditBtn.setAttribute('aria-pressed', genActive ? 'false' : 'true');
                }

        // Sync dropdown visual state + label
        try {
            const mt = document.getElementById('modeText');
            const genOpt = document.getElementById('modeGenerateBtn');
            const editOpt = document.getElementById('modeEditBtn');
            if (mt) mt.textContent = genActive ? 'Generate' : 'Edit';
            if (genOpt && editOpt) {
                if (genActive) {
                    genOpt.classList.add('active'); genOpt.setAttribute('aria-selected','true');
                    editOpt.classList.remove('active'); editOpt.setAttribute('aria-selected','false');
                } else {
                    editOpt.classList.add('active'); editOpt.setAttribute('aria-selected','true');
                    genOpt.classList.remove('active'); genOpt.setAttribute('aria-selected','false');
                }
            }
            const dd = document.getElementById('modeDropdown');
            const mb = document.getElementById('modeBtn');
            if (dd && dd.classList) dd.classList.remove('open');
            if (mb) mb.setAttribute('aria-expanded','false');
        } catch {}

        // Notify extension of mode switch and reset UI state
        try { vscode.postMessage({ command: 'modeSwitch', mode: currentMode }); } catch {}
        try { hideStatusBubble(); } catch {}
        try { setGenerating(false); } catch {}

                // When switching modes, automatically start a fresh chat session
                if (prevMode !== currentMode) {
                    // Clear any pending plan state or UI before switching chats
                    try { resetFlowState(); } catch {}
                    // Bump flow to invalidate any late messages from the previous mode
                    bumpFlow();
                    // Only start a brand new chat if not explicitly told to keep the session
                    try {
                        if (!suppressNewChatOnce) {
                            startNewChatOnModeSwitch(currentMode);
                        } else {
                            // one-shot: consume the flag so next manual switch behaves normally
                            suppressNewChatOnce = false;
                        }
                    } catch {}
                }
            } catch {}
        }
        if (modeGenerateBtn && 'addEventListener' in modeGenerateBtn) {
            modeGenerateBtn.addEventListener('click', () => setModeActive('generate'));
        }
        if (modeEditBtn && 'addEventListener' in modeEditBtn) {
            modeEditBtn.addEventListener('click', () => {
                setModeActive('edit');
                try { vscode.postMessage({ command: 'startEditExisting' }); } catch {}
            });
        }
        // Auto-resize textarea like Roo Code and apply focus/drag visuals
        function autoResizeTextarea(el) {
            if (!el) return;
            try {
                el.style.height = 'auto';
                const min = 28; // compact min height
                const max = 120; // compact max height
                const target = Math.max(min, Math.min(max, el.scrollHeight + 2));
                el.style.height = target + 'px';
            } catch {}
        }
        function updateHighlights() {
            try {
                if (!highlightLayer || !chatInput) return;
                const val = (chatInput && 'value' in chatInput) ? String(chatInput.value || '') : '';
                // In the future, we could add syntax/mention highlighting here.
                highlightLayer.textContent = val;
            } catch {}
        }
        if (chatInput) {
            autoResizeTextarea(chatInput);
            if ('addEventListener' in chatInput) {
                chatInput.addEventListener('input', () => {
                    autoResizeTextarea(chatInput);
                    updateHighlights();
                    try {
                        const val = (chatInput && 'value' in chatInput) ? String(chatInput.value).trim() : '';
                        if (chatWrapper) {
                            if (val) chatWrapper.classList.add('has-content');
                            else chatWrapper.classList.remove('has-content');
                        }
                    } catch {}
                });
                chatInput.addEventListener('focus', () => { try { chatWrapper && chatWrapper.classList.add('focused'); } catch {} });
                chatInput.addEventListener('blur', () => { try { chatWrapper && chatWrapper.classList.remove('focused'); } catch {} });
            }
            // Initialize has-content state on load
            try {
                const initVal = (chatInput && 'value' in chatInput) ? String(chatInput.value).trim() : '';
                if (chatWrapper) {
                    if (initVal) chatWrapper.classList.add('has-content');
                    else chatWrapper.classList.remove('has-content');
                }
                // Force compact initial height before any typing (pure JS)
                try { if (chatInput && chatInput.style) { chatInput.style.height = '28px'; } } catch {}
                updateHighlights();
                // Re-run auto-resize shortly after first paint to stabilize height
                setTimeout(() => { try { autoResizeTextarea(chatInput); } catch {} }, 0);
            } catch {}
        }
        if (chatWrapper && 'addEventListener' in chatWrapper) {
            chatWrapper.addEventListener('dragover', (e) => { try { e.preventDefault(); chatWrapper.classList.add('dragover'); } catch {} });
            chatWrapper.addEventListener('dragleave', () => { try { chatWrapper.classList.remove('dragover'); } catch {} });
            chatWrapper.addEventListener('drop', () => { try { chatWrapper.classList.remove('dragover'); } catch {} });
        }
        // Keep send button hidden whenever stop button is visible
        try {
            if (stopBtn && typeof MutationObserver !== 'undefined') {
                const mo = new MutationObserver(() => {
                    try {
                        const running = stopBtn.classList.contains('visible');
                        if (sendBtnMirrorEl) sendBtnMirrorEl.classList.toggle('hidden', running);
                        if (sendBtnEl) sendBtnEl.classList.toggle('hidden', running);
                    } catch {}
                });
                mo.observe(stopBtn, { attributes: true, attributeFilter: ['class'] });
            }
        } catch {}
        // ----------------- Session History (webview state) -----------------
        function getState() { try { return vscode.getState() || {}; } catch { return {}; } }
        function setState(s) { try { vscode.setState(s); } catch {} }
        function uid() { return 's_' + Math.random().toString(36).slice(2, 10); }
        function nowIso() { return new Date().toISOString(); }
        function loadSessions() {
            const s = getState();
            const sessions = Array.isArray(s.sessions) ? s.sessions : [];
            return { sessions, currentSessionId: s.currentSessionId || null };
        }
        function saveSessions(sessions, currentSessionId) { setState({ ...(getState()), sessions, currentSessionId }); }
        function ensureCurrentSession() {
            const s = loadSessions();
            if (!s.currentSessionId || !s.sessions.find(x => x.id === s.currentSessionId)) {
                const id = uid();
                const sess = { id, title: 'New Session', createdAt: nowIso(), messages: [] };
                const next = [...s.sessions, sess];
                saveSessions(next, id);
                return { sessions: next, currentSessionId: id };
            }
            return s;
        }
        function deriveSessionTitleFromText(t) {
            const clean = String(t || '').trim().replace(/\s+/g, ' ');
            return clean ? (clean.length > 48 ? clean.slice(0, 48) + '…' : clean) : 'New Session';
        }
        function recordMessage(text, sender) {
            const ts = Date.now();
            const s = ensureCurrentSession();
            const idx = s.sessions.findIndex(x => x.id === s.currentSessionId);
            if (idx < 0) return;
            const sess = { ...s.sessions[idx] };
            sess.messages = [...(sess.messages || []), { sender, text: String(text || ''), ts }];
            if ((!sess.title || sess.title === 'New Session') && sender === 'user') {
                sess.title = deriveSessionTitleFromText(text);
            }
            const updated = [...s.sessions];
            updated[idx] = sess;
            saveSessions(updated, s.currentSessionId);
        }
        // Render the main chat area from stored session messages
        function renderChatFromSession(selectedId) {
            try {
                if (!messages) return;
                const s = loadSessions();
                const sid = selectedId || s.currentSessionId;
                messages.innerHTML = '';
                const sess = (s.sessions || []).find(x => x.id === sid);
                if (!sess || !Array.isArray(sess.messages)) return;
                sess.messages.forEach(m => {
                    const row = document.createElement('div');
                    row.style.marginBottom = '8px';
                    const bubble = document.createElement('div');
                    bubble.className = 'message ' + (m.sender === 'user' ? 'user' : 'ai');
                    bubble.textContent = m.text;
                    const t = document.createElement('div');
                    t.className = 'timestamp';
                    try { t.textContent = new Date(m.ts || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); } catch { t.textContent = ''; }
                    row.appendChild(bubble); row.appendChild(t); messages.appendChild(row);
                });
                try { messages.classList.add('active'); } catch {}
                try { if (mainContent) mainContent.style.display = 'flex'; } catch {}
                try { messages.scrollTop = messages.scrollHeight; } catch {}
            } catch {}
        }
        function renderHistorySessions(selectedId) {
            if (!historySessions) return;
            const s = loadSessions();
            historySessions.innerHTML = '';
            s.sessions.forEach(sess => {
                const el = document.createElement('div');
                el.className = 'session-item' + (sess.id === selectedId ? ' active' : '');
                const title = document.createElement('div'); title.className = 'session-title'; title.textContent = sess.title || 'Untitled';
                const meta = document.createElement('div'); meta.className = 'session-meta'; meta.textContent = new Date(sess.createdAt || Date.now()).toLocaleString();
                el.appendChild(title); el.appendChild(meta);
                el.addEventListener('click', () => { renderHistory(sess.id); });
                historySessions.appendChild(el);
            });
        }
        function renderHistory(selectedId) {
            const s = loadSessions();
            const sid = selectedId || s.currentSessionId;
            renderHistorySessions(sid);
            if (!historyMessages) return;
            historyMessages.innerHTML = '';
            const sess = s.sessions.find(x => x.id === sid);
            if (!sess || !sess.messages || sess.messages.length === 0) {
                const empty = document.createElement('div'); empty.className = 'history-empty'; empty.textContent = 'No messages in this session.'; historyMessages.appendChild(empty); return;
            }
            sess.messages.forEach(m => {
                const row = document.createElement('div'); row.style.marginBottom = '8px';
                const bubble = document.createElement('div'); bubble.className = 'message ' + (m.sender === 'user' ? 'user' : 'ai'); bubble.textContent = m.text;
                const t = document.createElement('div'); t.className = 'timestamp'; t.textContent = new Date(m.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                row.appendChild(bubble); row.appendChild(t); historyMessages.appendChild(row);
            });
        }
        function openHistory() {
            if (!historyOverlay) return;
            loadHistoryAssetsOnce(() => {
                try { historyOverlay.classList.add('active'); historyOverlay.setAttribute('aria-hidden','false'); } catch {}
                renderHistoryUI();
            });
        }
        function closeHistory() { if (historyOverlay) historyOverlay.classList.remove('active'); }
        function newSession() {
            const s = loadSessions();
            const id = uid();
            const sess = { id, title: 'New Session', createdAt: nowIso(), messages: [] };
            saveSessions([...(s.sessions || []), sess], id);
            renderHistory(id);
        }

        // Create a fresh chat session when the user switches between Generate/Edit
        function startNewChatOnModeSwitch(mode) {
            try {
                const s = loadSessions();
                const id = uid();
                const title = mode === 'edit' ? 'Edit Session' : 'Generate Session';
                const sess = { id, title, createdAt: nowIso(), messages: [] };
                saveSessions([...(s.sessions || []), sess], id);
                // Clear current chat UI and render the new empty session
                try {
                    if (messages) { messages.innerHTML = ''; messages.classList.add('active'); }
                    if (mainContent) mainContent.style.display = 'flex';
                } catch {}
                renderChatFromSession(id);
                // Optional: small status message to indicate the switch (avoid backticks inside template)
            } catch {}
        }
        function deleteSession() {
            const s = loadSessions();
            const sid = s.currentSessionId;
            const next = (s.sessions || []).filter(x => x.id !== sid);
            const newCurrent = next.length ? next[next.length - 1].id : null;
            saveSessions(next, newCurrent);
            renderHistory(newCurrent || undefined);
        }
        function restoreSession() {
            // Just keep selected as current and close overlay
            closeHistory();
        }
        if (openHistoryBtn && 'addEventListener' in openHistoryBtn) openHistoryBtn.addEventListener('click', openHistory);
        // Hide send immediately on click (it will be restored by setGenerating(false) when done)
        if (sendBtnMirrorEl && 'addEventListener' in sendBtnMirrorEl) {
            sendBtnMirrorEl.addEventListener('click', () => {
                try { sendBtnMirrorEl.classList.add('hidden'); } catch {}
                try { setGenerating(true); } catch {}
            });
        }
        if (sendBtnEl && 'addEventListener' in sendBtnEl) {
            sendBtnEl.addEventListener('click', () => {
                try { sendBtnEl.classList.add('hidden'); } catch {}
                try { setGenerating(true); } catch {}
            });
        }
        // Also hide on Enter key submit in the textarea (without Shift)
        if (chatInput && 'addEventListener' in chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                try {
                    const ev = e;
                    if (ev && ev.key === 'Enter' && !ev.shiftKey) {
                        if (sendBtnMirrorEl) sendBtnMirrorEl.classList.add('hidden');
                        if (sendBtnEl) sendBtnEl.classList.add('hidden');
                        try { setGenerating(true); } catch {}
                    }
                } catch {}
            });
        }
        if (closeHistoryBtn && 'addEventListener' in closeHistoryBtn) closeHistoryBtn.addEventListener('click', closeHistory);
        if (newSessionBtn && 'addEventListener' in newSessionBtn) newSessionBtn.addEventListener('click', newSession);
        if (deleteSessionBtn && 'addEventListener' in deleteSessionBtn) deleteSessionBtn.addEventListener('click', deleteSession);
        if (restoreSessionBtn && 'addEventListener' in restoreSessionBtn) restoreSessionBtn.addEventListener('click', restoreSession);
        // Wire side action buttons (stubs for now)
        if (addImageBtn && 'addEventListener' in addImageBtn) {
            addImageBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'addImagesClick' });
            });
        }
        if (enhanceBtn && 'addEventListener' in enhanceBtn) {
            enhanceBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'enhancePromptClick' });
            });
        }
        if (cancelEditBtn && 'addEventListener' in cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                // For future edit mode: clear input
                try {
                    if (chatInput && 'value' in chatInput) { chatInput.value = ''; }
                    autoResizeTextarea(chatInput);
                    updateHighlights();
                    chatWrapper && chatWrapper.classList.remove('has-content');
                } catch {}
                vscode.postMessage({ command: 'cancelEditClick' });
            });
        }
        function requestStop(source) {
            try { hideConfirm(); } catch {}
            try { hideStatusBubble(); } catch {}
            try { setGenerating(false); } catch {}
            try { pendingGenPayload = null; } catch {}
            try { vscode.postMessage({ command: 'cancelCurrent', source: source || 'user-stop' }); } catch {}
            try { vscode.postMessage({ command: 'stop', source: source || 'user-stop' }); } catch {}
        }
        // Stop button cancels the current validation/plan/generation phase
        if (stopBtn && 'addEventListener' in stopBtn) {
            stopBtn.addEventListener('click', () => {
                requestStop('user-stop');
            });
        }
        function setGenerating(on) {
            isGenerating = !!on;
            if (stopBtn) {
                const active = !!on;
                try { stopBtn.classList.toggle('visible', active); } catch {}
                try { stopBtn.disabled = !active; } catch {}
                try { stopBtn.setAttribute('aria-hidden', active ? 'false' : 'true'); } catch {}
                try {
                    if (active) stopBtn.setAttribute('tabindex', '0');
                    else stopBtn.setAttribute('tabindex', '-1');
                } catch {}
                if (!active) {
                    try { stopBtn.blur(); } catch {}
                }
            }
            try { chatWrapper && chatWrapper.classList.toggle('is-generating', !!on); } catch {}
            // Toggle Send button visibility while generating
            try {
                if (sendBtnEl) {
                    if (on) sendBtnEl.classList.add('hidden');
                    else sendBtnEl.classList.remove('hidden');
                }
                if (sendBtnMirrorEl) {
                    if (on) sendBtnMirrorEl.classList.add('hidden');
                    else sendBtnMirrorEl.classList.remove('hidden');
                }
                if (bottomPanelEl && bottomPanelEl.classList) {
                    if (on) bottomPanelEl.classList.add('generating');
                    else bottomPanelEl.classList.remove('generating');
                }
            } catch {}
            // Disable the top progress panel; rely solely on the inline status bubble (Analyzing/Validating/Generating)
            try {
                if (on) {
                    // Ensure panel is hidden while generating
                    if (progressPanel) { progressPanel.classList.remove('active'); progressPanel.classList.remove('pulse'); }
                    if (progressText) { progressText.textContent = ''; }
                } else {
                    if (progressPanel) { progressPanel.classList.remove('active'); progressPanel.classList.remove('pulse'); }
                    if (progressText) { progressText.textContent = ''; }
                }
            } catch {}
        }
        function isNonOdooNotice(text) {
            try {
                const t = String(text || '').toLowerCase();
                // Heuristics for messages like: "you're not sending an Odoo-related sentence"
                if (!t) return false;
                const patterns = [
                    'not odoo related',
                    'not an odoo',
                    'non odoo',
                    "you're not", 'you are not', 'this is not',
                    'odoo-related', 'odoo related'
                ];
                // Consider it a non-odoo notice if it mentions odoo and negation-like phrasing
                const mentionsOdoo = t.includes('odoo');
                const hasNegation = t.includes('not') || t.includes("isn't") || t.includes("isnt") || t.includes('non-');
                const matchesPatterns = patterns.some(p => t.includes(p));
                return mentionsOdoo && (hasNegation || matchesPatterns);
            } catch { return false; }
        }
        function finalizeNonOdooStop() {
            try { setGenerating(false); } catch {}
            try { if (progressPanel) progressPanel.classList.remove('active'); } catch {}
            try { if (progressText) progressText.textContent = ''; } catch {}
            try { vscode.postMessage({ command: 'cancelGeneration' }); } catch {}
        }
        function isNearBottom(el) {
            if (!el) return true;
            const threshold = 48; // px from bottom
            return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - threshold);
        }
        if (messages && 'addEventListener' in messages) {
            messages.addEventListener('scroll', () => {
                shouldAutoScroll = isNearBottom(messages);
            });
        }
        const mainContent = document.querySelector('.main-content');
        const settingsOverlay = document.getElementById('settingsOverlay');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        const providerTabs = document.getElementById('providerTabs');
        const apiKeyInput = document.getElementById('apiKey');
        const modelInput = document.getElementById('model');
        const customUrlInput = document.getElementById('customUrl');
        const customUrlField = document.getElementById('customUrlField');
        const modelsDatalist = document.getElementById('models-datalist');
        const saveStatus = document.getElementById('saveStatus');
        // Progress panel elements
        const progressPanel = document.getElementById('progressPanel');
        const bottomPanelEl = document.querySelector('.bottom-panel');
        const progressText = document.getElementById('progressText');
        const progressCancelBtn = document.getElementById('progressCancelBtn');
        // Keep a handle to (legacy) generation overlay element if present, so code paths that hide it don't throw
        const generateOverlay = document.getElementById('generateOverlay');
        // Inline version selection will be rendered as message actions
        let pendingPrompt = '';
        // Version selection state
        let awaitingVersion = false;    // waiting for user to type version in chat (custom mode)
        let pendingModuleName = '';
        let customVersionTyped = '';
        const providerDisplayNames = {
            google: 'Google',
            openai: 'OpenAI',
            anthropic: 'Anthropic',
            openrouter: 'OpenRouter',
            custom: 'Custom (OpenAI-like)'
        };
        const modelSuggestions = {
            google: ['gemini-2.5-flash', 'gemini-1.5-pro-latest'],
            openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
            anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
            openrouter: ['anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5', 'openai/gpt-4o', 'mistralai/mistral-large'],
            custom: []
        };
        let loadedSettings = { activeProvider: 'openrouter', providers: { google:{},openai:{},anthropic:{},openrouter:{},custom:{} } };

        function renderProviderTabs(activeProvider) {
            const tabs = document.getElementById('providerTabs');
            if (!tabs) return; // guard when overlay not yet present
            tabs.innerHTML = '';
            Object.keys(providerDisplayNames).forEach(p => {
                const btn = document.createElement('button');
                btn.textContent = providerDisplayNames[p];
                btn.className = 'btn';
                btn.style.padding = '6px 10px';
                btn.style.border = '1px solid var(--vscode-panel-border)';
                btn.style.borderRadius = '6px';
                btn.style.background = (p === activeProvider) ? 'var(--vscode-button-background)' : 'var(--vscode-editorWidget-background)';
                btn.style.color = (p === activeProvider) ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)';
                btn.addEventListener('click', () => {
                    loadedSettings.activeProvider = p;
                    populateFields();
                });
                tabs.appendChild(btn);
            });
        }

        function populateModelSuggestions(activeProvider) {
            const datalist = document.getElementById('models-datalist');
            if (!datalist) return;
            datalist.innerHTML = '';
            const list = (modelSuggestions[activeProvider] || []);
            list.forEach((m) => {
                const opt = document.createElement('option');
                opt.value = m;
                datalist.appendChild(opt);
            });
        }

        function updateCustomUrlVisibility() {
            const p = loadedSettings.activeProvider || 'openrouter';
            const show = p === 'openrouter' || p === 'custom';
            const field = document.getElementById('customUrlField');
            if (field) field.style.display = show ? '' : 'none';
        }

        function populateFields() {
            const p = loadedSettings.activeProvider || 'openrouter';
            renderProviderTabs(p);
            populateModelSuggestions(p);
            const cfg = (loadedSettings.providers && loadedSettings.providers[p]) || {};
            const apiKeyInputEl = document.getElementById('apiKey');
            const modelInputEl = document.getElementById('model');
            const customUrlInputEl = document.getElementById('customUrl');
            if (apiKeyInputEl) apiKeyInputEl.value = cfg.apiKey || '';
            if (modelInputEl) modelInputEl.value = cfg.model || '';
            if (customUrlInputEl) customUrlInputEl.value = cfg.customUrl || '';
            updateCustomUrlVisibility();
        }

        function ensureSettingsOverlay() {
            let overlay = document.getElementById('settingsOverlay');
            if (overlay) return overlay;
            const container = document.querySelector('.main-content') || document.body;
            const wrapper = document.createElement('div');
            wrapper.className = 'settings-overlay';
            wrapper.id = 'settingsOverlay';
            wrapper.innerHTML = `
              <div class="settings-card">
                <div class="settings-header">
                  <span>Assista X — Settings</span>
                  <button class="btn secondary" id="closeSettingsBtn">Close</button>
                </div>
                <div class="settings-body">
                  <div class="field">
                    <label>Provider</label>
                    <div id="providerTabs" style="display:flex;flex-wrap:wrap;gap:8px"></div>
                  </div>
                  <div class="field">
                    <label for="apiKey">API Key</label>
                    <input type="password" id="apiKey" placeholder="Enter API Key" />
                  </div>
                  <div class="field">
                    <label for="model">Model</label>
                    <input type="text" id="model" placeholder="e.g., gpt-4o" list="models-datalist" />
                    <datalist id="models-datalist"></datalist>
                  </div>
                  <div class="field" id="customUrlField">
                    <label for="customUrl">Custom URL</label>
                    <input type="text" id="customUrl" placeholder="https://api.example.com/v1" />
                  </div>
                  <div id="saveStatus" style="font-size:12px;color:var(--vscode-descriptionForeground);"></div>
                </div>
                <div class="settings-actions">
                  <button class="btn secondary" id="cancelSettingsBtn">Cancel</button>
                  <button class="btn primary" id="saveSettingsBtn">Save</button>
                </div>
              </div>`;
            container.appendChild(wrapper);
            // Re-bind settings elements
            try {
                // eslint-disable-next-line no-redeclare
                overlay = document.getElementById('settingsOverlay');
                // Wire buttons now that they exist (bind once)
                const closeBtn = document.getElementById('closeSettingsBtn');
                const cancelBtn = document.getElementById('cancelSettingsBtn');
                const saveBtn = document.getElementById('saveSettingsBtn');
                closeBtn && closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
                cancelBtn && cancelBtn.addEventListener('click', () => overlay.classList.remove('active'));
                saveBtn && saveBtn.addEventListener('click', () => {
                    const currentProvider = loadedSettings.activeProvider || 'openrouter';
                    const apiKeyInputEl = document.getElementById('apiKey');
                    const modelInputEl = document.getElementById('model');
                    const customUrlInputEl = document.getElementById('customUrl');
                    const settings = {
                        activeProvider: currentProvider,
                        providers: {
                            ...loadedSettings.providers,
                            [currentProvider]: {
                                apiKey: apiKeyInputEl ? apiKeyInputEl.value : '',
                                model: modelInputEl ? modelInputEl.value : '',
                                customUrl: customUrlInputEl ? customUrlInputEl.value : ''
                            }
                        }
                    };
                    try { vscode.postMessage({ command: 'saveSettings', settings }); } catch {}
                    overlay.classList.remove('active');
                });
            } catch {}
            return overlay;
        }

        function addMessage(text, sender) {
            const div = document.createElement('div');
            div.className = 'message ' + sender + ' fade-in';
            div.textContent = text;
            const ts = document.createElement('div');
            ts.className = 'timestamp';
            ts.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
            div.appendChild(ts);
            messages.appendChild(div);
            // Record to session history
            try { recordMessage(text, sender); } catch {}
            // Only auto-scroll if user hasn't scrolled up
            if (shouldAutoScroll) {
                messages.scrollTop = messages.scrollHeight;
            }
            // Keep status bubble under the latest message if visible
            try { if (statusBubbleEl) { messages.appendChild(statusBubbleEl); if (shouldAutoScroll) messages.scrollTop = messages.scrollHeight; } } catch {}
        }

        function suggestModuleName(text) {
            // naive suggestion: take words, lowercase, replace non-alnum with underscore
            const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            return base || 'my_module';
        }

        // Removed wizard flow; we now ask for version inside chat

        function addMessageHTML(html, sender) {
            const div = document.createElement('div');
            div.className = 'message ' + (sender || 'ai') + ' fade-in';
            const content = document.createElement('div');
            content.innerHTML = html;
            div.appendChild(content);
            const ts = document.createElement('div');
            ts.className = 'timestamp';
            ts.textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
            div.appendChild(ts);
            messages.appendChild(div);
            // Enhance: decorate file paths in newly added message
            try { decorateFilePaths(div); } catch {}
            // Best-effort: strip HTML to plain text for history
            try { 
                const tmp = document.createElement('div'); tmp.innerHTML = html; 
                const txt = tmp.textContent || tmp.innerText || ''; 
                recordMessage(txt, sender || 'ai'); 
            } catch {}
            if (shouldAutoScroll) messages.scrollTop = messages.scrollHeight;
            // Keep status bubble under the latest message if visible
            try { if (statusBubbleEl) { messages.appendChild(statusBubbleEl); if (shouldAutoScroll) messages.scrollTop = messages.scrollHeight; } } catch {}
        }

        function sendMessage() {
            const ti = document.getElementById('chatInput');
            const text = (ti && 'value' in ti) ? String((ti).value).trim() : '';
            if (!text) return;
            // Ensure chat view is visible
            if (messages) messages.classList.add('active');
            if (mainContent) mainContent.style.display='flex';
            // Close any overlays that might block interaction
            try { if (historyOverlay) { historyOverlay.classList.remove('active'); historyOverlay.setAttribute('aria-hidden','true'); } } catch {}
            try { if (settingsOverlay) settingsOverlay.classList.remove('active'); } catch {}
            try { if (generateOverlay) generateOverlay.classList.remove('active'); } catch {}
            // Show user message immediately
            addMessage(text, 'user');
            // Always show Stop button right after sending; hide Send button
            try { setGenerating(true); } catch {}
            // Only show a status bubble immediately in Edit mode (Generate waits for specific phases)
            if (currentMode === 'edit') {
                try { showStatusBubble('Analyzing'); } catch {}
            }
            // Edit mode: no version prompt, route to editRequest
            if (currentMode === 'edit') {
                // Exit silent mode once the user starts an edit conversation
                editSilentMode = false;
                // Clear any existing plan so confirms cannot latch onto stale plan state
                try {
                    planActive = false;
                    planState = { total: 0, done: 0, sections: { requirements: '', tasks: '', menu: '' } };
                    planUpdatedAt = 0;
                    // Re-render (empties the plan card if present)
                    try { renderPlan(); } catch {}
                    hideConfirm();
                } catch {}
                try { vscode.postMessage({ command: 'editRequest', text, context: Array.isArray(contextItems) ? contextItems : [], flowId: currentFlowId }); } catch {}
                // Clear input and return
                if (ti && 'value' in ti) { 
                    try { 
                        (ti).value = ''; 
                        autoResizeTextarea(ti);
                        updateHighlights();
                        chatWrapper && chatWrapper.classList.remove('has-content');
                    } catch {} 
                }
                return;
            }
            // Generate mode flow
            if (awaitingVersion) {
                // Treat this message as the custom version input
                const v = text;
                // Basic validation: numbers with optional dot (e.g., 15 or 15.0)
                if (!/^\d+(?:\.\d+)?$/.test(v)) {
                    addMessage('Please enter a valid version number like 15 or 15.0', 'ai');
                    return;
                }
                customVersionTyped = v;
                awaitingVersion = false;
                // Proceed with generation now that we have the version
                const nameVal = pendingModuleName;
                if (!/^([a-z0-9_]+)$/.test(nameVal)) {
                    addMessage('Module name is invalid. Please try again.', 'ai');
                    return;
                }
                // After version is provided, first request a build plan preview (no generating yet)
                // Hide the version selection bubble from chat
                try {
                    const verMsg = document.querySelector('.seg-group [data-version-choice]')?.closest('.message');
                    if (verMsg && verMsg.parentElement) verMsg.parentElement.removeChild(verMsg);
                } catch {}
                try { showStatusBubble('Processing'); } catch {}
                vscode.postMessage({ command: 'requestPlan', prompt: pendingPrompt, version: customVersionTyped, moduleName: nameVal, context: Array.isArray(contextItems) ? contextItems : [] });
            } else {
                // Store prompt, validate first before asking for version
                pendingPrompt = text;
                pendingModuleName = suggestModuleName(text).slice(0,64);
                // Show a lightweight Validating bubble while we validate before asking for version
                try { showStatusBubble('Validating'); } catch {}
                try { vscode.postMessage({ command: 'validatePrompt', prompt: pendingPrompt, context: Array.isArray(contextItems) ? contextItems : [], flowId: currentFlowId }); } catch {}
            }
            if (ti && 'value' in ti) { 
                try { 
                    (ti).value = ''; 
                    autoResizeTextarea(ti);
                    updateHighlights();
                    chatWrapper && chatWrapper.classList.remove('has-content');
                } catch {} 
            }
        }

        if (chatInput && 'addEventListener' in chatInput) {
            chatInput.addEventListener('keydown', function(e) {
                if (e && e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    try { hideConfirm(); } catch {}
                    sendMessage();
                }
            });
        }
        // Wire up Send button (CSP-safe: no inline onclick)
        if (sendBtn && 'addEventListener' in sendBtn) {
            sendBtn.addEventListener('click', () => { hideConfirm(); sendMessage(); });
        }
        // Stop button wiring handled earlier via requestStop()

        // Global click delegation to keep buttons working even if DOM is recreated
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!t || !(t instanceof Element)) return;
            // Send button
            if (t.closest && t.closest('#sendBtn')) {
                e.preventDefault();
                try { hideConfirm(); } catch {}
                return void sendMessage();
            }
            // Mirrored send button in compact row
            if (t.closest && t.closest('#sendBtnMirror')) {
                e.preventDefault();
                try { hideConfirm(); } catch {}
                return void sendMessage();
            }
            // Mode button toggles dropdown
            if (t.closest && t.closest('#modeBtn')) {
                e.preventDefault();
                const dd = document.getElementById('modeDropdown');
                const mb = document.getElementById('modeBtn');
                if (dd && dd.classList) {
                    const open = dd.classList.toggle('open');
                    if (mb) mb.setAttribute('aria-expanded', open ? 'true' : 'false');
                }
                return;
            }
            // Mode generate button
            if (t.closest && t.closest('#modeGenerateBtn')) {
                e.preventDefault();
                try { setModeActive('generate'); } catch {}
                return;
            }
            // Mode edit button
            if (t.closest && t.closest('#modeEditBtn')) {
                e.preventDefault();
                try { setModeActive('edit'); } catch {}
                try { vscode.postMessage({ command: 'startEditExisting' }); } catch {}
                return;
            }
            // Click outside closes dropdown
            const dd = document.getElementById('modeDropdown');
            if (dd && dd.classList && !t.closest('.mode-selector')) {
                dd.classList.remove('open');
                const mb = document.getElementById('modeBtn');
                if (mb) mb.setAttribute('aria-expanded','false');
            }
            // Settings overlay buttons (if dynamically created)
            if (t.id === 'closeSettingsBtn' || t.id === 'cancelSettingsBtn') {
                const ov = document.getElementById('settingsOverlay');
                if (ov) ov.classList.remove('active');
                return;
            }
            if (t.id === 'saveSettingsBtn') {
                const currentProvider = loadedSettings.activeProvider || 'openrouter';
                const apiKeyInputEl = document.getElementById('apiKey');
                const modelInputEl = document.getElementById('model');
                const customUrlInputEl = document.getElementById('customUrl');
                const settings = {
                    activeProvider: currentProvider,
                    providers: {
                        ...loadedSettings.providers,
                        [currentProvider]: {
                            apiKey: apiKeyInputEl ? apiKeyInputEl.value : '',
                            model: modelInputEl ? modelInputEl.value : '',
                            customUrl: customUrlInputEl ? customUrlInputEl.value : ''
                        }
                    }
                };
                try { vscode.postMessage({ command: 'saveSettings', settings }); } catch {}
                const ov = document.getElementById('settingsOverlay');
                if (ov) ov.classList.remove('active');
                return;
            }
        }, true);

        // Close overlays on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            let changed = false;
            const ov1 = document.getElementById('settingsOverlay');
            if (ov1 && ov1.classList.contains('active')) { ov1.classList.remove('active'); changed = true; }
            const ov2 = document.getElementById('historyOverlay');
            if (ov2 && ov2.classList.contains('active')) { ov2.classList.remove('active'); changed = true; }
            if (changed) { e.preventDefault(); e.stopPropagation(); }
        }, true);

        function hideConfirm(){
            try {
                if (confirmBar) {
                    confirmBar.classList.remove('visible');
                    confirmBar.setAttribute('aria-hidden','true');
                }
            } catch {}
        }

        // Proceed/Cancel actions for confirmation bar
        if (proceedBtn && 'addEventListener' in proceedBtn) {
            proceedBtn.addEventListener('click', () => {
                // Post-task flow: Start New Chat
                try {
                    if (confirmBar && confirmBar.dataset && confirmBar.dataset.mode === 'posttask') {
                        try { setModeActive('generate'); } catch {}
                        try { startNewChatOnModeSwitch('generate'); } catch {}
                        try { hideConfirm(); } catch {}
                        return;
                    }
                } catch {}
                // If we have a pending plan for generation, start it now
                if (pendingGenPayload && pendingGenPayload.version && pendingGenPayload.moduleName && pendingGenPayload.prompt) {
                    try { setGenerating(true); } catch {}
                    try { showStatusBubble('Analyzing'); } catch {}
                    try { vscode.postMessage({ command: 'beginGenerateModule', prompt: pendingGenPayload.prompt, version: pendingGenPayload.version, moduleName: pendingGenPayload.moduleName, context: Array.isArray(contextItems) ? contextItems : [], flowId: currentFlowId }); } catch {}
                    pendingGenPayload = null;
                } else {
                    // Edit flow: user approved applying the plan
                    try { setGenerating(true); } catch {}
                    try { showStatusBubble('Applying plan'); } catch {}
                    try { vscode.postMessage({ type: 'confirmProceed' }); } catch {}
                }
                try { hideConfirm(); } catch {}
            });
        }
        if (cancelBtn && 'addEventListener' in cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                // If a plan was pending for generation, clear it silently
                pendingGenPayload = null;
                // Show a small notice in chat about cancellation
                try { addMessage('Canceled by user.', 'ai'); } catch {}
                try { vscode.postMessage({ type: 'confirmCancel' }); } catch {}
                try { hideStatusBubble(); } catch {}
                try { setGenerating(false); } catch {}
                try { hideConfirm(); } catch {}
            });
        }

        // Segmented toggle for Code/Chat view
        const viewCodeBtn = document.getElementById('viewCodeBtn');
        const viewChatBtn = document.getElementById('viewChatBtn');
        function setViewActive(tab) {
            try {
                const isChat = tab === 'chat';
                if (viewCodeBtn) viewCodeBtn.setAttribute('aria-pressed', (!isChat).toString());
                if (viewChatBtn) viewChatBtn.setAttribute('aria-pressed', isChat.toString());
                if (isChat) {
                    messages.classList.add('active');
                    mainContent.style.display = 'flex';
                    shouldAutoScroll = true;
                    try { messages.scrollTop = messages.scrollHeight; } catch {}
                } else {
                    messages.classList.remove('active');
                    mainContent.style.display = 'flex';
                }
                hideConfirm();
                vscode.postMessage({ command: 'buttonClick', button: tab, flowId: currentFlowId });
            } catch {}
        }
        if (viewCodeBtn && 'addEventListener' in viewCodeBtn) viewCodeBtn.addEventListener('click', () => setViewActive('code'));
        if (viewChatBtn && 'addEventListener' in viewChatBtn) viewChatBtn.addEventListener('click', () => setViewActive('chat'));

        // Helper: render/update the Current File chip in the top-row
        function renderActiveFileChip(info){
            try {
                const host = document.getElementById('contextChips');
                if (!host) return;
                // Only show current file chip in Edit mode
                try { if (typeof currentMode !== 'undefined' && currentMode !== 'edit') return; } catch {}
                if (!info || !info.fileName) return;
                // Cache the latest info
                lastActiveFileInfo = info;
                // Reuse or create the current-file chip
                let chip = host.querySelector('.current-file-chip');
                if (!chip) {
                    chip = document.createElement('div');
                    chip.className = 'chip current-file-chip';
                    const icon = document.createElement('span'); icon.className = 'chip-icon'; icon.setAttribute('aria-hidden','true');
                    const name = document.createElement('span'); name.className = 'chip-text';
                    const badge = document.createElement('span'); badge.className = 'chip-badge'; badge.textContent = 'Current file';
                    chip.appendChild(icon);
                    chip.appendChild(name);
                    chip.appendChild(badge);
                }
                const nameEl = chip.querySelector('.chip-text');
                if (nameEl) nameEl.textContent = info.fileName;
                chip.title = info.fullPath || info.fileName;
                // Ensure current file chip stays at the beginning
                if (host.firstChild !== chip) {
                    host.insertBefore(chip, host.firstChild);
                }
            } catch {}
        }

        window.addEventListener('message', e => {
            const msg = e.data;
            // Drop any message that carries a mismatched flowId, except a small allowlist
            try {
                const cmd = String(msg?.command || '');
                const allowRegardless = (cmd === 'postGenActions' || cmd === 'activeFile' || cmd === 'contextAdded');
                if (typeof msg?.flowId === 'number' && msg.flowId !== currentFlowId && !allowRegardless) {
                    return;
                }
            } catch {}
            // Sidebar confirm bar: post-generation actions
            if (msg && msg.command === 'postGenActions') {
                try {
                    if (confirmBar) {
                        confirmBar.dataset.mode = 'postgen';
                        confirmBar.classList.add('visible');
                        confirmBar.setAttribute('aria-hidden','false');
                        try { confirmBar.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch {}
                    }
                    if (confirmLabel) {
                        // Use the exact wording requested by product: no module name suffix
                        confirmLabel.textContent = 'Do you want to continue the module generation or Edit?';
                    }
                    if (proceedBtn) {
                        proceedBtn.textContent = 'Edit';
                        proceedBtn.setAttribute('aria-label', 'Edit');
                        proceedBtn.onclick = () => {
                            try { hideConfirm(); } catch {}
                            try { vscode.postMessage({ command: 'postGenChoose', choice: 'edit', flowId: currentFlowId }); } catch {}
                        };
                        try { proceedBtn.focus(); } catch {}
                    }
                    if (cancelBtn) {
                        cancelBtn.textContent = 'Continue';
                        cancelBtn.setAttribute('aria-label', 'Continue');
                        cancelBtn.onclick = () => {
                            try { hideConfirm(); } catch {}
                            try { vscode.postMessage({ command: 'postGenChoose', choice: 'generate', flowId: currentFlowId }); } catch {}
                        };
                    }
                } catch {}
                return;
            }
            // Active file broadcast from extension
            if (msg && msg.command === 'activeFile') {
                // Always remember the latest active file info
                try { lastActiveFileInfo = msg || null; } catch {}
                // Render only if in Edit mode (renderActiveFileChip guards this)
                renderActiveFileChip(msg);
                return;
            }

            // Accept picker response and delegate to unified renderer (no legacy DOM)
            if (msg && msg.command === 'contextAdded' && Array.isArray(msg.items)) {
                try {
                    const list = msg.items.map(x=>({
                        path: String(x.path || '').replace(/\\/g,'/'),
                        kind: String(x.type || 'file') === 'folder' ? 'folder' : 'file'
                    })).filter(x=>!!x.path);
                    // Merge into contextItems used by renderContextChips()
                    const toAdd = list.map(l=>({ type: l.kind, name: l.path.split('/').pop() || l.path, path: l.path }));
                    const existing = new Set(contextItems.map(i=>i.path));
                    toAdd.forEach(i=>{ if (!existing.has(i.path)) { contextItems.push(i); existing.add(i.path); } });
                    renderContextChips();
                    try { setState({ ...(getState()), contextItems }); } catch {}
                } catch {}
                return;
            }

            // External request to switch mode (e.g., after generation completes)
            if (msg && msg.command === 'switchMode') {
                const mode = String(msg.mode || '').toLowerCase();
                const keep = !!msg.keepSession;
                if (mode === 'edit') {
                    if (keep) { suppressNewChatOnce = true; }
                    try { setModeActive('edit'); } catch {}
                    // Hide any lingering post-task confirm bar now that we're in Edit
                    try { hideConfirm(); } catch {}
                    // Kick off Edit flow immediately
                    try { vscode.postMessage({ command: 'requestActiveFile' }); } catch {}
                    try { vscode.postMessage({ command: 'startEditExisting' }); } catch {}
                    // If we already know active file, render chip and announce
                    if (lastActiveFileInfo) {
                        try { renderActiveFileChip(lastActiveFileInfo); } catch {}
                        // Do not post any announcement message in chat when entering Edit mode
                        // (requirement: silently switch without extra AI bubble)
                        try { suppressEditAnnouncementOnce = false; } catch {}
                    }
                } else if (mode === 'generate') {
                    if (keep) { suppressNewChatOnce = true; }
                    try { setModeActive('generate'); } catch {}
                }
                return;
            }

            // Hard guard: if we've switched to Edit, ignore any late Generate-flow UI
            const isGenerateOnly = (cmd)=>{
                return (
                    // keep confirmApplyPlan allowed in Edit too (used for plan confirmation)
                    cmd === 'clearConfirm' ||
                    // IMPORTANT: allow statusBubble in Edit so we can hide/show inline progress during Edit
                    // cmd === 'statusBubble' ||
                    cmd === 'generationMessage' ||
                    cmd === 'generationStart' ||
                    cmd === 'generationComplete'
                );
            };
            if (currentMode === 'edit' && isGenerateOnly(String(msg?.command||''))) {
                return; // drop stale generate-related UI when in Edit
            }

            // Start of Edit flow: enable strict silent mode to avoid showing any file lists/summaries
            if (msg.command === 'editStart') {
                try {
                    editSilentMode = true;
                } catch {}
                return;
            }

            // Focus the chat input inside the sidebar (used for Edit mode prompt entry)
            if (msg.command === 'focusChatInput') {
                try {
                    const ti = document.getElementById('chatInput');
                    if (ti && 'focus' in ti) {
                        if (msg.placeholder && 'setAttribute' in ti) {
                            try { ti.setAttribute('placeholder', String(msg.placeholder)); } catch {}
                        }
                        try { (ti).focus(); } catch {}
                    }
                } catch {}
                return;
            }

            // Helper to suppress long Odoo settings explainer messages
            function shouldSuppress(raw) {
                const t = String(raw || '');
                const tl = t.toLowerCase();
                return (
                    t.startsWith('Excellent! When settings are saved in Odoo') ||
                    t.startsWith('Understood. When settings are saved in Odoo') ||
                    t.startsWith('Great! When settings are saved in Odoo') ||
                    t.startsWith("Great! If you've just saved settings in Odoo") ||
                    t.startsWith('Great! After saving settings in Odoo') ||
                    tl.includes('great to hear your settings are saved') ||
                    // Suppress any legacy edit summaries or file lists in Edit mode
                    t.includes('Edit Existing Odoo Project') ||
                    t.includes('Total files:') ||
                    t.includes('Sample files') ||
                    t.includes('<h2>Edit Existing Odoo Project') ||
                    (
                        (
                            tl.includes('settings are saved in odoo') ||
                            tl.includes('saved settings in odoo') ||
                            tl.includes('settings in odoo') ||
                            tl.includes('odoo settings')
                        ) && (
                            tl.includes('ir.config_parameter') ||
                            tl.includes('res.config.settings')
                        )
                    )
                );
            }

            // Handle confirmation requests to apply a planned edit
            if (msg.command === 'confirmApplyPlan') {
                try {
                    // Update label and buttons to standard Proceed/Cancel
                    if (confirmLabel && 'textContent' in confirmLabel) {
                        const p = (msg.prompt || '').toString();
                        confirmLabel.textContent = p ? 'Proceed to apply this plan?' : 'Proceed with the planned changes?';
                    }
                    try {
                        if (proceedBtn) { proceedBtn.textContent = 'Proceed'; proceedBtn.setAttribute('aria-label', 'Proceed'); }
                        if (cancelBtn) { cancelBtn.textContent = 'Cancel'; cancelBtn.setAttribute('aria-label', 'Cancel'); }
                        if (confirmBar && confirmBar.dataset) { delete confirmBar.dataset.mode; }
                    } catch {}

                    // Store payload to trigger generation on Proceed
                    try {
                        pendingGenPayload = {
                            prompt: String(msg.promptText || ''),
                            version: String(msg.version || ''),
                            moduleName: String(msg.moduleName || '')
                        };
                    } catch {}

                    // Only show confirm bar if a recent plan exists; otherwise request a resend
                    let canShow = false;
                    try {
                        const hasPlan = planActive && (
                            (planState.sections && (planState.sections.requirements || planState.sections.tasks))
                        );
                        const fresh = (Date.now() - planUpdatedAt) < 5000; // 5s freshness window
                        canShow = !!hasPlan && !!fresh;
                    } catch {}
                    if (!canShow) {
                        hideConfirm();
                        try { vscode.postMessage({ command: 'requestPlanResend', flowId: currentFlowId }); } catch {}
                        return;
                    }
                    // Show the confirm bar now that plan is present
                    if (confirmBar) {
                        confirmBar.classList.add('visible');
                        confirmBar.setAttribute('aria-hidden', 'false');
                    }
                } catch {}
                return;
            }
            if (msg.command === 'clearConfirm') {
                try {
                    confirmBar && confirmBar.classList.remove('visible');
                    if (confirmBar) confirmBar.setAttribute('aria-hidden', 'true');
                } catch {}
                return;
            }

            if (msg.command === 'aiReply') {
                // Any assistant reply should end the generating state for simple chats
                try { setGenerating(false); } catch {}
                // Hide any stale confirm bar on general replies
                hideConfirm();
                // Hide status bubble on normal replies
                try { hideStatusBubble(); } catch {}
                // While in edit silent mode, suppress general aiReply messages except critical errors
                if (editSilentMode) {
                    const t = String(msg.text || '');
                    const tl = t.toLowerCase();
                    const isCritical = (
                        tl.includes('no workspace is open') ||
                        tl.includes('no odoo module') ||
                        tl.includes('no active editor') ||
                        tl.includes('no active file') ||
                        tl.includes('open a file') ||
                        tl.includes('open an editor')
                    );
                    if (!isCritical) {
                        return; // fully suppress
                    }
                }
                if (!shouldSuppress(msg.text)) {
                    addMessage(msg.text, 'ai');
                }
                // If assistant indicates non-Odoo content, stop immediately and hide Stop
                if (isNonOdooNotice(msg.text)) {
                    finalizeNonOdooStop();
                }
            }
            if (msg.command === 'aiReplyHtml') {
                try { setGenerating(false); } catch {}
                hideConfirm();
                // Allow plan and summary in Edit (kinds: 'plan' or 'summary');
                // otherwise suppress while in Edit/silent mode
                const kind = String(msg.kind || '');
                const isPlan = kind === 'plan';
                const isSummary = kind === 'summary';
                if ((currentMode !== 'generate' || editSilentMode) && !(isPlan || isSummary)) { return; }
                // When our Dev-main plan panel is active, hide legacy Build Plan bubble
                if (isPlan && planActive) { return; }
                const html = String(msg.html || '');
                if (html) addMessageHTML(html, 'ai');
                // After showing the plan, stop showing analyzing; wait for explicit Proceed to show Generating
                try { hideStatusBubble(); } catch {}
                return;
            }
            // Handle validation result prior to version selection in Generate mode
            if (msg.command === 'validationResult') {
                try {
                    const ok = !!msg.ok || !!msg.is_odoo_request;
                    if (ok) {
                        // Hide the validating bubble before showing version choices
                        try { hideStatusBubble(); } catch {}
                        // Render the same inline version choices as before
                        addMessageHTML(
                            '<div>Choose Odoo version:</div>' +
                            '<div class="msg-actions"><div class="seg-group" role="radiogroup" aria-label="Odoo Version">' +
                            '<button type="button" class="seg-btn" data-version-choice="18.0">18</button>' +
                            '<button type="button" class="seg-btn" data-version-choice="17.0">17</button>' +
                            '<button type="button" class="seg-btn" data-version-choice="16.0">16</button>' +
                            '<button type="button" class="seg-btn" data-version-custom="1">Custom</button>' +
                            '</div></div>',
                            'ai'
                        );
                        // Do not show status bubble yet; wait until version is selected
                    } else {
                        const reason = String(msg.reason || 'This does not look like an Odoo module request.');
                        addMessage(reason, 'ai');
                        try { setGenerating(false); } catch {}
                        try { hideStatusBubble(); } catch {}
                    }
                } catch {}
                return;
            }
            if (msg.command === 'statusBubble') {
                try {
                    const action = String(msg.action || '');
                    const label = String(msg.label || '');
                    if (action === 'show') {
                        showStatusBubble(label || 'Working');
                    } else if (action === 'update') {
                        updateStatusBubble(label || 'Working');
                    } else if (action === 'hide') {
                        hideStatusBubble();
                        // Also clear generating state so Stop button hides and Send returns
                        try { setGenerating(false); } catch {}
                    }
                } catch {}
                return;
            }
            // Note: Do not return early on 'generationComplete' here.
            // The comprehensive handler below is responsible for showing the post-task confirmation bar.
            if (msg.command === 'editContext') {
                // Legacy: handle silently, do not render any file list or HTML
                try {
                    const s = getState();
                    setState({ ...s, editModuleRoot: msg.moduleRoot || null });
                } catch {}
            }
            if (msg.command === 'editReady') {
                // Silent: store selected module root, do not render any chat message
                try {
                    const s = getState();
                    setState({ ...s, editModuleRoot: msg.moduleRoot || null });
                } catch {}
            }
            if (msg.command === 'generationStart') {
                // In Generate mode, ensure silent mode is off so messages render
                try { if (currentMode === 'generate') { editSilentMode = false; } } catch {}
                // In edit silent mode, do not show any generation start messages
                if (editSilentMode) { return; }
                try { setGenerating(true); } catch {}
                const t = String(msg.message || '').toLowerCase();
                if (t.includes('analyz')) {
                    showStatusBubble('Analyzing');
                } else {
                    showStatusBubble('Generating');
                }
                return;
            }
            // Dev-main style planning events
            if (msg && msg.command === 'planReset') {
                // Start of a fresh plan: clear state and hide any stale confirm bar
                try { planState = { total: 0, done: 0, sections: { requirements: '', tasks: '', menu: '' } }; } catch {}
                try { hideConfirm(); } catch {}
                try { planActive = true; renderPlan(); } catch {}
                try { planUpdatedAt = Date.now(); } catch {}
                // Hide processing while plan is displayed
                try { setGenerating(false); } catch {}
                try { hideStatusBubble(); } catch {}
                return;
            }
            if (msg && msg.command === 'planSection') {
                try {
                    const sec = String(msg.section || '');
                    const md = String(msg.markdown || '');
                    if (sec === 'requirements') planState.sections.requirements = md;
                    else if (sec === 'tasks') planState.sections.tasks = md;
                    else if (sec === 'menu') planState.sections.menu = md;
                    planUpdatedAt = Date.now();
                    planActive = true; renderPlan();
                    // As soon as tasks section shows, hide processing and wait for Proceed
                    if (sec === 'tasks') { try { setGenerating(false); } catch {} try { hideStatusBubble(); } catch {} }
                } catch {}
                return;
            }
            if (msg && msg.command === 'planProgress') {
                try {
                    if (typeof msg.total === 'number') { planState.total = msg.total; planState.done = msg.done|0; }
                    if (typeof msg.inc === 'number') { planState.done = Math.max(0, (planState.done|0) + msg.inc); }
                    // Progress is hidden in UI per request; still keep state for potential future use
                    renderPlan();
                } catch {}
                return;
            }
            // When the confirm bar is shown for proceeding, stop showing processing
            if (msg && msg.command === 'confirmApplyPlan') {
                // Only allow confirm bar when there is an active plan; otherwise request a resend
                try { setGenerating(false); } catch {}
                try { hideStatusBubble(); } catch {}
                try {
                    const hasPlan = planActive && (
                        (planState.sections && (planState.sections.requirements || planState.sections.tasks))
                    );
                    const fresh = (Date.now() - planUpdatedAt) < 5000; // 5s freshness window
                    if (!hasPlan || !fresh) {
                        // No plan to confirm yet; ensure confirm bar is hidden and ask backend to resend
                        hideConfirm();
                        vscode.postMessage({ command: 'requestPlanResend' });
                        return; // do not proceed to show confirm bar
                    }
                } catch {}
                // allow confirm bar rendering to proceed via existing logic elsewhere
            }
            // Legacy bridge: showPlan { requirements, tasks, ... }
            if (msg && msg.command === 'showPlan') {
                try {
                    planActive = true;
                    planState.sections.tasks = String(msg.tasks || msg.html || '');
                    planState.sections.requirements = String(msg.requirements || '');
                    planUpdatedAt = Date.now();
                    renderPlan();
                    // Hide processing while plan is displayed
                    try { setGenerating(false); } catch {}
                    try { hideStatusBubble(); } catch {}
                } catch {}
                return;
            }
            if (msg.command === 'generationMessage') {
                // In Generate mode, ensure silent mode is off so messages render
                try { if (currentMode === 'generate') { editSilentMode = false; } } catch {}
                if (editSilentMode) { return; }
                const t = (msg && msg.text) ? String(msg.text) : '';
                if (t) addMessage(t, 'ai');
                // Switch to Generating when file work begins
                try {
                    const tl = t.toLowerCase();
                    if (tl.includes('file.started') || tl.includes('generating') || tl.includes('file ')) {
                        updateStatusBubble('Generating');
                    }
                } catch {}
                // Detect non-Odoo notice in streamed messages as well
                if (isNonOdooNotice(t)) {
                    finalizeNonOdooStop();
                }
            }
            if (msg.command === 'generationWarning') {
                // In Generate mode, ensure silent mode is off so messages render
                try { if (currentMode === 'generate') { editSilentMode = false; } } catch {}
                if (editSilentMode) { return; }
                const t = (msg && msg.text) ? String(msg.text) : '';
                if (t) addMessage(t, 'ai');
            }
            // Never render fileGenerated lines in the sidebar chat (avoid file list output entirely)
            if (msg.command === 'fileGenerated') {
                return;
            }
            if (msg.command === 'generationComplete') {
                // In Generate mode, ensure silent mode is off so messages render
                try { if (currentMode === 'generate') { editSilentMode = false; } } catch {}
                if (editSilentMode) { return; }
                const t = (msg && msg.text) ? String(msg.text) : '';
                if (t) addMessage(t, 'ai');
                try { setGenerating(false); } catch {}
                try { hideStatusBubble(); } catch {}
                // Show a tailored confirm bar after module generation
                if (msg && msg.modulePath) {
                    try {
                        if (confirmBar) {
                            confirmBar.dataset.mode = 'postgen';
                            confirmBar.classList.add('visible');
                            confirmBar.setAttribute('aria-hidden', 'false');
                            try { confirmBar.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch {}
                        }
                        if (confirmLabel) {
                            confirmLabel.textContent = 'Do you want to continue module generation?';
                        }
                        if (proceedBtn) {
                            proceedBtn.textContent = 'Edit module';
                            proceedBtn.setAttribute('aria-label', 'Edit module');
                            proceedBtn.onclick = () => {
                                try { hideConfirm(); } catch {}
                                try { vscode.postMessage({ command: 'postGenChoose', choice: 'edit', flowId: currentFlowId }); } catch {}
                            };
                        }
                        if (cancelBtn) {
                            cancelBtn.textContent = 'Continue creating';
                            cancelBtn.setAttribute('aria-label', 'Continue creating');
                            cancelBtn.onclick = () => {
                                try { hideConfirm(); } catch {}
                                try { vscode.postMessage({ command: 'postGenChoose', choice: 'generate', flowId: currentFlowId }); } catch {}
                            };
                        }
                    } catch {}
                } else {
                    // Fallback for non-generation tasks
                    showPostTaskConfirm();
                }
                // Do not auto-switch modes here. Wait for user's choice via the confirmation bar.
                return;
            }
            if (msg.command === 'taskComplete') {
                // Generic completion hook from extension (for edit or other tasks)
                try { setGenerating(false); } catch {}
                try { hideStatusBubble(); } catch {}
                showPostTaskConfirm();
                return;
            }
            if (msg.command === 'newChat') {
                // Reset UI and create a brand new session, then force-show Welcome screen
                try { resetFlowState(); } catch {}
                try { if (historyOverlay) { historyOverlay.classList.remove('active'); historyOverlay.setAttribute('aria-hidden','true'); } } catch {}
                try { if (settingsOverlay) settingsOverlay.classList.remove('active'); } catch {}
                try { if (generateOverlay) generateOverlay.classList.remove('active'); } catch {}
                // Clear chat area and any inline status bubble
                try { messages.innerHTML = ''; } catch {}
                try { hideStatusBubble(); } catch {}
                try { hideConfirm(); } catch {}
                try { setGenerating(false); } catch {}
                // Clear only the current-file chip; preserve user-selected context chips
                try {
                    const host = document.getElementById('contextChips');
                    if (host) {
                        const cf = host.querySelector('.current-file-chip');
                        if (cf) host.removeChild(cf);
                    }
                } catch {}
                // Create a new empty session and make it current
                try {
                    const s = loadSessions();
                    const id = uid();
                    const sess = { id, title: 'New Session', createdAt: nowIso(), messages: [] };
                    const next = [...(s.sessions || []), sess];
                    saveSessions(next, id);
                } catch {}
                // Clear input visuals
                try {
                    if (chatInput && 'value' in chatInput) { chatInput.value = ''; }
                    autoResizeTextarea(chatInput);
                    updateHighlights();
                    chatWrapper && chatWrapper.classList.remove('has-content');
                } catch {}
                // Force show the welcome screen immediately (do not rely solely on MutationObserver)
                try {
                    const welcome = document.getElementById('welcomeScreen');
                    if (welcome) {
                        welcome.style.display = 'flex';
                        welcome.classList.add('active');
                        welcome.setAttribute('aria-hidden','false');
                    }
                    if (messages) messages.classList.remove('active');
                    try { document.body && document.body.classList && document.body.classList.add('welcome-active'); } catch {}
                } catch {}
                return;
            }
            if (msg.command === 'openHistory') {
                // Show history overlay and render external UI
                try { if (mainContent) mainContent.style.display = 'flex'; } catch {}
                try { if (messages) messages.classList.remove('active'); } catch {}
                try { if (generateOverlay) generateOverlay.classList.remove('active'); } catch {}
                openHistory();
            }
            if (msg.command === 'openSettings') {
                // Make sure the container that holds the overlay is visible
                try { if (mainContent) mainContent.style.display = 'flex'; } catch {}
                try { if (messages) messages.classList.remove('active'); } catch {}
                // Ensure history overlay is closed so settings can appear
                try { if (historyOverlay) { historyOverlay.classList.remove('active'); historyOverlay.setAttribute('aria-hidden','true'); } } catch {}
                // Ensure generation overlay is closed
                try { if (generateOverlay) generateOverlay.classList.remove('active'); } catch {}
                let overlay = settingsOverlay || ensureSettingsOverlay();
                if (overlay) {
                    overlay.classList.add('active');
                } else {
                    console.warn('[Assista X Webview] settingsOverlay element not found');
                }
                // Request current settings when opening
                try { vscode.postMessage({ command: 'loadSettings' }); } catch {}
            }
            if (msg.command === 'loadSettings') {
                loadedSettings = Object.assign({ activeProvider: 'openrouter', providers: {} }, msg.settings || {});
                populateFields();
            }
            if (msg.command === 'saveSuccess') {
                // Suppress success message per user preference
                if (saveStatus) saveStatus.textContent = '';
            }
            if (msg.command === 'saveError') {
                if (saveStatus) saveStatus.textContent = 'Failed to save settings.';
            }
        });

        // Settings overlay controls
        closeSettingsBtn?.addEventListener('click', () => settingsOverlay.classList.remove('active'));
        cancelSettingsBtn?.addEventListener('click', () => settingsOverlay.classList.remove('active'));
        saveSettingsBtn?.addEventListener('click', () => {
            const currentProvider = loadedSettings.activeProvider || 'openrouter';
            const settings = {
                activeProvider: currentProvider,
                providers: {
                    ...loadedSettings.providers,
                    [currentProvider]: {
                        apiKey: apiKeyInput ? apiKeyInput.value : '',
                        model: modelInput ? modelInput.value : '',
                        customUrl: customUrlInput ? customUrlInput.value : ''
                    }
                }
            };
            vscode.postMessage({ command: 'saveSettings', settings });
            settingsOverlay.classList.remove('active');
            // No chat message on successful save (suppressed)
        });

        // Version buttons inside chat message
        function startWithVersion(ver) {
            if (!pendingPrompt) {
                addMessage('Please describe your module first, then pick a version.', 'ai');
                return;
            }
            const nameVal = pendingModuleName || suggestModuleName(pendingPrompt).slice(0,64);
            if (!/^([a-z0-9_]+)$/.test(nameVal)) {
                addMessage('Module name is invalid. Please try again.', 'ai');
                return;
            }
            // Request a plan preview before starting generation
            // Hide the version selection bubble from chat
            try {
                const verMsg = document.querySelector('.seg-group [data-version-choice]')?.closest('.message');
                if (verMsg && verMsg.parentElement) verMsg.parentElement.removeChild(verMsg);
            } catch {}
            try { showStatusBubble('Processing'); } catch {}
            vscode.postMessage({ command: 'requestPlan', prompt: pendingPrompt, version: ver, moduleName: nameVal });
        }
        // Delegate clicks from inline buttons
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!t || !(t instanceof Element)) return;
            const ver = t.getAttribute('data-version-choice');
            const isCustom = t.getAttribute('data-version-custom');
            if (ver) {
                startWithVersion(ver);
            } else if (isCustom) {
                if (!pendingPrompt) {
                    addMessage('Please describe your module first, then choose Custom.', 'ai');
                    return;
                }
                pendingModuleName = suggestModuleName(pendingPrompt).slice(0,64);
                awaitingVersion = true;
                addMessage('Type the Odoo version in the chat and press Enter (e.g., 15.0).', 'ai');
            }
        });
        // Progress cancel button disabled (use Stop in chat instead). Still cancels if triggered programmatically.
        progressCancelBtn?.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancelGeneration' });
            setGenerating(false); // UI stop immediately (no 'Cancelling…' text)
            try { if (progressPanel) progressPanel.classList.remove('active'); } catch {}
            try { if (progressText) progressText.textContent = ''; } catch {}
        });

        // Stop button inside chat input
        stopBtn?.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancelGeneration' });
            setGenerating(false);
            // Immediate feedback to user in chat
            try { addMessage('⏹️ You stopped the session.', 'ai'); } catch {}
            try { if (progressPanel) progressPanel.classList.remove('active'); } catch {}
            try { if (progressText) progressText.textContent = ''; } catch {}
        });
        