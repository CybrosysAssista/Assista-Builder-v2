export function initHistoryUI(vscode) {
    const historyPage = document.getElementById('historyPage');
    const settingsPage = document.getElementById('settingsPage');
    const listEl = document.getElementById('historyList');
    const emptyEl = document.getElementById('historyEmpty');
    const searchEl = document.getElementById('historySearch');
    const doneBtn = document.getElementById('historyDoneBtn');
    const messagesEl = document.getElementById('messages');
    const inputBar = document.querySelector('.input-bar');
    // Confirm modal elements
    const confirmOverlay = document.getElementById('historyConfirmOverlay');
    const confirmCancelBtn = document.getElementById('hxConfirmCancel');
    const confirmDeleteBtn = document.getElementById('hxConfirmDelete');

    let items = [];
    let pendingDeleteId = null;

    // Centralized scroll reset used in multiple places
    function resetScrollPositions() {
        try {
            const se = document.scrollingElement || document.documentElement || document.body;
            if (se) se.scrollTop = 0;
            window.scrollTo?.(0, 0);
            if (historyPage && typeof historyPage.scrollTo === 'function') historyPage.scrollTo(0, 0);
            else if (historyPage) historyPage.scrollTop = 0;
        } catch (_) { /* no-op */ }
    }

    // Observe Settings visibility so when it is closed we can correct scroll for History
    function observeSettingsVisibility() {
        if (!settingsPage) return;
        const observer = new MutationObserver(() => {
            const settingsHidden = settingsPage.style.display === 'none';
            const historyVisible = !!historyPage && historyPage.style.display !== 'none';
            if (settingsHidden && historyVisible) {
                // Force History to top after Settings hides (now, RAF, and after 50ms)
                resetScrollPositions();
                requestAnimationFrame(resetScrollPositions);
                setTimeout(resetScrollPositions, 50);
            }
        });
        observer.observe(settingsPage, { attributes: true, attributeFilter: ['style'] });
    }

    /** OPEN */
    function openHistory() {
        if (!historyPage) return;
        // Hide Settings if it's open so History isn't covered
        if (settingsPage) settingsPage.style.display = 'none';
        historyPage.style.display = 'block';
        // Ensure it stacks on top
        try { historyPage.style.zIndex = '9999'; historyPage.style.position = historyPage.style.position || 'relative'; } catch (_) { }
        // Normalize scroll immediately and after layout
        resetScrollPositions();
        requestAnimationFrame(resetScrollPositions);
        setTimeout(resetScrollPositions, 50);
        messagesEl && (messagesEl.style.display = 'none');
        inputBar && (inputBar.style.display = 'none');
        vscode.postMessage({ command: 'loadHistory' });
    }

    /** CLOSE */
    function closeHistory() {
        if (!historyPage) return;
        historyPage.style.display = 'none';
        messagesEl && (messagesEl.style.display = '');
        inputBar && (inputBar.style.display = '');
    }

    // Dropdown State
    let currentWorkspace = 'all';
    let currentSort = 'recent';

    // Helper to setup custom dropdown
    function setupDropdown(wrapId, btnId, onSelect) {
        const wrap = document.getElementById(wrapId);
        const btn = document.getElementById(btnId);
        if (!wrap || !btn) return;

        const menu = wrap.querySelector('.hx-dd-menu');
        const label = btn.querySelector('.label');

        // Toggle
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close others
            document.querySelectorAll('.hx-dd-menu').forEach(m => {
                if (m !== menu) m.classList.remove('show');
            });
            document.querySelectorAll('.hx-dd-wrap').forEach(w => {
                if (w !== wrap) w.classList.remove('open');
            });

            menu.classList.toggle('show');
            wrap.classList.toggle('open');
        });

        // Select
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = e.target.closest('.hx-dd-item');
            if (!item) return;

            const val = item.dataset.value;
            const text = item.textContent;

            // Update UI
            label.textContent = text;
            menu.querySelectorAll('.hx-dd-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Close
            menu.classList.remove('show');
            wrap.classList.remove('open');

            // Callback
            onSelect(val);
        });
    }

    // Setup Dropdowns
    setupDropdown('ddWorkspace', 'btnWorkspace', (val) => {
        currentWorkspace = val;
        render();
    });

    setupDropdown('ddSort', 'btnSort', (val) => {
        currentSort = val;
        render();
    });

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        document.querySelectorAll('.hx-dd-menu').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.hx-dd-wrap').forEach(w => w.classList.remove('open'));
    });

    /** RENDER HISTORY */
    function render() {
        if (!listEl || !emptyEl) return;
        listEl.innerHTML = '';

        const term = (searchEl?.value || '').toLowerCase();
        const ws = currentWorkspace;
        const sort = currentSort;

        let filtered = items.filter(it => {
            const matches = !term || (it.preview || it.title || '').toLowerCase().includes(term);
            const wsOk = ws === 'all' || ws === 'current'; // placeholder
            return matches && wsOk;
        });

        if (sort === 'recent') filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        else if (sort === 'oldest') filtered.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        else if (sort === 'tokens') filtered.sort((a, b) => (b.tokensApprox || 0) - (a.tokensApprox || 0));

        if (!filtered.length) {
            emptyEl.style.display = 'flex';
            return;
        }
        emptyEl.style.display = 'none';

        /** BUILD CARDS */
        filtered.forEach((it, idx) => {
            const wrap = document.createElement('div');
            wrap.className = 'hx-card-wrap';
            wrap.style.animation = `slideIn .4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * .08}s both`;

            const card = document.createElement('div');
            card.className = 'hx-card';
            card.dataset.id = it.id;

            const topline = document.createElement('div');
            topline.className = 'hx-topline';
            card.appendChild(topline);

            const content = document.createElement('div');
            content.className = 'hx-card-content';

            const dot = document.createElement('div');
            dot.className = 'hx-dot';
            content.appendChild(dot);

            const main = document.createElement('div');
            main.className = 'hx-main';

            /** ROW */
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'flex-start';
            row.style.justifyContent = 'space-between';
            row.style.gap = '16px';
            row.style.marginBottom = '12px';

            const msg = document.createElement('p');
            msg.className = 'hx-msg';
            msg.textContent = it.preview || it.title || '(empty)';

            /** ACTIONS */
            const actions = document.createElement('div');
            actions.className = 'hx-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'hx-action';
            copyBtn.dataset.action = 'copy';
            copyBtn.dataset.id = String(it.id);
            copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/></svg>`;

            const delBtn = document.createElement('button');
            delBtn.className = 'hx-action';
            delBtn.dataset.action = 'delete';
            delBtn.dataset.id = String(it.id);
            delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6l1-2h6l1 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

            actions.appendChild(copyBtn);
            actions.appendChild(delBtn);

            row.appendChild(msg);
            row.appendChild(actions);
            main.appendChild(row);

            /** META */
            const meta = document.createElement('div');
            meta.className = 'hx-meta';

            const timeEl = document.createElement('div');
            timeEl.innerHTML = new Date(it.updatedAt || 0).toLocaleString();

            meta.appendChild(timeEl);

            main.appendChild(meta);
            content.appendChild(main);

            /** ARROW */
            const arrow = document.createElement('div');
            arrow.className = 'hx-arrow';
            arrow.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
            content.appendChild(arrow);

            card.appendChild(content);
            wrap.appendChild(card);

            /** OPEN SESSION CLICK */
            wrap.addEventListener('click', (e) => {
                if (e.target.closest('.hx-action')) return;
                vscode.postMessage({ command: 'openSession', id: it.id });
            });

            listEl.appendChild(wrap);
        });
    }

    /** 🔥 FIXED DELEGATED HANDLER (copy + delete) */
    listEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".hx-action");
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        // ALWAYS works — SVG-safe, hover-safe, bubble-safe
        const id = btn.dataset.id || btn.closest(".hx-card")?.dataset.id;
        if (!id) return;

        const action = btn.dataset.action;
        const current = items.find(x => String(x.id) === String(id));
        if (!current) return;

        if (action === "copy") {
            navigator.clipboard.writeText(current.preview || "");
            return;
        }

        if (action === "delete") {
            // Open in-webview confirmation modal
            pendingDeleteId = id;
            if (confirmOverlay) {
                confirmOverlay.style.display = 'flex';
            } else {
                // Fallback: proceed if overlay missing
                items = items.filter(x => String(x.id) !== String(id));
                render();
                try { vscode.postMessage({ command: "deleteSession", id }); } catch (_) { }
                try { setTimeout(() => vscode.postMessage({ command: "loadHistory" }), 50); } catch (_) { }
            }
        }
    }, true);

    // Hook up confirmation modal buttons (once)
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', () => {
            pendingDeleteId = null;
            if (confirmOverlay) confirmOverlay.style.display = 'none';
        });
    }
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            const id = pendingDeleteId;
            pendingDeleteId = null;
            if (confirmOverlay) confirmOverlay.style.display = 'none';
            if (!id) return;
            items = items.filter(x => String(x.id) !== String(id));
            render();
            try { vscode.postMessage({ command: 'deleteSession', id }); } catch (_) { }
            try { setTimeout(() => vscode.postMessage({ command: 'loadHistory' }), 50); } catch (_) { }
        });
    }

    /** FILTERS */
    searchEl?.addEventListener('input', render);
    // workspaceEl?.addEventListener('change', render); // REMOVED
    // sortEl?.addEventListener('change', render); // REMOVED
    doneBtn?.addEventListener('click', closeHistory);

    /** EXPORT */
    return {
        openHistory,
        closeHistory,
        applyHistoryData(data = {}) {
            items = Array.isArray(data.items) ? data.items : [];
            render();
            // After render, ensure we are scrolled to the very top (fixes top gap after closing Settings)
            try {
                requestAnimationFrame(resetScrollPositions);
                setTimeout(resetScrollPositions, 50);
            } catch (_) { /* no-op */ }
        }
    };
}
