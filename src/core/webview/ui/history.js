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

    const confirmTitle = document.getElementById('hxConfirmTitle');
    const confirmDesc = document.getElementById('hxConfirmDesc');

    let items = [];
    let pendingDeleteId = null;
    let isClearAll = false;

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

    /** HELPER: Get time period for a conversation */
    function getTimePeriod(timestamp) {
        const now = new Date();
        const date = new Date(timestamp);
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Today
        if (diffDays === 0 && now.getDate() === date.getDate()) {
            return 'Latest';
        }
        // Yesterday
        if (diffDays === 1 || (diffDays === 0 && now.getDate() !== date.getDate())) {
            return 'Yesterday';
        }
        // Last 7 days
        if (diffDays < 7) {
            return 'Last Week';
        }
        // Last 30 days
        if (diffDays < 30) {
            return 'Last Month';
        }
        // Older
        return 'Older';
    }

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

        // Limit to 30 most recent conversations
        filtered = filtered.slice(0, 30);

        if (!filtered.length) {
            emptyEl.style.display = 'flex';
            listEl.style.display = 'none';
            return;
        }
        emptyEl.style.display = 'none';
        listEl.style.display = 'block';

        /** GROUP BY TIME PERIOD */
        const groups = {};
        const groupOrder = ['Latest', 'Yesterday', 'Last Week', 'Last Month', 'Older'];

        filtered.forEach(it => {
            const period = getTimePeriod(it.updatedAt || 0);
            if (!groups[period]) groups[period] = [];
            groups[period].push(it);
        });

        /** BUILD CARDS WITH SECTION HEADERS */
        let globalIdx = 0;
        groupOrder.forEach(period => {
            if (!groups[period] || groups[period].length === 0) return;

            // Add section header
            const header = document.createElement('div');
            header.className = 'hx-section-header';

            const headerText = document.createElement('span');
            headerText.textContent = period;
            header.appendChild(headerText);

            // Add Clear History button only to the "Latest" section
            if (period === 'Latest') {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'hx-clear-btn';
                clearBtn.id = 'historyClearAllBtn';
                clearBtn.title = 'Clear History';
                clearBtn.textContent = 'Clear History';
                header.appendChild(clearBtn);
            }

            listEl.appendChild(header);

            // Add cards for this period
            groups[period].forEach((it) => {
                const wrap = document.createElement('div');
                wrap.className = 'hx-card-wrap';
                wrap.style.animation = `slideIn .4s cubic-bezier(0.16, 1, 0.3, 1) ${globalIdx * .08}s both`;
                globalIdx++;

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
                copyBtn.title = 'Copy prompt';
                copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/></svg>`;

                const delBtn = document.createElement('button');
                delBtn.className = 'hx-action';
                delBtn.dataset.action = 'delete';
                delBtn.dataset.id = String(it.id);
                delBtn.title = 'Delete conversation';
                delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6l1-2h6l1 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

                actions.appendChild(copyBtn);
                actions.appendChild(delBtn);

                row.appendChild(msg);
                row.appendChild(actions);
                main.appendChild(row);

                /** META */
                const meta = document.createElement('div');
                meta.className = 'hx-meta';

                // Format timestamp like "10 JUL 2025, 09:15 PM"
                const date = new Date(it.updatedAt || 0);
                const day = String(date.getDate()).padStart(2, '0');
                const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
                const year = date.getFullYear();
                let hours = date.getHours();
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                const formattedTime = `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

                const timeEl = document.createElement('div');
                timeEl.innerHTML = `
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 4px; vertical-align: middle;">
                        <path d="M4 8C1.79086 8 0 6.20912 0 4C0 1.79086 1.79086 0 4 0C6.20912 0 8 1.79086 8 4C8 6.20912 6.20912 8 4 8ZM4 7.2C5.76732 7.2 7.2 5.76732 7.2 4C7.2 2.23269 5.76732 0.8 4 0.8C2.23269 0.8 0.8 2.23269 0.8 4C0.8 5.76732 2.23269 7.2 4 7.2ZM4.4 4H6V4.8H3.6V2H4.4V4Z" fill="#CDCDCD"/>
                    </svg>
                    <span style="vertical-align: middle;">${formattedTime}</span>
                `;

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
            isClearAll = false;
            if (confirmTitle) confirmTitle.textContent = 'Delete Conversation';
            if (confirmDesc) confirmDesc.textContent = 'Are you sure you want to delete this conversation?';
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

    // Clear All Handler - Using delegation since button is dynamically created
    listEl?.addEventListener('click', (e) => {
        const clearBtn = e.target.closest('#historyClearAllBtn');
        if (!clearBtn) return;

        e.preventDefault();
        e.stopPropagation();

        if (items.length === 0) return; // Nothing to clear
        isClearAll = true;
        pendingDeleteId = null;
        if (confirmTitle) confirmTitle.textContent = 'Clear All History';
        if (confirmDesc) confirmDesc.textContent = 'Are you sure you want to delete all conversations? This action cannot be undone.';
        if (confirmOverlay) confirmOverlay.style.display = 'flex';
    });

    // Hook up confirmation modal buttons (once)
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', () => {
            pendingDeleteId = null;
            isClearAll = false;
            if (confirmOverlay) confirmOverlay.style.display = 'none';
        });
    }
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            if (isClearAll) {
                items = [];
                render();
                try { vscode.postMessage({ command: 'clearAllHistory' }); } catch (_) { }
            } else {
                const id = pendingDeleteId;
                if (!id) {
                    if (confirmOverlay) confirmOverlay.style.display = 'none';
                    return;
                }
                items = items.filter(x => String(x.id) !== String(id));
                render();
                try { vscode.postMessage({ command: 'deleteSession', id }); } catch (_) { }
            }

            pendingDeleteId = null;
            isClearAll = false;
            if (confirmOverlay) confirmOverlay.style.display = 'none';
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
