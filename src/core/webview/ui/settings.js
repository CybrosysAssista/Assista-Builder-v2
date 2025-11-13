export function initSettingsUI(vscode) {
        const settingsPage = document.getElementById('settingsPage');
        const providerSelect = document.getElementById('provider');
        const apiKeyInput = document.getElementById('apiKey');
        const modelSelect = document.getElementById('model');
        const settingsSaveBtn = document.getElementById('settingsSaveBtn');
        const settingsDoneBtn = document.getElementById('settingsDoneBtn');
        const apiKeyLabel = document.getElementById('apiKeyLabel');
        const docLink = document.getElementById('docLink');
        const messagesEl = document.getElementById('messages');
        const inputBar = document.querySelector('.input-bar');
        // Custom base URL controls
        const customUrlCheckbox = document.getElementById('customUrl');
        const customUrlField = document.getElementById('customUrlField');
        const baseUrlInput = document.getElementById('baseUrl');

        let requestModelsTimer;
        let sidebarResizeObserver;
        // Track the model that should be selected (from saved settings or user's choice)
        let desiredModelId = '';
        const DEFAULT_MODELS = { google: 'gemini-2.5-flash' };

        function updateProviderUiLabels(provider) {
            if (!apiKeyLabel || !docLink) return;
            const map = {
                google: { label: 'Gemini API Key', doc: 'https://ai.google.dev/docs', text: 'Google AI documentation' },
                openrouter: { label: 'OpenRouter API Key', doc: 'https://openrouter.ai/docs', text: 'OpenRouter documentation' },
                openai: { label: 'OpenAI API Key', doc: 'https://platform.openai.com/docs', text: 'OpenAI documentation' },
                anthropic: { label: 'Anthropic API Key', doc: 'https://docs.anthropic.com', text: 'Anthropic documentation' },
                azure: { label: 'Azure OpenAI API Key', doc: 'https://learn.microsoft.com/azure/ai-services/openai', text: 'Azure OpenAI documentation' },
                cohere: { label: 'Cohere API Key', doc: 'https://docs.cohere.com', text: 'Cohere documentation' },
                huggingface: { label: 'HuggingFace API Key', doc: 'https://huggingface.co/docs', text: 'HuggingFace documentation' },
                mistral: { label: 'Mistral AI API Key', doc: 'https://docs.mistral.ai', text: 'Mistral AI documentation' },
            };
            const cfg = map[provider] || map.openrouter;
            apiKeyLabel.textContent = cfg.label;
            docLink.textContent = cfg.text;
            docLink.href = cfg.doc;
        }

        function updateCustomUrlVisibility() {
            try {
                const shouldShow = !!(customUrlCheckbox && customUrlCheckbox.checked);
                if (customUrlField) customUrlField.style.display = shouldShow ? 'block' : 'none';
            } catch (_) { /* no-op */ }
        }

        function requestModelList() {
            const provider = String(providerSelect?.value || '');
            if (!provider || !modelSelect) return;
            try { modelSelect.innerHTML = ''; modelSelect.disabled = true; } catch (_) {}
            const apiKey = String(apiKeyInput?.value || '');
            setTimeout(() => {
                vscode.postMessage({ command: 'listModels', provider, apiKey });
            }, 0);
        }

        function debounceRequestModelList(delay = 250) {
            clearTimeout(requestModelsTimer);
            requestModelsTimer = setTimeout(() => requestModelList(), delay);
        }

    function showSectionInternal(sectionName) {
        const providers = document.getElementById('providersSection');
        const general = document.getElementById('generalSection');
        if (!providers || !general) return;
        providers.style.display = 'none';
        general.style.display = 'none';
        document.querySelectorAll('.sidebar .sidebar-item').forEach((el) => el.classList.remove('active'));
        const items = document.querySelectorAll('.sidebar .sidebar-item');
        if (sectionName === 'general') {
            general.style.display = 'block';
            if (items[1]) items[1].classList.add('active');
        } else {
            providers.style.display = 'block';
            if (items[0]) items[0].classList.add('active');
        }
    }

    window.showSection = showSectionInternal;

    function wireSettingsSidebar() {
        const items = document.querySelectorAll('.sidebar .sidebar-item');
        if (items[0]) {
            items[0].addEventListener('click', () => showSectionInternal('providers'));
        }
        if (items[1]) {
            items[1].addEventListener('click', () => showSectionInternal('general'));
        }
    }

    function startSidebarObserver() {
        try {
            const frame = document.querySelector('.settings-frame');
            if (!frame) return;
            if (sidebarResizeObserver) {
                try { sidebarResizeObserver.disconnect(); } catch (_) {}
            }
            sidebarResizeObserver = new ResizeObserver((entries) => {
                const sidebar = document.querySelector('.sidebar');
                if (!sidebar) return;
                for (const e of entries) {
                    const w = e.contentRect.width || frame.clientWidth || 0;
                    if (w <= 720) sidebar.classList.add('collapsed');
                    else sidebar.classList.remove('collapsed');
                }
            });
            sidebarResizeObserver.observe(frame);
        } catch (_) { /* no-op */ }
    }

    function openSettings() {
        if (!settingsPage) return;
        if (messagesEl) messagesEl.style.display = 'none';
        if (inputBar) inputBar.style.display = 'none';
        settingsPage.style.display = 'block';
        vscode.postMessage({ command: 'loadSettings' });
        try { wireSettingsSidebar(); } catch (_) {}
        try { startSidebarObserver(); } catch (_) {}
    }

    function closeSettings() {
        if (!settingsPage) return;
        settingsPage.style.display = 'none';
        if (messagesEl) messagesEl.style.display = '';
        if (inputBar) inputBar.style.display = '';
    }

    function saveSettings() {
        const provider = String(providerSelect?.value || 'google');
        const model = String(modelSelect?.value || '');
        const key = String(apiKeyInput?.value || '');
        const payload = { command: 'saveSettings', activeProvider: provider };
        if (provider === 'google') {
            payload['googleModel'] = model;
            if (key) payload['googleKey'] = key;
        } else if (provider === 'openrouter') {
            payload['openrouterModel'] = model;
            if (key) payload['openrouterKey'] = key;
        }
        vscode.postMessage(payload);
    }

    settingsSaveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        saveSettings();
    });

    settingsDoneBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        closeSettings();
    });

    providerSelect?.addEventListener('change', () => {
        const provider = String(providerSelect.value);
        updateProviderUiLabels(provider);
        updateCustomUrlVisibility();
        // If switching to Google and no desired model yet, prefer the default
        if (provider === 'google' && !desiredModelId) {
            desiredModelId = DEFAULT_MODELS.google;
        }
        debounceRequestModelList();
    });

    apiKeyInput?.addEventListener('blur', () => {
        debounceRequestModelList();
    });

    // Toggle custom base URL field on checkbox change
    customUrlCheckbox?.addEventListener('change', () => {
        updateCustomUrlVisibility();
    });

    // Track user's model selection so it persists across list refreshes and reopen
    modelSelect?.addEventListener('change', () => {
        try {
            desiredModelId = String(modelSelect.value || '');
        } catch (_) { /* no-op */ }
    });

    return {
        openSettings,
        closeSettings,
        applySettingsData(data = {}) {
            const activeProvider = data.activeProvider || 'google';
            if (providerSelect) providerSelect.value = activeProvider;
            updateProviderUiLabels(activeProvider);
            // Initialize custom URL field visibility on load
            updateCustomUrlVisibility();
            if (modelSelect) {
                const model = activeProvider === 'google' ? (data.googleModel || '') :
                    activeProvider === 'openrouter' ? (data.openrouterModel || '') : '';
                // Remember desired model to keep it selected after models list loads
                desiredModelId = model || '';
                if (!desiredModelId && activeProvider === 'google') {
                    desiredModelId = DEFAULT_MODELS.google;
                }
                let option = modelSelect.querySelector(`option[value="${model}"]`);
                if (!option && model) {
                    modelSelect.innerHTML = '';
                    const opt = document.createElement('option');
                    opt.value = model;
                    opt.textContent = model;
                    modelSelect.appendChild(opt);
                }
                const toSelect = desiredModelId || model;
                if (toSelect) {
                    const exists = !!modelSelect.querySelector(`option[value="${toSelect}"]`);
                    if (exists) modelSelect.value = toSelect;
                }
            }
            debounceRequestModelList(50);
            try { wireSettingsSidebar(); } catch (_) {}
            try { startSidebarObserver(); } catch (_) {}
        },
        applyModelList(payload = {}) {
            const { models } = payload;
            if (!Array.isArray(models) || !modelSelect) return;
            modelSelect.innerHTML = '';
            models.forEach((m) => {
                if (!m || !m.id) return;
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.id;
                modelSelect.appendChild(opt);
            });
            try { modelSelect.disabled = false; } catch (_) {}
            // After repopulating, reselect the desired model if it exists
            const provider = String(providerSelect?.value || '');
            let target = desiredModelId;
            if (!target && provider === 'google') {
                target = DEFAULT_MODELS.google;
            }
            if (target) {
                const exists = !!modelSelect.querySelector(`option[value="${target}"]`);
                if (exists) modelSelect.value = target;
            }
        },
        handleModelsError() {
            try { modelSelect.disabled = false; } catch (_) {}
        },
        requestModelList,
        updateProviderUiLabels,
    };
}
