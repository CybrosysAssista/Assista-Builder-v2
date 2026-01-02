export function initToolsUI(vscode, { messagesEl, showChatArea, applySyntaxHighlighting, applyDiffHighlighting }) {
    // Track tool execution UI elements by toolId
    const toolExecutionElements = new Map();

    function createMinimalToolItem(label, status, iconType = 'file', filePath = null, showChevron = true, isClickable = true) {
        // Create block
        const block = document.createElement('div');
        block.className = 'minimal-tool-item';

        // Header
        const header = document.createElement('div');
        header.className = 'minimal-tool-header';
        if (!isClickable) {
            header.style.cursor = 'default';
        }

        // Chevron
        const chevronSpan = document.createElement('span');
        chevronSpan.className = 'minimal-tool-chevron';
        if (!showChevron || !isClickable) {
            chevronSpan.style.display = 'none';
        }
        chevronSpan.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        header.appendChild(chevronSpan);

        // Icon
        if (iconType) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'minimal-tool-icon';

            if (iconType === 'folder') {
                iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
            } else if (iconType === 'search') {
                iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
            } else {
                iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
            }
            header.appendChild(iconSpan);
        }

        // Label
        const labelContainer = document.createElement('span');
        labelContainer.className = 'minimal-tool-label';

        if (filePath && isClickable) {
            // Split label into prefix and filename if possible
            const parts = label.split(' ');
            const prefix = parts[0];
            const fileName = parts.slice(1).join(' ');

            const prefixSpan = document.createElement('span');
            prefixSpan.textContent = prefix + ' ';
            labelContainer.appendChild(prefixSpan);

            const fileSpan = document.createElement('span');
            fileSpan.className = 'clickable-file';
            fileSpan.textContent = fileName;
            fileSpan.title = `Open ${filePath}`;
            fileSpan.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't toggle collapse
                vscode.postMessage({ command: 'openFile', path: filePath });
            });
            labelContainer.appendChild(fileSpan);
        } else {
            labelContainer.textContent = label;
        }

        header.appendChild(labelContainer);

        // Status
        const statusIcon = document.createElement('span');
        statusIcon.className = 'minimal-status-icon';
        if (status === 'loading') {
            statusIcon.classList.add('loading');
            statusIcon.innerHTML = '...';
        }
        header.appendChild(statusIcon);

        // Content
        let contentArea = null;
        if (isClickable) {
            contentArea = document.createElement('div');
            contentArea.className = 'minimal-tool-content';
            block.appendChild(contentArea);
        }

        block.appendChild(header);
        if (contentArea) {
            block.appendChild(contentArea);
        }

        // Toggle
        if (isClickable) {
            header.addEventListener('click', () => {
                if (contentArea.innerHTML.trim() !== "") {
                    contentArea.classList.toggle('visible');
                    chevronSpan.classList.toggle('expanded');
                }
            });
        }

        return { block, header, statusIcon, contentArea, chevronSpan };
    }

    function showToolExecution({ toolId, toolName, filename, status, args }) {
        if (!messagesEl) return;
        showChatArea();

        // Create message row
        const row = document.createElement("div");
        row.className = "message-row";
        row.setAttribute('data-tool-id', toolId);

        // Special handling for read_file
        if (toolName === 'read_file' && args && args.files && Array.isArray(args.files)) {
            const container = document.createElement('div');
            container.className = 'read-file-container minimal';

            const fileBlocks = new Map();

            args.files.forEach(file => {
                const fileName = file.path.split(/[/\\]/).pop();
                const isFolder = file.path.endsWith('/') || file.path.endsWith('\\');
                const { block, header, statusIcon, contentArea } = createMinimalToolItem(`Read ${fileName}`, status, isFolder ? 'folder' : 'file', file.path, false, false);
                header.style.cursor = 'pointer';
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ command: 'openFile', path: file.path });
                });

                container.appendChild(block);
                fileBlocks.set(file.path, { header, statusIcon, contentArea: null });
            });

            row.appendChild(container);
            messagesEl.appendChild(row);
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

            toolExecutionElements.set(toolId, { row, container, fileBlocks, toolName });
            return;
        }

        // Special handling for grep_search
        if (toolName === 'grep_search' && args) {
            const container = document.createElement('div');
            container.className = 'read-file-container minimal';

            const query = args.Query || args.query || 'search';
            // FIX: Use 'search' icon instead of null
            const { block, header, statusIcon, contentArea } = createMinimalToolItem(`Grepped`, status, null);

            // Show what was searched immediately in content area
            const queryInfo = document.createElement('div');
            queryInfo.className = 'grep-query-info';
            queryInfo.innerHTML = `Searched for: <code>${query}</code>`;
            contentArea.appendChild(queryInfo);

            container.appendChild(block);
            row.appendChild(container);
            messagesEl.appendChild(row);
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

            toolExecutionElements.set(toolId, { row, container, statusIcon, contentArea, toolName, query });
            return;
        }

        // Special handling for list_dir
        if (toolName === 'list_dir' && args) {
            const container = document.createElement('div');
            container.className = 'read-file-container minimal';

            const dirPath = args.DirectoryPath || args.path || 'directory';

            // Handle trailing slashes for folder name extraction
            let cleanPath = dirPath;
            if ((cleanPath.endsWith('/') || cleanPath.endsWith('\\')) && cleanPath.length > 1) {
                cleanPath = cleanPath.slice(0, -1);
            }
            const folderName = cleanPath.split(/[/\\]/).pop() || dirPath;

            // Make it non-expandable (isClickable = false), but keep pointer cursor for Reveal in Explorer
            const { block, header, statusIcon, contentArea } = createMinimalToolItem(`List ${folderName}`, status, 'folder', null, false, false);
            header.style.cursor = 'pointer';

            // Add custom click listener to reveal in explorer
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({ command: 'revealInExplorer', path: dirPath });
            });

            container.appendChild(block);
            row.appendChild(container);
            messagesEl.appendChild(row);
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

            toolExecutionElements.set(toolId, { row, container, statusIcon, contentArea: null, toolName, dirPath });
            return;
        }

        // Special handling for file-modifying tools (Minimal UI)
        const isWriteTool = ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'apply_diff', 'multi_edit'].includes(toolName);
        if (isWriteTool && args) {
            const container = document.createElement('div');
            container.className = 'read-file-container minimal';

            const filePath = args.path || args.file_path || args.TargetFile || filename || '';
            const fileName = filePath.split(/[/\\]/).pop() || toolName;

            const labelPrefix = toolName === 'write_to_file' ? 'Created' : 'Edited';
            const { block, header, statusIcon, contentArea } = createMinimalToolItem(`${labelPrefix} ${fileName}`, status, 'file', filePath);

            // Add diff stats to header
            let addedLines = 0;
            let removedLines = 0;

            if (toolName === 'apply_diff' && args.diff) {
                const blockRegex = /<<<<<<< SEARCH\s*\n:start_line:\d+\s*\n-------\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/g;
                let match;
                while ((match = blockRegex.exec(args.diff)) !== null) {
                    const searchContent = match[1].trim();
                    const replaceContent = match[2].trim();
                    if (searchContent) removedLines += searchContent.split(/\r?\n/).length;
                    if (replaceContent) addedLines += replaceContent.split(/\r?\n/).length;
                }
            } else if (toolName === 'multi_edit' && args.edits) {
                args.edits.forEach(edit => {
                    const oldStr = (edit.old_string || '').trim();
                    const newStr = (edit.new_string || '').trim();
                    if (oldStr) removedLines += oldStr.split(/\r?\n/).length;
                    if (newStr) addedLines += newStr.split(/\r?\n/).length;
                });
            } else if (toolName === 'write_to_file' && args.content) {
                const content = (args.content || '').trim();
                if (content) addedLines = content.split(/\r?\n/).length;
            } else if (toolName === 'replace_file_content' && args.ReplacementContent) {
                const oldStr = (args.TargetContent || '').trim();
                const newStr = (args.ReplacementContent || '').trim();
                if (oldStr) removedLines += oldStr.split(/\r?\n/).length;
                if (newStr) addedLines += newStr.split(/\r?\n/).length;
            } else if (toolName === 'multi_replace_file_content' && args.ReplacementChunks) {
                args.ReplacementChunks.forEach(chunk => {
                    const oldStr = (chunk.TargetContent || '').trim();
                    const newStr = (chunk.ReplacementContent || '').trim();
                    if (oldStr) removedLines += oldStr.split(/\r?\n/).length;
                    if (newStr) addedLines += newStr.split(/\r?\n/).length;
                });
            }

            const statsSpan = document.createElement('span');
            statsSpan.style.display = 'flex';
            statsSpan.style.gap = '6px';
            statsSpan.style.marginLeft = '4px';
            statsSpan.style.fontSize = '12px';

            if (addedLines > 0) {
                const added = document.createElement('span');
                added.style.color = 'var(--vscode-gitDecoration-addedResourceForeground)';
                added.textContent = `+${addedLines}`;
                statsSpan.appendChild(added);
            }
            if (removedLines > 0) {
                const removed = document.createElement('span');
                removed.style.color = 'var(--vscode-gitDecoration-deletedResourceForeground)';
                removed.textContent = `-${removedLines}`;
                statsSpan.appendChild(removed);
            }
            header.insertBefore(statsSpan, statusIcon);

            // Populate content area with diff
            let contentToShow = '';
            let isDiff = false;

            if (toolName === 'write_to_file') {
                const content = args.content || args.CodeContent || '';
                if (content) {
                    contentToShow = content.split(/\r?\n/).map(line => '+' + line).join('\n');
                    isDiff = true;
                }
            } else if (args.content) {
                contentToShow = args.content;
            } else if (args.diff) {
                contentToShow = args.diff;
                isDiff = true;
            } else if (args.CodeContent) {
                contentToShow = args.CodeContent;
            } else if (args.ReplacementContent) {
                if (args.TargetContent) {
                    contentToShow = `<<<<<<< SEARCH\n${args.TargetContent}\n=======\n${args.ReplacementContent}\n>>>>>>> REPLACE`;
                    isDiff = true;
                } else {
                    contentToShow = args.ReplacementContent;
                }
            } else if (args.ReplacementChunks && Array.isArray(args.ReplacementChunks)) {
                contentToShow = args.ReplacementChunks.map(chunk => {
                    return `<<<<<<< SEARCH\n${chunk.TargetContent}\n=======\n${chunk.ReplacementContent}\n>>>>>>> REPLACE`;
                }).join('\n\n');
                isDiff = true;
            } else if (args.edits && Array.isArray(args.edits)) {
                contentToShow = args.edits.map(edit => {
                    return `<<<<<<< SEARCH\n${edit.old_string}\n=======\n${edit.new_string}\n>>>>>>> REPLACE`;
                }).join('\n\n');
                isDiff = true;
            }

            if (contentToShow) {
                const pre = document.createElement('pre');
                pre.style.margin = '0';
                pre.style.padding = '8px 4px';
                pre.style.fontSize = '12px';
                pre.style.background = 'var(--vscode-editor-background)';
                pre.style.overflowX = 'auto';

                if (isDiff) {
                    pre.innerHTML = applyDiffHighlighting(contentToShow);
                    pre.classList.add('diff-view');
                } else {
                    pre.innerHTML = applySyntaxHighlighting(contentToShow);
                    pre.classList.add('hljs');
                }
                contentArea.appendChild(pre);
            }

            container.appendChild(block);
            row.appendChild(container);
            messagesEl.appendChild(row);
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

            toolExecutionElements.set(toolId, { row, container, statusIcon, contentArea, toolName, filePath });
            return;
        }

        // Store reference including contentArea and toolName
        toolExecutionElements.set(toolId, { row, container: null, header: null, statusIcon: null, contentArea: null, toolName });
    }

    function updateToolExecution({ toolId, status, result }) {
        const toolExec = toolExecutionElements.get(toolId);
        if (!toolExec) return;

        const { statusIcon, contentArea, toolName, fileBlocks } = toolExec;

        if (toolName === 'read_file' && fileBlocks) {
            if (status === 'completed' && result && result.files) {
                result.files.forEach(fileResult => {
                    const block = fileBlocks.get(fileResult.path);
                    if (block) {
                        const { statusIcon, contentArea } = block;
                        statusIcon.classList.remove('loading');
                        statusIcon.innerHTML = '';

                        if (fileResult.error) {
                            statusIcon.innerHTML = '⚠️';
                        }
                    }
                });
            } else if (status === 'error') {
                fileBlocks.forEach(block => {
                    block.statusIcon.classList.remove('loading');
                    block.statusIcon.innerHTML = '❌';
                });
            }
            return;
        }

        if (toolName === 'grep_search' && contentArea) {
            statusIcon.classList.remove('loading');
            statusIcon.innerHTML = '';

            if (status === 'completed') {
                statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
                statusIcon.classList.add('completed');
            } else if (status === 'error') {
                statusIcon.innerHTML = '❌';
                if (result) {
                    const pre = document.createElement('pre');
                    pre.textContent = `Error: ${JSON.stringify(result, null, 2)}`;
                    pre.style.color = 'var(--vscode-errorForeground)';
                    contentArea.appendChild(pre);
                }
            }
            return;
        }

        if (toolName === 'list_dir' && contentArea) {
            statusIcon.classList.remove('loading');
            statusIcon.innerHTML = '';

            if (status === 'completed') {
                // Show success checkmark
                statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
                statusIcon.classList.add('completed');
            } else if (status === 'error') {
                statusIcon.innerHTML = '❌';
            }
            return;
        }

        // Update status
        if (status === 'completed') {
            statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
            statusIcon.classList.remove('loading');
            statusIcon.classList.add('completed');
        } else if (status === 'error') {
            statusIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
            statusIcon.classList.remove('loading');
            statusIcon.classList.add('error');
        }

        const isWriteTool = ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'apply_diff', 'multi_edit'].includes(toolName);

        if (result && status === 'error') {
            if (contentArea) {
                const pre = document.createElement('pre');
                pre.textContent = '\nError:\n' + JSON.stringify(result, null, 2);
                contentArea.appendChild(pre);
            }
        } else if (result && contentArea && !isWriteTool && toolName !== 'read_file' && toolName !== 'list_dir') {
            // For non-write tools, append the result text/JSON
            const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

            if (contentArea.innerHTML.trim() !== '') {
                const hr = document.createElement('hr');
                hr.style.cssText = 'border: 0; border-top: 1px solid var(--vscode-widget-border); margin: 8px 0;';
                contentArea.appendChild(hr);
            }

            const pre = document.createElement('pre');
            pre.textContent = text;
            contentArea.appendChild(pre);
        }

        if (messagesEl) {
            messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
        }
    }

    return {
        showToolExecution,
        updateToolExecution
    };
}
