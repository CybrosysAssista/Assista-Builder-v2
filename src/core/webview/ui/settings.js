export function initSettingsUI(vscode) {
    const settingsPage = document.getElementById('settingsPage');
    const historyPage = document.getElementById('historyPage');
    const providerSelect = document.getElementById('provider');
    const apiKeyInput = document.getElementById('apiKey');
    const modelInput = document.getElementById('model'); // Changed from modelSelect to modelInput
    const modelDropdownList = document.getElementById('modelDropdownList'); // New dropdown element
    const settingsSaveBtn = document.getElementById('settingsSaveBtn');
    const settingsDoneBtn = document.getElementById('settingsDoneBtn');
    const settingsBackBtn = document.getElementById('settingsBackBtn');
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const getApiKeyBtn = document.getElementById('getApiKeyBtn');
    const docLink = document.getElementById('docLink');
    const messagesEl = document.getElementById('messages');
    const inputBar = document.querySelector('.input-bar');
    // Custom base URL controls
    const customUrlCheckbox = document.getElementById('customUrl');
    const customUrlField = document.getElementById('customUrlField');
    const baseUrlInput = document.getElementById('baseUrl');

    // Unsaved Changes Modal Elements
    const unsavedChangesModal = document.getElementById('unsavedChangesModal');
    const cancelDiscardBtn = document.getElementById('cancelDiscardBtn');
    const confirmDiscardBtn = document.getElementById('confirmDiscardBtn');

    let requestModelsTimer;
    let sidebarResizeObserver;
    // Track the model that should be selected (from saved settings or user's choice)
    let desiredModelId = '';
    const DEFAULT_MODELS = { google: 'gemini-2.5-flash' };
    // Keep saved keys in memory (from settingsData) to rehydrate input when switching providers
    const SAVED_KEYS = { google: '', openrouter: '', openai: '', anthropic: '' };
    // Keep saved models in memory to rehydrate input when switching providers
    const SAVED_MODELS = { google: '', openrouter: '', openai: '', anthropic: '' };
    // Store all available models for filtering
    let allModels = [];
    // Track prior scroll state and lock scrolling while Settings is open
    let prevScrollTop = 0;

    function updateProviderUiLabels(provider) {
        if (!apiKeyLabel) return;
        const map = {
            google: {
                label: 'Gemini API Key',
                doc: 'https://ai.google.dev/docs',
                text: 'Google AI documentation',
                apiUrl: 'https://aistudio.google.com/app/apikey',
                btnText: 'Get Gemini API'
            },
            openrouter: {
                label: 'OpenRouter API Key',
                doc: 'https://openrouter.ai/docs',
                text: 'OpenRouter documentation',
                apiUrl: 'https://openrouter.ai/keys',
                btnText: 'Get OpenRouter API'
            },
            openai: {
                label: 'OpenAI API Key',
                doc: 'https://platform.openai.com/docs',
                text: 'OpenAI documentation',
                apiUrl: 'https://platform.openai.com/api-keys',
                btnText: 'Get OpenAI API'
            },
            anthropic: {
                label: 'Anthropic API Key',
                doc: 'https://docs.anthropic.com',
                text: 'Anthropic documentation',
                apiUrl: 'https://console.anthropic.com/settings/keys',
                btnText: 'Get Anthropic API'
            },
        };
        const cfg = map[provider] || map.openrouter;
        apiKeyLabel.textContent = cfg.label;
        if (docLink) {
            docLink.textContent = cfg.text;
            docLink.href = cfg.doc;
        }
        if (getApiKeyBtn) {
            getApiKeyBtn.textContent = cfg.btnText;
            getApiKeyBtn.dataset.apiUrl = cfg.apiUrl;
        }
    }

    function updateCustomUrlVisibility() {
        try {
            const shouldShow = !!(customUrlCheckbox && customUrlCheckbox.checked);
            if (customUrlField) customUrlField.style.display = shouldShow ? 'block' : 'none';
        } catch (_) { /* no-op */ }
    }

    function requestModelList() {
        const provider = String(providerSelect?.value || '');
        if (!provider || !modelInput) return;
        // Don't disable the input - keep it always working
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
            // Fetch usage data for the active provider (defaulting to openrouter for credits check)
            const provider = document.getElementById('provider')?.value || 'openrouter';
            vscode.postMessage({ command: 'fetchUsage', provider });
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
                try { sidebarResizeObserver.disconnect(); } catch (_) { }
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

    // Filter and render models in dropdown based on search query
    function filterAndRenderModels(query = '') {
        if (!modelDropdownList) return;

        const searchTerm = query.toLowerCase().trim();
        const filtered = searchTerm
            ? allModels.filter(m => m.id.toLowerCase().includes(searchTerm))
            : allModels;

        modelDropdownList.innerHTML = '';

        if (filtered.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'model-dropdown-empty';
            emptyDiv.textContent = searchTerm ? 'No models found' : 'No models available';
            modelDropdownList.appendChild(emptyDiv);
            return;
        }

        filtered.forEach(model => {
            const item = document.createElement('div');
            item.className = 'model-dropdown-item';
            item.textContent = model.id;
            item.dataset.modelId = model.id;

            // Highlight if it matches current input value
            if (modelInput && model.id === modelInput.value) {
                item.classList.add('selected');
            }

            item.addEventListener('click', () => selectModel(model.id));
            modelDropdownList.appendChild(item);
        });
    }

    // Select a model from dropdown
    function selectModel(modelId) {
        if (modelInput) {
            modelInput.value = modelId;
            desiredModelId = modelId;
            enableSaveBtn();
        }
        hideModelDropdown();
    }

    // Show model dropdown
    function showModelDropdown() {
        if (!modelDropdownList) return;

        // If models haven't been loaded yet, request them
        if (allModels.length === 0) {
            requestModelList();
            // Show a loading message
            modelDropdownList.innerHTML = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'model-dropdown-empty';
            loadingDiv.textContent = 'Loading models...';
            modelDropdownList.appendChild(loadingDiv);
            modelDropdownList.style.display = 'block';
            return;
        }

        // Models are loaded, show them
        filterAndRenderModels(modelInput?.value || '');
        modelDropdownList.style.display = 'block';
    }

    // Hide model dropdown
    function hideModelDropdown() {
        if (modelDropdownList) {
            modelDropdownList.style.display = 'none';
        }
    }

    function openSettings() {
        if (!settingsPage) return;
        if (messagesEl) messagesEl.style.display = 'none';
        if (inputBar) inputBar.style.display = 'none';
        // Lock document scroll and normalize to top to avoid residual offsets when returning to History
        try {
            const se = document.scrollingElement || document.documentElement || document.body;
            prevScrollTop = se ? se.scrollTop : 0;
            if (se) se.scrollTop = 0;
            window.scrollTo?.(0, 0);
            // Prevent background scroll while Settings is open
            if (document?.body) document.body.style.overflow = 'hidden';
            if (document?.documentElement) document.documentElement.style.overflow = 'hidden';
        } catch (_) { /* no-op */ }
        settingsPage.style.display = 'block';
        vscode.postMessage({ command: 'loadSettings' });
        try { wireSettingsSidebar(); } catch (_) { }
        try { startSidebarObserver(); } catch (_) { }
    }

    function closeSettings() {
        if (!settingsPage) return;
        settingsPage.style.display = 'none';
        // Only restore chat UI if History is NOT currently visible
        const historyVisible = !!historyPage && historyPage.style.display !== 'none';
        if (!historyVisible) {
            if (messagesEl) messagesEl.style.display = '';
            if (inputBar) inputBar.style.display = '';
        }
        // Unlock document scroll and ensure we are at top to remove any perceived gap
        try {
            if (document?.body) document.body.style.overflow = '';
            if (document?.documentElement) document.documentElement.style.overflow = '';
            const se = document.scrollingElement || document.documentElement || document.body;
            if (se) se.scrollTop = 0;
            window.scrollTo?.(0, 0);
        } catch (_) { /* no-op */ }
    }

    function enableSaveBtn() {
        if (settingsSaveBtn) {
            settingsSaveBtn.disabled = false;
            settingsSaveBtn.textContent = 'Save';
            settingsSaveBtn.style.opacity = '1';
            settingsSaveBtn.style.cursor = 'pointer';
        }
    }

    function disableSaveBtn() {
        if (settingsSaveBtn) {
            settingsSaveBtn.disabled = true;
            settingsSaveBtn.textContent = 'Saved';
            settingsSaveBtn.style.opacity = '0.6';
            settingsSaveBtn.style.cursor = 'default';
        }
    }

    function saveSettings() {
        const provider = String(providerSelect?.value || 'google');
        const model = String(modelInput?.value || '');
        const key = String(apiKeyInput?.value || '');
        const payload = { command: 'saveSettings', activeProvider: provider };
        if (provider === 'google') {
            payload['googleModel'] = model;
            if (key) payload['googleKey'] = key;
        } else if (provider === 'openrouter') {
            payload['openrouterModel'] = model;
            if (key) payload['openrouterKey'] = key;
        } else if (provider === 'openai') {
            payload['openaiModel'] = model;
            if (key) payload['openaiKey'] = key;
        } else if (provider === 'anthropic') {
            payload['anthropicModel'] = model;
            if (key) payload['anthropicKey'] = key;
        }
        vscode.postMessage(payload);

        // Disable button to indicate saved state
        disableSaveBtn();
    }

    settingsSaveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        saveSettings();
    });

    getApiKeyBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const apiUrl = getApiKeyBtn.dataset.apiUrl;
        if (apiUrl) {
            vscode.postMessage({ command: 'openExternalUrl', url: apiUrl });
        }
    });

    settingsDoneBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        // Check if there are unsaved changes (Save button is enabled)
        if (settingsSaveBtn && !settingsSaveBtn.disabled) {
            // Show unsaved changes modal
            if (unsavedChangesModal) unsavedChangesModal.style.display = 'flex';
        } else {
            closeSettings();
        }
    });

    settingsBackBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        // Check if there are unsaved changes (Save button is enabled)
        if (settingsSaveBtn && !settingsSaveBtn.disabled) {
            // Show unsaved changes modal
            if (unsavedChangesModal) unsavedChangesModal.style.display = 'flex';
        } else {
            closeSettings();
        }
    });

    // Modal Event Listeners
    cancelDiscardBtn?.addEventListener('click', () => {
        if (unsavedChangesModal) unsavedChangesModal.style.display = 'none';
    });

    confirmDiscardBtn?.addEventListener('click', () => {
        if (unsavedChangesModal) unsavedChangesModal.style.display = 'none';
        // Discard changes by simply closing settings (changes are not saved)
        closeSettings();
        // Reload settings to ensure UI is reset next time it opens
        vscode.postMessage({ command: 'loadSettings' });
    });

    providerSelect?.addEventListener('change', () => {
        enableSaveBtn(); // Enable save on change
        const provider = String(providerSelect.value);
        updateProviderUiLabels(provider);
        updateCustomUrlVisibility();

        // Swap API key field to saved key for selected provider
        try {
            if (apiKeyInput) {
                const k = SAVED_KEYS[provider] || '';
                apiKeyInput.value = k;
            }
        } catch (_) { }

        // Swap model field to saved model for selected provider
        try {
            if (modelInput) {
                const savedModel = SAVED_MODELS[provider] || '';
                const defaultModel = (provider === 'google' && !savedModel) ? DEFAULT_MODELS.google : '';
                const modelToShow = savedModel || defaultModel;

                modelInput.value = modelToShow;
                desiredModelId = modelToShow;

                // Clear allModels to force reload for new provider
                allModels = [];
            }
        } catch (_) { }

        debounceRequestModelList();
    });

    apiKeyInput?.addEventListener('input', () => {
        enableSaveBtn(); // Enable save on typing
    });

    apiKeyInput?.addEventListener('blur', () => {
        debounceRequestModelList();
    });

    // Toggle custom base URL field on checkbox change
    customUrlCheckbox?.addEventListener('change', () => {
        enableSaveBtn(); // Enable save on change
        updateCustomUrlVisibility();
    });

    baseUrlInput?.addEventListener('input', () => {
        enableSaveBtn();
    });

    // Model input: filter on typing
    modelInput?.addEventListener('input', () => {
        enableSaveBtn(); // Enable save on change
        const query = modelInput.value || '';
        filterAndRenderModels(query);
        showModelDropdown();
    });

    // Model input: show dropdown on focus
    modelInput?.addEventListener('focus', () => {
        showModelDropdown();
    });

    // Model input: hide dropdown on blur (with delay to allow click on dropdown item)
    modelInput?.addEventListener('blur', () => {
        setTimeout(() => hideModelDropdown(), 200);
    });

    // Close dropdown when clicking outside
    document.addEventListener('mousedown', (e) => {
        if (modelInput && modelDropdownList &&
            !modelInput.contains(e.target) &&
            !modelDropdownList.contains(e.target)) {
            hideModelDropdown();
        }
    });

    return {
        openSettings,
        closeSettings,
        applySettingsData(data = {}) {
            const activeProvider = data.activeProvider || 'google';
            if (providerSelect) providerSelect.value = activeProvider;
            updateProviderUiLabels(activeProvider);

            // Persist saved keys in memory and set input for the active provider
            SAVED_KEYS.google = String(data.googleKey || '');
            SAVED_KEYS.openrouter = String(data.openrouterKey || '');
            SAVED_KEYS.openai = String(data.openaiKey || '');
            SAVED_KEYS.anthropic = String(data.anthropicKey || '');
            if (apiKeyInput) { apiKeyInput.value = SAVED_KEYS[activeProvider] || ''; }

            // Persist saved models in memory for all providers
            SAVED_MODELS.google = String(data.googleModel || '');
            SAVED_MODELS.openrouter = String(data.openrouterModel || '');
            SAVED_MODELS.openai = String(data.openaiModel || '');
            SAVED_MODELS.anthropic = String(data.anthropicModel || '');

            // Initialize custom URL field visibility on load
            updateCustomUrlVisibility();
            if (modelInput) {
                const model = SAVED_MODELS[activeProvider] || '';
                // Remember desired model to keep it selected after models list loads
                desiredModelId = model || '';
                if (!desiredModelId && activeProvider === 'google') {
                    desiredModelId = DEFAULT_MODELS.google;
                }
                // Set the input value if we have a model
                if (model) {
                    modelInput.value = model;
                }
            }
            debounceRequestModelList(50);
            try { wireSettingsSidebar(); } catch (_) { }
            try { startSidebarObserver(); } catch (_) { }

            // Disable save button since settings are freshly loaded (no changes yet)
            disableSaveBtn();
        },
        applyModelList(payload = {}) {
            const { models } = payload;
            if (!Array.isArray(models) || !modelInput) return;

            // Store all models for filtering
            allModels = models.filter(m => m && m.id);

            // After repopulating, set the desired model if it exists
            const provider = String(providerSelect?.value || '');
            const currentValue = modelInput.value || '';
            let target = desiredModelId;
            if (!target && provider === 'google') {
                target = DEFAULT_MODELS.google;
            }

            // Only update the input value if it's different from current
            if (target) {
                const exists = allModels.some(m => m.id === target);
                if (exists && currentValue !== target) {
                    modelInput.value = target;
                } else if (!exists && allModels.length > 0 && currentValue !== allModels[0].id) {
                    // If desired model doesn't exist, set first model
                    modelInput.value = allModels[0].id;
                }
            } else if (allModels.length > 0 && !currentValue) {
                // No target and input is empty, set first model
                modelInput.value = allModels[0].id;
            }

            // Render the dropdown content
            filterAndRenderModels('');

            // If dropdown is currently visible (user is waiting), update it with the loaded models
            if (modelDropdownList && modelDropdownList.style.display === 'block') {
                filterAndRenderModels(modelInput?.value || '');
            }
        },
        handleModelsError() {
            allModels = [];
        },
        requestModelList,
        updateProviderUiLabels,
        applyUsageData(data) {
            if (data.error) return;

            const { usage, limit, label } = data;
            const creditsEl = document.querySelector('.usage-stats .usage-label span:last-child');
            const progressBar = document.querySelector('.progress-fill');
            const badge = document.querySelector('.badge');

            if (creditsEl) {
                // OpenRouter usage is typically in USD
                const usageVal = Number(usage) || 0;
                const limitVal = Number(limit) || 0;
                // If limit is 0 or null, it might be unlimited or prepaid.
                // Display as $X.XX used
                if (limitVal > 0) {
                    creditsEl.textContent = `$${usageVal.toFixed(2)} / $${limitVal.toFixed(2)}`;
                    if (progressBar) {
                        const pct = Math.min(100, (usageVal / limitVal) * 100);
                        progressBar.style.width = `${pct}%`;
                    }
                } else {
                    creditsEl.textContent = `$${usageVal.toFixed(2)} Used`;
                    if (progressBar) progressBar.style.width = '100%';
                }
            }

            if (badge && label) {
                badge.textContent = label;
            }
        }
    };
}
