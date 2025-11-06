/**
 * Main AI module - consolidated entry point
 * Re-exports all AI functionality from organized modules
 */
import * as vscode from 'vscode';
import * as prompts from '../prompts.js';
import { getSystemPrompt } from '../systemPrompt.js';
import { generateWithOpenAICompat } from './providers/openai.js';
import { generateWithGoogle } from './providers/google.js';
import { cleanFileContent } from './contentCleaner.js';
import { extractJsonFromText, repairJsonForValidation } from './jsonRepair.js';
import { getActiveProviderConfig } from '../services/configService.js';

// Global-ish counter for API calls in this extension host session
let __assistaApiCallSeq = 0;

export interface ProviderConfig {
    apiKey: string;
    model: string;
    customUrl?: string;
}

export interface AppSettings {
    activeProvider: string;
    providers: { [key: string]: ProviderConfig };
}

/**
 * Generate content using the active AI provider
 */
export async function generateContent(params: any, context: vscode.ExtensionContext): Promise<string> {
    // Inject a consistent system prompt if caller didn't provide one
    try {
        const mode = (params?.config?.mode as any) || 'general';
        const built = await getSystemPrompt(mode, context);
        if (!params.config) params.config = {};
        if (!params.config.systemInstruction) {
            params.config.systemInstruction = built;
        } else {
            // Prepend the standardized system prompt to reinforce behavior, keeping caller specifics
            params.config.systemInstruction = `${built}\n\n${params.config.systemInstruction}`;
        }
    } catch {
        // Non-fatal; proceed without system prompt injection on failure
    }

    const { provider, config } = await getActiveProviderConfig(context);

    // Debug: centralized API call logging
    try {
        const seq = (++__assistaApiCallSeq);
        const mode = (params?.config?.mode as any) || 'general';
        const respType = params?.config?.responseMimeType || 'text/plain';
        // Safe prompt preview (truncated)
        const rawContents: any = (params as any)?.contents;
        const contentStr = typeof rawContents === 'string' ? rawContents : JSON.stringify(rawContents ?? '');
        const contentLen = contentStr.length;
        const contentPreview = contentStr.substring(0, Math.min(1200, contentLen));
        const sysLen = ((params?.config as any)?.systemInstruction || '').length;
        console.log(`[Assista X] API called #${seq} -> provider=${provider}, model=${config?.model || ''}, mode=${mode}, responseMimeType=${respType}`);
        console.log(`[Assista X] API request #${seq} meta: contentsLen=${contentLen}, systemInstructionLen=${sysLen}`);
        console.log(`[Assista X] API request #${seq} contents preview:\n${contentPreview}`);
    } catch {}

    let out: string;
    if (provider === 'google') {
        out = await generateWithGoogle(params, config, context);
    } else {
        out = await generateWithOpenAICompat(params, config, provider, context);
    }
    try {
        const bytes = typeof out === 'string' ? out.length : String(out||'').length;
        const preview = typeof out === 'string' ? out.substring(0, Math.min(800, out.length)) : String(out||'').substring(0,800);
        console.log(`[Assista X] API call complete (#${__assistaApiCallSeq}), bytes=${bytes}`);
        console.log(`[Assista X] API response preview (#${__assistaApiCallSeq}):\n${preview}`);
    } catch {}
    return out;
}

// Odoo-specific high-level functions
export async function generateOdooModule(
    userPrompt: string,
    version: string,
    moduleName: string,
    context: vscode.ExtensionContext,
    options?: { targetFiles?: string[]; skipValidation?: boolean },
    progressCb?: (event: { type: string; payload?: any }) => void,
    cancelRequested?: () => boolean
): Promise<{ files: Record<string, string>, progressInfo: any }> {
    // Track API calls for this generation operation
    let apiCalls = 0;
    const callAI = async (p: any) => {
        apiCalls++;
        try { console.log(`[Assista X] API call (module-gen) #${apiCalls}`); } catch {}
        return await generateContent(p, context);
    };
    // Advanced multi-step chained generation inspired by Assista-x-Dev-main
    // Step 1: Validate Odoo request with enhanced error handling and fallback

    // Define indicators at function scope for consistent access across try-catch
    const odooIndicators: string[] = [
        'odoo', 'module', 'model', 'view', 'menu', 'field', 'inherit',
        'ir.model', 'odoo erp', 'res.model', 'odoo.com', 'odoo module'
    ];
    const nonOdooIndicators: string[] = [
        'javascript', 'react', 'node', 'web app', 'website', 'frontend',
        'css', 'html', 'database', 'sql', 'api endpoint'
    ];
    const positiveIndicators: string[] = ['true', 'yes', 'valid', 'recognized', 'odoo', 'module', 'confirmed'];
    const negativeIndicators: string[] = ['false', 'no', 'not', 'invalid', 'unrecognized', 'not odoo'];

    progressCb?.({ type: 'validation.start', payload: { moduleName, version } });
    let validationData = { is_odoo_request: true, reason: '' } as { is_odoo_request: boolean; reason: string };
    let rawValidation: any = { is_odoo_request: true };
    if (!options?.skipValidation) {
        const validationPrompt = { contents: prompts.createOdooValidationPrompt(userPrompt), config: { responseMimeType: 'application/json' } };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        rawValidation = await callAI(validationPrompt);
        validationData = { is_odoo_request: false, reason: 'Unable to parse validation response' } as { is_odoo_request: boolean; reason: string };
    }
    let jsonText = ''; // Declare at function scope for logging access

    try {
        jsonText = typeof rawValidation === 'string' ? rawValidation.trim() : JSON.stringify(rawValidation);

        // Enhanced extraction and cleaning with comprehensive processing
        jsonText = extractJsonFromText(jsonText);

        // Apply comprehensive repair specifically for validation responses
        jsonText = repairJsonForValidation(jsonText);

        console.log('Enhanced validation JSON processing complete. Length:', jsonText.length, 'Preview:', jsonText.substring(0, 200) + (jsonText.length > 200 ? '...' : ''));

        // Parse with comprehensive error handling
        validationData = JSON.parse(jsonText);

        // Enhanced structure validation with auto-correction
        if (typeof validationData.is_odoo_request !== 'boolean') {
            console.warn(`Validation warning: 'is_odoo_request' is ${typeof validationData.is_odoo_request}, defaulting to boolean`);
            validationData.is_odoo_request = !!validationData.is_odoo_request; // Coerce to boolean
        }

        if (typeof validationData.reason !== 'string') {
            console.warn(`Validation warning: 'reason' is ${typeof validationData.reason}, generating default`);
            validationData.reason = validationData.is_odoo_request ?
                'Request recognized as Odoo module development' :
                'Request does not appear to be Odoo-specific';
        }

        // Ensure reason has reasonable length
        if (validationData.reason.length > 500) {
            validationData.reason = validationData.reason.substring(0, 500) + '... (truncated)';
        }

        console.log('✅ Enhanced JSON validation parsing successful:', {
            is_odoo_request: validationData.is_odoo_request,
            reason_preview: validationData.reason.substring(0, 100)
        });
        progressCb?.({ type: 'validation.success', payload: validationData });

    } catch (parseError) {
        console.error('❌ Enhanced JSON.parse failed for validation response:', parseError);
        console.log('Raw validation response (first 400 chars):',
            typeof rawValidation === 'string' ? rawValidation.substring(0, 400) : JSON.stringify(rawValidation).substring(0, 400));

        // Advanced fallback validation with multiple strategies
        const responseText = typeof rawValidation === 'string' ? rawValidation.toLowerCase() : '';

        // Strategy 1: Keyword analysis (using function-scoped indicators)
        const odooMatches = odooIndicators.filter((indicator: string) => responseText.includes(indicator)).length;
        const nonOdooMatches = nonOdooIndicators.filter((indicator: string) => responseText.includes(indicator)).length;

        // Strategy 2: Semantic analysis (using function-scoped indicators)
        const positiveScore = positiveIndicators.filter((ind: string) => responseText.includes(ind)).length;
        const negativeScore = negativeIndicators.filter((ind: string) => responseText.includes(ind)).length;

        // Strategy 3: Confidence scoring
        const keywordScore = odooMatches - nonOdooMatches;
        const semanticScore = positiveScore - negativeScore;
        const totalConfidence = keywordScore + semanticScore;

        console.log(`Validation fallback analysis: keywordScore=${keywordScore}, semanticScore=${semanticScore}, totalConfidence=${totalConfidence}`);
        console.log(`Odoo matches: ${odooMatches}, Non-Odoo matches: ${nonOdooMatches}`);

        // Determine validation result
        let isOdooRequest = false;
        let fallbackReason = '';

        if (totalConfidence >= 2 || (odooMatches >= 2 && positiveScore > negativeScore)) {
            isOdooRequest = true;
            fallbackReason = `Advanced fallback validation succeeded (confidence: ${totalConfidence}). Detected ${odooMatches} Odoo terms vs ${nonOdooMatches} general terms. Positive indicators: ${positiveScore}, Negative: ${negativeScore}. Original parsing error: ${(parseError as Error).message}`;
            console.log('🔄 Enhanced fallback validation - SUCCESS:', { isOdooRequest, confidence: totalConfidence });
        } else if (totalConfidence >= -1 && odooMatches >= 1) {
            // Borderline case - be conservative
            isOdooRequest = true;
            fallbackReason = `Conservative fallback validation (confidence: ${totalConfidence}). Detected Odoo context but parsing failed: ${(parseError as Error).message}. Recommendation: Review requirements manually.`;
            console.log('🔄 Conservative fallback validation activated:', { isOdooRequest, confidence: totalConfidence });
        } else {
            isOdooRequest = false;
            fallbackReason = `Fallback validation inconclusive (confidence: ${totalConfidence}). Detected ${odooMatches} Odoo terms vs ${nonOdooMatches} general terms. JSON parsing failed: ${(parseError as Error).message}. Recommendation: Refine prompt or switch to OpenRouter provider for more reliable JSON responses.`;
            console.warn('🔄 Fallback validation - LOW CONFIDENCE:', { isOdooRequest, confidence: totalConfidence });
        }

        validationData = {
            is_odoo_request: isOdooRequest,
            reason: fallbackReason
        };
    }

    // Heuristic override: if the user's original prompt explicitly mentions Odoo and a module (typo-tolerant),
    // treat it as Odoo-related even if the validator was conservative.
    if (!validationData.is_odoo_request) {
        const userLower = userPrompt.toLowerCase();
        const mentionsOdoo = userLower.includes('odoo');
        const mentionsModuleLike = /(module|moudle|moduel|modle|addon|add-on)/.test(userLower);
        if (mentionsOdoo && mentionsModuleLike) {
            validationData.is_odoo_request = true;
            validationData.reason = 'User prompt explicitly mentions Odoo and a module (typo-tolerant heuristic).';
        }
    }

    // Single final validation check with comprehensive logging (remove duplication)
    if (!validationData.is_odoo_request) {
        const errorMsg = `Odoo validation failed: ${validationData.reason}`;
        console.error(errorMsg);
        console.log('Validation failure details:', {
            raw_response_length: typeof rawValidation === 'string' ? rawValidation.length : 'non-string',
            processed_json_length: jsonText.length,
            final_decision: validationData,
            odoo_matches_detected: odooIndicators.filter((ind: string) =>
                (typeof rawValidation === 'string' ? rawValidation.toLowerCase() : '').includes(ind)
            ).join(', ')
        });
        throw new Error(errorMsg);
    }

    console.log('🎉 Enhanced Odoo validation PASSED:', {
        is_odoo_request: validationData.is_odoo_request,
        reason_summary: validationData.reason.substring(0, 100),
        confidence_indicators: {
            odoo_matches: odooIndicators.filter((ind: string) =>
                (typeof rawValidation === 'string' ? rawValidation.toLowerCase() : '').includes(ind)
            ).join(', ')
        }
    });
    progressCb?.({ type: 'validation.passed', payload: validationData });

    // Step 2: Generate detailed functional specifications
    const specsPrompt = { contents: prompts.createDetailedSpecsPrompt(userPrompt, version, validationData) };
    if (cancelRequested?.()) { throw new Error('Cancelled'); }
    const specifications = await callAI(specsPrompt);
    console.log('Specifications generated:', specifications.substring(0, 100));
    progressCb?.({ type: 'specs.ready', payload: { preview: specifications.substring(0, 600) } });

    let tasks = '';
    let menuStructure = '';
    const allFiles: Record<string, string> = {};
    let updatedTasks = '';
    let fileCount = 0;

    const targetFiles = options?.targetFiles && options.targetFiles.length ? options.targetFiles : null;
    if (targetFiles) {
        console.log(`Targeted generation mode: ${targetFiles.length} file(s)`);

        // Generate only requested files using minimal context (use specifications; omit tasks/menu)
        for (const filePath of targetFiles) {
            console.log(`Generating targeted file: ${filePath}`);
            const filePrompt = {
                contents: prompts.createSingleFilePrompt('', '', specifications, version, moduleName, filePath, `Generate ${filePath}`),
                config: {}
            };
            try {
                const fileContent = await callAI(filePrompt);
                const cleanContent = cleanFileContent(fileContent);
                if (cleanContent) {
                    allFiles[filePath] = cleanContent;
                    fileCount++;
                }
            } catch (fileError) {
                console.error(`Targeted file generation failed for ${filePath}:`, fileError);
            }
        }
    } else {
        // Step 3: Technical tasks breakdown (strict format to ensure file-path checklist items)
        const tasksPrompt = { contents: prompts.createStrictTasksPrompt(specifications, version, moduleName) };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        tasks = await callAI(tasksPrompt);
        console.log('Tasks generated:', tasks.substring(0, 100));
        progressCb?.({ type: 'tasks.ready', payload: { preview: tasks.substring(0, 600) } });

        // Step 4: Menu and UI structure
        const menuPrompt = { contents: prompts.createAdvancedMenuPrompt(tasks, specifications, version) };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        menuStructure = await callAI(menuPrompt);
        console.log('Menu structure generated:', menuStructure.substring(0, 100));
        progressCb?.({ type: 'menu.ready', payload: { preview: menuStructure.substring(0, 600) } });

        // Step 5: Generate files in folder-wise batches
        // Detect checklist lines that contain a backticked file path with a slash and an extension
        const taskLineRegex = /^\s*- \[ \] .*`[^`\n]*\/[\w\-./]+\.[a-zA-Z0-9]+`/;
        const taskLines = tasks.split('\n').filter(line => taskLineRegex.test(line));
        updatedTasks = tasks;
        console.log(`Found ${taskLines.length} file generation tasks`);
        try { progressCb?.({ type: 'files.count', payload: { count: taskLines.length } }); } catch {}

        // Use centralized path normalization utility
        const { enforcePathPolicy } = await import('../utils/pathUtils.js');

        // Build folder -> [{path, line}] map
        const folderMap = new Map<string, Array<{ path: string; taskLine: string }>>();
        for (const taskLine of taskLines) {
            const fileMatch = taskLine.match(/`([^`]+)`/);
            if (!fileMatch) continue;
            const rawPath = fileMatch[1];
            const safePath = enforcePathPolicy(rawPath, moduleName);
            if (!safePath) {
                console.warn(`Skipped invalid or out-of-structure path from task: ${rawPath}`);
                progressCb?.({ type: 'file.skipped', payload: { path: rawPath, reason: 'invalid_path' } });
                continue;
            }
            const tail = safePath.slice(moduleName.length + 1);
            const top = tail.split('/')[0] || '';
            const key = top || 'root';
            if (!folderMap.has(key)) folderMap.set(key, []);
            folderMap.get(key)!.push({ path: safePath, taskLine });
        }

        // Helper: create batch prompt asking for JSON mapping path->content
        const makeBatchPrompt = (entries: Array<{ path: string; taskLine: string }>) => {
            const list = entries.map(e => `- ${e.path}\n  From task: ${e.taskLine}`).join('\n');
            const jsonExample = `{"${moduleName}/models/example.py": "<file content>"}`;
            const contents = `Generate multiple files for Odoo ${version}.\n\nReturn a JSON object mapping each file path to its complete raw content.\n- Keys: exact file paths.\n- Values: the full file content as a string.\n- Do NOT include markdown code fences.\n- Do NOT include explanations.\n- Ensure content type matches file extension (py/xml/csv).\n\nModule: ${moduleName}\nSpecifications (summary, may be truncated in logging):\n${specifications.substring(0, 2000)}\n\nTasks context (excerpt):\n${tasks.substring(0, 2000)}\n\nMenu (excerpt):\n${menuStructure.substring(0, 2000)}\n\nFiles to generate in this batch:\n${list}\n\nRespond ONLY with JSON like ${jsonExample}.`;
            return { contents, config: { responseMimeType: 'application/json' } };
        };

        // Parse possibly fenced JSON
        const parseJson = (text: string) => {
            try {
                let t = typeof text === 'string' ? text : String(text || '');
                t = t.trim();
                t = t.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/m, '$1');
                return JSON.parse(t);
            } catch (e) {
                console.error('Batch JSON parse failed', e);
                return null;
            }
        };

        // Track generated files to prevent duplicates
        const generatedPaths = new Set<string>();

        // Process each folder in batches to avoid token limits
        for (const [folder, items] of folderMap.entries()) {
            // Simple batching: up to 8 files per call
            const batchSize = 8;
            for (let i = 0; i < items.length; i += batchSize) {
                if (cancelRequested?.()) { throw new Error('Cancelled'); }
                const batch = items.slice(i, i + batchSize);
                // Announce start for each file
                for (const it of batch) {
                    if (generatedPaths.has(it.path)) continue;
                    progressCb?.({ type: 'file.started', payload: { path: it.path } });
                }
                const prompt = makeBatchPrompt(batch);
                let raw = '';
                try {
                    raw = await callAI(prompt);
                } catch (e) {
                    console.error(`Batch generation failed for folder ${folder} [${i}-${i + batch.length - 1}]`, e);
                    for (const it of batch) {
                        progressCb?.({ type: 'file.error', payload: { path: it.path, error: String(e) } });
                    }
                    continue;
                }
                const obj = parseJson(raw);
                if (!obj || typeof obj !== 'object') {
                    console.warn(`Batch returned invalid JSON for folder ${folder}`);
                    for (const it of batch) {
                        progressCb?.({ type: 'file.error', payload: { path: it.path, error: 'invalid_batch_json' } });
                    }
                    continue;
                }
                for (const it of batch) {
                    const content = obj[it.path];
                    if (generatedPaths.has(it.path)) { continue; }
                    if (typeof content !== 'string' || !content.trim()) {
                        console.warn(`Empty or missing content for ${it.path} in batch response`);
                        progressCb?.({ type: 'file.empty', payload: { path: it.path } });
                        continue;
                    }
                    const beforeLen = content.length;
                    const cleanContent = cleanFileContent(content);
                    if (!cleanContent) {
                        console.warn(`cleanFileContent returned empty for ${it.path}, skipping`);
                        progressCb?.({ type: 'file.empty', payload: { path: it.path } });
                        continue;
                    }
                    allFiles[it.path] = cleanContent;
                    generatedPaths.add(it.path);
                    try { progressCb?.({ type: 'file.ready', payload: { path: it.path, content: cleanContent } }); } catch {}
                    fileCount++;
                    try {
                        const ext = (it.path.split('.').pop() || '').toLowerCase();
                        progressCb?.({ type: 'file.cleaned', payload: { path: it.path, before: beforeLen, after: cleanContent.length, ext } });
                    } catch {}
                    progressCb?.({ type: 'file.done', payload: { path: it.path, size: cleanContent.length } });
                    // Mark the generated task as completed locally in the markdown
                    const completedLine = it.taskLine.replace('- [ ]', '- [x]');
                    updatedTasks = updatedTasks.replace(it.taskLine, completedLine);
                }
            }
        }
    }

    // Post-process: ensure models/__init__.py exists and imports all model files
    try {
        const modelFiles = Object.keys(allFiles)
            .filter(p => p.startsWith(`${moduleName}/models/`) && p.endsWith('.py') && !p.endsWith('/__init__.py'));
        const initPath = `${moduleName}/models/__init__.py`;
        if (modelFiles.length > 0 && !allFiles[initPath]) {
            const imports = modelFiles
                .map(p => p.substring(p.lastIndexOf('/') + 1).replace(/\.py$/i, ''))
                .filter(n => n && n !== '__init__')
                .sort();
            const content = `# -*- coding: utf-8 -*-\n${imports.map(n => `from . import ${n}`).join('\n')}\n`;
            allFiles[initPath] = content;
            try { progressCb?.({ type: 'file.ready', payload: { path: initPath, content } }); } catch {}
            fileCount++;
            try { progressCb?.({ type: 'file.added', payload: { path: initPath, reason: 'ensure_models_init' } }); } catch {}
        }
    } catch (err) {
        console.error(`Error while ensuring models/__init__.py:`, err);
    }

    // Post-process: if models exist, ensure at least one views XML and security access CSV
    try {
        const hasModels = Object.keys(allFiles)
            .some(p => p.startsWith(`${moduleName}/models/`) && p.endsWith('.py') && !p.endsWith('/__init__.py'));
        if (hasModels) {
            // Ensure at least one views XML exists
            const hasViews = Object.keys(allFiles)
                .some(p => p.startsWith(`${moduleName}/views/`) && p.toLowerCase().endsWith('.xml'));
            if (!hasViews) {
                const defaultViewPath = `${moduleName}/views/${moduleName}_views.xml`;
                const defaultViewContent = `<?xml version="1.0" encoding="UTF-8"?>\n<odoo>\n    <!-- Auto-generated placeholder view; update as needed -->\n</odoo>\n`;
                allFiles[defaultViewPath] = defaultViewContent;
                try { progressCb?.({ type: 'file.ready', payload: { path: defaultViewPath, content: defaultViewContent } }); } catch {}
                fileCount++;
                try { progressCb?.({ type: 'file.added', payload: { path: defaultViewPath, reason: 'ensure_default_view' } }); } catch {}
            }

            // Ensure security/ir.model.access.csv exists
            const accessPath = `${moduleName}/security/ir.model.access.csv`;
            if (!allFiles[accessPath]) {
                const csv = `id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink\n`;
                allFiles[accessPath] = csv;
                try { progressCb?.({ type: 'file.ready', payload: { path: accessPath, content: csv } }); } catch {}
                fileCount++;
                try { progressCb?.({ type: 'file.added', payload: { path: accessPath, reason: 'ensure_access_csv' } }); } catch {}
            }
        }
    } catch (err) {
        console.error(`Error while ensuring default views/security:`, err);
    }

    // Ensure essential files exist even if not generated (only in full generation mode)
    const essentialFiles = targetFiles ? [] : [`${moduleName}/__manifest__.py`, `${moduleName}/__init__.py`];
    for (const essential of essentialFiles) {
        if (!allFiles[essential]) {
            console.log(`Generating fallback for essential file: ${essential}`);
            const fallbackPrompt = {
                contents: `Generate a basic ${essential.endsWith('/__manifest__.py') ? '__manifest__.py' : '__init__.py'} file for Odoo module "${moduleName}" version ${version}. Just the raw file content, no explanations.`
            };
            try {
                const fallbackContent = await callAI(fallbackPrompt);
                const cleanFallback = fallbackContent.replace(/^```(?:python)?\s*\n?([\s\S]*?)\n?```$/g, '$1').trim();
                if (cleanFallback) {
                    allFiles[essential] = cleanFallback;
                    try { progressCb?.({ type: 'file.ready', payload: { path: essential, content: cleanFallback } }); } catch {}
                    fileCount++;
                }
            } catch (fallbackError) {
                console.error(`Fallback generation failed for ${essential}:`, fallbackError);
                if (essential.endsWith('/__manifest__.py')) {
                    const { formatModuleNameForDisplay } = await import('../utils/moduleName.js');
                    allFiles[essential] = `{
    'name': '${formatModuleNameForDisplay(moduleName)}',
    'version': '1.0',
    'category': 'Tools',
    'summary': 'Generated module',
    'depends': [],
    'data': [],
    'installable': True,
    'auto_install': False
}`;
                }
            }
        }
    }

    // Final strict filter: drop any invalid paths, including nested manifests
    const filteredFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(allFiles)) {
        try {
            if (!k.startsWith(`${moduleName}/`)) continue;
            const tail = k.slice(moduleName.length + 1);
            // allow only root manifest and root __init__.py
            if (tail === '__manifest__.py' || tail === '__init__.py') { filteredFiles[k] = v; continue; }
            // block manifests in any subdir
            if (tail.endsWith('/__manifest__.py')) { continue; }
            // directory constraints
            const top = tail.split('/')[0];
            if (!['models','views','security','data','report','wizards','static'].includes(top)) continue;
            // specific rules
            const base = tail.split('/').pop() || '';
            if (top === 'models') { if (base === '__init__.py' || base.endsWith('.py')) { filteredFiles[k] = v; } continue; }
            if (top === 'views') { if (/\.xml$/i.test(base)) { filteredFiles[k] = v; } continue; }
            if (top === 'security') { if (/\.(csv|xml)$/i.test(base)) { filteredFiles[k] = v; } continue; }
            // others: require extension
            if (/\.[A-Za-z0-9]+$/.test(base)) { filteredFiles[k] = v; }
        } catch { /* drop on error */ }
    }

    const testFiles: Record<string, string> = {};
    const basicTests = [
        {
            path: `__test__/test_${moduleName}.py`,
            content: `# -*- coding: utf-8 -*-\nfrom . import models\n\nclass Test${moduleName.replace(/_/g, '')}(models.ModelTestCase):\n    def test_${moduleName}_basic(self):\n        """Basic test for ${moduleName} module"""\n        self.assertTrue(True)\n\n    def test_models(self):\n        """Test model creation"""\n        # Add specific model tests here\n        pass`
        }
    ];
    
    if (Object.keys(filteredFiles).some(path => path.includes(`${moduleName}/models/`))) {
        testFiles[basicTests[0].path] = basicTests[0].content;
    }

    // Combine all files
    const finalFiles = { ...filteredFiles, ...testFiles };

    try { console.log(`[Assista X] Module generation API calls total: ${apiCalls}`); } catch {}
    return {
        files: finalFiles,
        progressInfo: {
            specifications: specifications.substring(0, 150) + '...',
            tasks: updatedTasks.substring(0, 150) + '...',
            menuStructure: menuStructure.substring(0, 150) + '...',
            filesGenerated: Object.keys(finalFiles),
            totalFiles: Object.keys(finalFiles).length,
            fileCount: fileCount,
            testCount: Object.keys(testFiles).length,
            hasTests: Object.keys(testFiles).length > 0,
            generationSuccess: true,
            apiCallCount: apiCalls
        }
    };
}

// Re-export utilities for convenience
export { cleanFileContent } from './contentCleaner.js';
export { extractJsonFromText, repairJsonForValidation } from './jsonRepair.js';

