 /**
 * Main AI module - consolidated entry point
 * Re-exports all AI functionality from organized modules
 */
import * as vscode from 'vscode';
import { createHash } from 'crypto';
import * as prompts from '../prompts.js';
import { getSystemPrompt } from '../systemPrompt.js';
import { generateWithOpenAICompat } from './providers/openai.js';
import { generateWithGoogle } from './providers/google.js';
import { cleanFileContent } from './contentCleaner.js';
import { getOrCreateContext } from './context.js';
import { extractJsonFromText, repairJsonForValidation } from './jsonRepair.js';
import { getActiveProviderConfig } from '../services/configService.js';
import { detectOdooVersion, findOdooConf, parseAddonsPaths, chooseWritableAddonsPath, ensurePathInConf, scanExistingModules } from '../services/odooEnv.js';
import { generateContextSummary, summarize } from './summarize.js';
import { validatePython, validateXML } from '../validate/validators.js';
import * as tools from '../services/toolService.js';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    customUrl?: string;
}

export interface AppSettings {
    activeProvider: string;
    providers: { [key: string]: ProviderConfig };
}

// ===== OPTIMIZATION: Caching and Session Management =====

// Prompt caching to avoid redundant disk I/O
const systemPromptCache = new Map<string, string>();

async function getCachedSystemPrompt(mode: string, context: vscode.ExtensionContext): Promise<string> {
    const cacheKey = `${mode}`;
    if (systemPromptCache.has(cacheKey)) {
        return systemPromptCache.get(cacheKey)!;
    }
    const prompt = await getSystemPrompt(mode as any, context);
    systemPromptCache.set(cacheKey, prompt);
    return prompt;
}

// Functional specification caching to avoid re-sending large specs
const specCache = new Map<string, { spec: string; timestamp: number }>();
const SPEC_CACHE_TTL = 300000; // 5 minutes cache

function createSpecCacheKey(moduleName: string, version: string, prompt: string): string {
    const normalizedPrompt = (prompt || '').trim();
    if (!normalizedPrompt) {
        return `${moduleName}:${version}:noprompt`;
    }
    const hash = createHash('md5').update(normalizedPrompt).digest('hex').slice(0, 8);
    return `${moduleName}:${version}:${hash}`;
}

function getCachedSpec(moduleName: string, version: string, prompt: string): string | null {
    const cacheKey = createSpecCacheKey(moduleName, version, prompt);
    const cached = specCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < SPEC_CACHE_TTL) {
        return cached.spec;
    }
    return null;
}

function setCachedSpec(moduleName: string, version: string, prompt: string, spec: string): void {
    const cacheKey = createSpecCacheKey(moduleName, version, prompt);
    specCache.set(cacheKey, { spec, timestamp: Date.now() });
}

// Session context to track if system prompt was already injected and store summaries
const sessionContext = new WeakMap<vscode.ExtensionContext, { 
    basePrompt?: string; 
    systemPromptSummary?: string; // Short summary of system prompt for reuse
    hasSentFullSystemPrompt?: boolean; // Track if we've sent full prompt once
    conversationSummary?: string; // Accumulated conversation/response summary
    providerConfig?: { provider: string; config: ProviderConfig };
    generationStats?: {
        filesGenerated: number;
        filesFailed: number;
        filesRetried: number;
        startTime: number;
        endTime?: number;
    };
}>();

function getSessionContext(context: vscode.ExtensionContext) {
    if (!sessionContext.has(context)) {
        sessionContext.set(context, {});
    }
    return sessionContext.get(context)!;
}

// Generate a concise system prompt summary (one-time, cached)
function generateSystemPromptSummary(basePrompt: string): string {
    // Extract key parts without needing AI call
    const lines = basePrompt.split('\n');
    const keyParts: string[] = [];
    
    // Extract role
    const roleLine = lines.find(l => l.includes('Assista X') || l.includes('expert'));
    if (roleLine) keyParts.push(roleLine.trim());
    
    // Extract mode
    const modeLine = lines.find(l => l.startsWith('Mode:'));
    if (modeLine) keyParts.push(modeLine.trim());
    
    // Extract capabilities (first 2-3)
    const capabilities = lines.filter(l => l.trim().startsWith('-') && l.length < 100);
    if (capabilities.length > 0) {
        keyParts.push('Capabilities: ' + capabilities.slice(0, 2).map(c => c.trim()).join(', '));
    }
    
    return keyParts.join('. ') || 'Assista X - Odoo development assistant';
}

// Provider config caching
let cachedProviderConfig: { provider: string; config: ProviderConfig; timestamp: number } | null = null;
const PROVIDER_CONFIG_CACHE_TTL = 60000; // 1 minute cache

async function getCachedProviderConfig(context: vscode.ExtensionContext): Promise<{ provider: string; config: ProviderConfig }> {
    const now = Date.now();
    if (cachedProviderConfig && (now - cachedProviderConfig.timestamp) < PROVIDER_CONFIG_CACHE_TTL) {
        return { provider: cachedProviderConfig.provider, config: cachedProviderConfig.config };
    }
    const result = await getActiveProviderConfig(context);
    cachedProviderConfig = { ...result, timestamp: now };
    return result;
}

// Provider client instance caching (Google/OpenAI)
let cachedProviderClients = new Map<string, { client: any; timestamp: number }>();
const CLIENT_CACHE_TTL = 300000; // 5 minutes

async function getCachedProviderClient(provider: string, config: ProviderConfig, context: vscode.ExtensionContext): Promise<any> {
    const cacheKey = `${provider}:${config.model}`;
    const cached = cachedProviderClients.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CLIENT_CACHE_TTL) {
        return cached.client;
    }
    
    let client: any;
    if (provider === 'google') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.apiKey);
        client = genAI.getGenerativeModel({ model: config.model });
    } else {
        // For OpenAI-compatible, we cache the config, not the client (stateless)
        client = { provider, config };
    }
    
    cachedProviderClients.set(cacheKey, { client, timestamp: Date.now() });
    return client;
}

// ===== OPTIMIZATION: Rate Limiting and Request Queue =====
interface RateLimitState {
    requestTimestamps: number[]; // Track request timestamps for sliding window
    blockedUntil: number; // Timestamp when rate limit is cleared (from Retry-After)
    consecutiveFailures: number; // Track consecutive 429 errors to adapt batch size
}

const rateLimitStates = new Map<string, RateLimitState>(); // Key: provider:model

function getRateLimitState(provider: string, model: string): RateLimitState {
    const key = `${provider}:${model}`;
    if (!rateLimitStates.has(key)) {
        rateLimitStates.set(key, {
            requestTimestamps: [],
            blockedUntil: 0,
            consecutiveFailures: 0
        });
    }
    return rateLimitStates.get(key)!;
}

// Rate limits per provider (requests per minute)
const RATE_LIMITS: Record<string, { rpm: number; defaultBatchSize: number }> = {
    'google': { rpm: 10, defaultBatchSize: 3 }, // Free tier: 10 RPM
    'openai': { rpm: 60, defaultBatchSize: 6 }, // Typical: 60 RPM
    'openrouter': { rpm: 120, defaultBatchSize: 6 }, // Typical: 120 RPM
    'default': { rpm: 60, defaultBatchSize: 6 }
};

// Extract retry-after delay from error response
function extractRetryAfter(error: any): number | null {
    try {
        // Google API includes retry delay in errorDetails
        if (error?.errorDetails) {
            for (const detail of error.errorDetails) {
                if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
                    const retryDelay = detail.retryDelay;
                    if (retryDelay) {
                        // Parse delay string like "14.95524612s" or number
                        const delayStr = String(retryDelay);
                        const seconds = parseFloat(delayStr.replace('s', ''));
                        if (!isNaN(seconds)) {
                            return Math.ceil(seconds * 1000); // Convert to ms
                        }
                    }
                }
            }
        }
        // Check for Retry-After header in HTTP response
        if (error?.response?.headers?.['retry-after']) {
            return parseInt(error.response.headers['retry-after']) * 1000;
        }
    } catch (e) {
        // Ignore parsing errors
    }
    return null;
}

// Wait if rate limit is active
async function waitForRateLimit(provider: string, model: string): Promise<void> {
    const state = getRateLimitState(provider, model);
    const now = Date.now();
    
    // Check if we're blocked by Retry-After header
    if (state.blockedUntil > now) {
        const waitTime = state.blockedUntil - now;
        console.log(`⏳ Rate limit active, waiting ${(waitTime / 1000).toFixed(1)}s (Retry-After)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        state.blockedUntil = 0; // Clear after waiting
    }
    
    // Check sliding window rate limit
    const limits = RATE_LIMITS[provider] || RATE_LIMITS['default'];
    const windowStart = now - 60000; // 1 minute window
    
    // Remove old timestamps outside the window
    state.requestTimestamps = state.requestTimestamps.filter(ts => ts > windowStart);
    
    // If we're at the limit, wait until oldest request expires
    if (state.requestTimestamps.length >= limits.rpm) {
        const oldestRequest = Math.min(...state.requestTimestamps);
        const waitTime = (oldestRequest + 60000) - now + 100; // Add 100ms buffer
        if (waitTime > 0) {
            console.log(`⏳ Rate limit reached (${state.requestTimestamps.length}/${limits.rpm} RPM), waiting ${(waitTime / 1000).toFixed(1)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            // Re-check after waiting
            state.requestTimestamps = state.requestTimestamps.filter(ts => ts > Date.now() - 60000);
        }
    }
    
    // Record this request
    state.requestTimestamps.push(Date.now());
}

// Get adaptive batch size based on rate limit status
function getAdaptiveBatchSize(provider: string, model: string): number {
    const state = getRateLimitState(provider, model);
    const limits = RATE_LIMITS[provider] || RATE_LIMITS['default'];
    
    // Reduce batch size if we've had recent rate limit failures
    if (state.consecutiveFailures >= 2) {
        return Math.max(1, Math.floor(limits.defaultBatchSize / 2)); // Halve batch size
    }
    
    // Check current request rate
    const now = Date.now();
    const recentRequests = state.requestTimestamps.filter(ts => ts > now - 60000).length;
    
    // Reduce batch size if approaching limit
    if (recentRequests >= limits.rpm * 0.8) {
        return Math.max(1, Math.floor(limits.defaultBatchSize / 2));
    }
    
    return limits.defaultBatchSize;
}

// Reset consecutive failures on successful request
function recordSuccess(provider: string, model: string): void {
    const state = getRateLimitState(provider, model);
    state.consecutiveFailures = 0;
}

// Record rate limit failure
function recordRateLimitFailure(provider: string, model: string, retryAfter: number | null): void {
    const state = getRateLimitState(provider, model);
    state.consecutiveFailures++;
    
    if (retryAfter) {
        state.blockedUntil = Date.now() + retryAfter;
        console.log(`🚫 Rate limit hit, blocked until ${new Date(state.blockedUntil).toISOString()}`);
    }
}

// Retry helper with exponential backoff and rate limit awareness
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    provider?: string,
    model?: string
): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const isRetryable = error?.code === 'ECONNRESET' || 
                               error?.code === 'ETIMEDOUT' || 
                               error?.code === 'ENOTFOUND' ||
                               error?.message?.toLowerCase().includes('network') ||
                               error?.status === 429 ||
                               (error?.status >= 500 && error?.status < 600);
            
            if (!isRetryable || attempt === maxRetries - 1) {
                // Record rate limit failure if applicable
                if (error?.status === 429 && provider && model) {
                    const retryAfter = extractRetryAfter(error);
                    recordRateLimitFailure(provider, model, retryAfter);
                }
                throw error;
            }
            
            // Handle 429 rate limit errors specially
            if (error?.status === 429 && provider && model) {
                const retryAfter = extractRetryAfter(error);
                if (retryAfter) {
                    recordRateLimitFailure(provider, model, retryAfter);
                    console.log(`⏳ Rate limit (429), waiting ${(retryAfter / 1000).toFixed(1)}s (Retry-After header)...`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue; // Retry after waiting
                }
            }
            
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

/**
 * Generate content using the active AI provider (OPTIMIZED)
 */
const TOOL_REGISTRY: Record<string, (...args: any[]) => Promise<any> | any> = {
    list_files: tools.listFiles,
    listFiles: tools.listFiles,
    get_file_content: tools.getFileContent,
    getFileContent: tools.getFileContent,
    write_file: tools.writeFileContent,
    writeFileContent: tools.writeFileContent,
    search_in_project: tools.searchInProject,
    searchInProject: tools.searchInProject,
};

export async function generateContent(params: any, context: vscode.ExtensionContext): Promise<any> {
    const extensionRequestStartTime = Date.now();
    const extensionRequestStartTimeISO = new Date().toISOString();
    
    const hasMessages = Array.isArray(params?.messages) && params.messages.length > 0;
    const hasContents = params?.contents && typeof params.contents === 'string';

    if (params?.toolCall) {
        const { name, args } = params.toolCall || {};
        const toolFn = TOOL_REGISTRY?.[name as keyof typeof TOOL_REGISTRY];
        if (typeof toolFn === 'function') {
            const toolArgs = Array.isArray(args) ? args : [];
            console.log(`[generateContent] Executing tool call "${name}" with args:`, toolArgs);
            return await toolFn(...toolArgs);
        }
        const availableTools = Object.keys(TOOL_REGISTRY).join(', ');
        console.warn(`[generateContent] Tool "${name}" not found in registry. Available tools: ${availableTools}`);
        return null;
    }
    
    // OPTIMIZATION: Use cached system prompt
    const sessCtx = getSessionContext(context);
    try {
        const mode = (params?.config?.mode as any) || 'general';
        if (!params.config) params.config = {};
        
        // OPTIMIZATION: Only send full system prompt once, then use summary
        if (!sessCtx.basePrompt) {
            sessCtx.basePrompt = await getCachedSystemPrompt(mode, context);
            sessCtx.systemPromptSummary = generateSystemPromptSummary(sessCtx.basePrompt);
        }
        
        // Only send full system prompt on first request of the session
        if (!sessCtx.hasSentFullSystemPrompt) {
            if (!params.config.systemInstruction) {
                params.config.systemInstruction = sessCtx.basePrompt;
            } else if (!params.config.systemInstruction.includes('Assista X')) {
                params.config.systemInstruction = `${sessCtx.basePrompt}\n\n${params.config.systemInstruction}`;
            }
            sessCtx.hasSentFullSystemPrompt = true;
        } else {
            // Use concise summary instead of full prompt for subsequent calls
            // Also include conversation summary if available (previous response context)
            const systemSummary = sessCtx.systemPromptSummary || sessCtx.basePrompt.substring(0, 150);
            const contextParts: string[] = [systemSummary];
            
            // Add conversation summary if available (previous response context)
            if (sessCtx.conversationSummary) {
                contextParts.push(sessCtx.conversationSummary);
            }
            
            const combinedContext = contextParts.join('\n\n');
            
            if (!params.config.systemInstruction) {
                params.config.systemInstruction = combinedContext;
            } else if (!params.config.systemInstruction.includes('Assista X')) {
                // Prepend summary instead of full prompt
                params.config.systemInstruction = `${combinedContext}\n\n${params.config.systemInstruction}`;
            }
        }
    } catch {
        // Non-fatal; proceed without system prompt injection on failure
    }

    // OPTIMIZATION: Use cached provider config
    const { provider, config } = await getCachedProviderConfig(context);
    sessCtx.providerConfig = { provider, config };
    
    // Build full request content for logging (truncate for performance)
    let fullRequestContent = '';
    if (hasMessages) {
        const systemPrompt = params.config?.systemInstruction || '';
        const allMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...params.messages] : params.messages;
        const requestObj = { model: config.model, messages: allMessages };
        fullRequestContent = JSON.stringify(requestObj, null, 2);
    } else if (hasContents) {
        const systemPrompt = params.config?.systemInstruction || '';
        fullRequestContent = systemPrompt ? `${systemPrompt}\n\n${params.contents}` : params.contents;
    }
    
    // OPTIMIZATION: Smart logging with 1000 char cap (configurable verbosity)
    const logBuffer: string[] = [];
    logBuffer.push(`\n[REQUEST TO AI PROVIDER] ${extensionRequestStartTimeISO}`);
    logBuffer.push(`Provider: ${provider} | Model: ${config.model}`);
    logBuffer.push(`--- REQUEST CONTENT START ---`);
    // Truncate to 1000 chars for better performance (was 2000)
    const requestPreview = fullRequestContent.length > 1000 
        ? fullRequestContent.substring(0, 1000) + `\n... [truncated, total: ${fullRequestContent.length} chars]`
        : fullRequestContent;
    logBuffer.push(requestPreview);
    logBuffer.push(`--- REQUEST CONTENT END ---\n`);
    // Flush logs asynchronously
    setTimeout(() => logBuffer.forEach(line => console.log(line)), 0);
    
    // OPTIMIZATION: Wait for rate limit before making request
    await waitForRateLimit(provider, config.model);
    
    // Call provider with retry logic
    const providerCallStartTime = Date.now();
    let result: string;
    
    try {
        result = await retryWithBackoff(async () => {
            if (provider === 'google') {
                return await generateWithGoogle(params, config, context);
            } else {
                return await generateWithOpenAICompat(params, config, provider, context);
            }
        }, 3, 1000, provider, config.model);
        
        // Record successful request
        recordSuccess(provider, config.model);
        
        // OPTIMIZATION: Lightweight context trimming - keep last 800 chars of response
        if (sessCtx && result && result.length > 0) {
            // Keep last 800 chars (not first 200) for better context continuity
            const trimmedResponse = result.length > 800 
                ? result.slice(-800).replace(/\n/g, ' ').trim()
                : result.replace(/\n/g, ' ').trim();
            sessCtx.conversationSummary = trimmedResponse.length > 600 
                ? `...${trimmedResponse.slice(-600)}` 
                : trimmedResponse;
        }
    } catch (error: any) {
        const extensionErrorTime = Date.now();
        const extensionErrorDuration = extensionErrorTime - extensionRequestStartTime;
        
        // OPTIMIZATION: Structured error logging with metadata
        const errorDetails = {
            timestamp: new Date().toISOString(),
            provider,
            model: config.model,
            duration: extensionErrorDuration,
            durationSeconds: (extensionErrorDuration / 1000).toFixed(2),
            error: error?.message || String(error),
            errorCode: error?.code,
            errorStatus: error?.status,
            stack: error?.stack?.split('\n').slice(0, 3).join('\n')
        };
        console.error(`\n[REQUEST FAILED]`, JSON.stringify(errorDetails, null, 2));
        
        // Create structured error
        const structuredError = new Error(`AI Provider Error (${provider}): ${error?.message || error}`);
        (structuredError as any).provider = provider;
        (structuredError as any).model = config.model;
        (structuredError as any).duration = extensionErrorDuration;
        (structuredError as any).originalError = error;
        throw structuredError;
    }
    
    // Calculate timing
    const extensionResponseTime = Date.now();
    const extensionResponseTimeISO = new Date().toISOString();
    const extensionTotalDuration = extensionResponseTime - extensionRequestStartTime;
    
    // OPTIMIZATION: Smart response logging with 1000 char cap
    const responseLogBuffer: string[] = [];
    responseLogBuffer.push(`\n[RESPONSE FROM AI PROVIDER] ${extensionResponseTimeISO}`);
    responseLogBuffer.push(`Provider: ${provider} | Model: ${config.model}`);
    responseLogBuffer.push(`Total Duration: ${extensionTotalDuration}ms (${(extensionTotalDuration / 1000).toFixed(2)}s)`);
    responseLogBuffer.push(`--- RESPONSE CONTENT START ---`);
    // Truncate to 1000 chars (was 5000)
    const responsePreview = result.length > 1000 
        ? result.substring(0, 1000) + `\n... [truncated, total: ${result.length} chars]`
        : result;
    responseLogBuffer.push(responsePreview);
    responseLogBuffer.push(`--- RESPONSE CONTENT END ---\n`);
    setTimeout(() => responseLogBuffer.forEach(line => console.log(line)), 0);
    
    return result;
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
    const sessionId = `${Date.now()}-${moduleName}`;
    const ctx = getOrCreateContext(sessionId, { sessionId, moduleName, userPrompt });
    ctx.userPrompt = userPrompt;
    ctx.moduleName = moduleName;
    ctx.artifacts = ctx.artifacts || {};
    ctx.generated = ctx.generated || {};

    const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const confPath = findOdooConf(baseDir);
    const odooVersion = detectOdooVersion(baseDir);
    const addonsPaths = parseAddonsPaths(confPath);
    const { path: targetAddonsPath, created } = chooseWritableAddonsPath(baseDir, addonsPaths);
    if (created && confPath) ensurePathInConf(confPath, targetAddonsPath);
    const existingModules = scanExistingModules([targetAddonsPath, ...addonsPaths]);
    ctx.project = { odooVersion, addonsPaths, targetAddonsPath, configPath: confPath, existingModules };

    if (targetAddonsPath) {
        try {
            const listResult = await generateContent({ toolCall: { name: 'listFiles', args: [targetAddonsPath] } }, context);
            const files = (listResult && typeof listResult === 'object') ? (listResult as any).data : undefined;
            if (Array.isArray(files)) {
                (ctx.project as any).workspaceFiles = files;
                console.log(`[generateOdooModule] Workspace listing ready (${files.length} entries).`);
            } else if (listResult && typeof listResult === 'object' && 'error' in (listResult as any)) {
                console.warn('[generateOdooModule] listFiles tool returned error:', (listResult as any).error);
            }
        } catch (toolError) {
            console.warn('[generateOdooModule] listFiles tool call failed:', toolError);
        }
    }

    progressCb?.({ type: 'env.ready', payload: ctx.project });

    const resolvedVersion = ctx.project?.odooVersion || version;

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

    progressCb?.({ type: 'validation.start', payload: { moduleName, version: resolvedVersion } });
    let validationData = { is_odoo_request: true, reason: '' } as { is_odoo_request: boolean; reason: string };
    let rawValidation: any = { is_odoo_request: true };
    if (!options?.skipValidation) {
        const validationPrompt = { contents: prompts.createOdooValidationPrompt(userPrompt), config: { responseMimeType: 'application/json' } };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        rawValidation = await generateContent(validationPrompt, context);
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
        const parsed: any = JSON.parse(jsonText);

        // New intent-based validation (backward-compatible):
        // - If validator returns `intent`, treat module_generate as valid request
        // - Otherwise, fall back to legacy `is_odoo_request` boolean
        const intent = typeof parsed?.intent === 'string' ? String(parsed.intent).toLowerCase() : undefined;
        if (intent) {
            validationData.is_odoo_request = intent === 'module_generate';
            validationData.reason = typeof parsed?.reason === 'string' && parsed.reason.trim()
                ? String(parsed.reason)
                : (validationData.is_odoo_request
                    ? 'Intent classified as module generation'
                    : `Intent classified as '${intent}', not a module generation request`);
        } else {
            // Legacy structure support
            validationData = parsed;
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

        // Determine validation result (legacy fallback path)
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

    // OPTIMIZATION: Step 2 - Check for cached specifications first
    let specifications = getCachedSpec(moduleName, resolvedVersion, userPrompt);
    if (!specifications) {
        const specsPrompt = { contents: prompts.createDetailedSpecsPrompt(userPrompt, resolvedVersion, validationData) };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        specifications = await generateContent(specsPrompt, context);
        setCachedSpec(moduleName, resolvedVersion, userPrompt, specifications as string);
    } else {
        console.log('Using cached specifications (from previous generation)');
    }

    if (!specifications) {
        throw new Error('Failed to obtain module specifications from AI provider.');
    }

    console.log('Specifications generated:', specifications.substring(0, 100));
    progressCb?.({ type: 'specs.ready', payload: { preview: specifications.substring(0, 600) } });

    let tasks = '';
    let menuStructure = '';
    const allFiles: Record<string, string> = {};
    let updatedTasks = '';
    let fileCount = 0;
    
    const makeSlimBatchPrompt = (entries: Array<{ path: string; taskLine: string }>) => {
        const specsSource = ctx.artifacts?.specs || specifications;
        const tasksSource = ctx.artifacts?.tasks || tasks;
        const menuSource = ctx.artifacts?.menu || menuStructure;

        const specsBrief = summarize(specsSource, 1200);
        const tasksBrief = summarize(tasksSource, 1200);
        const menuBrief = summarize(menuSource, 800);
        const list = entries.map(entry => `- ${entry.path}\n  From task: ${entry.taskLine}`).join('\n');
        const odooVersionLabel = ctx.project?.odooVersion || resolvedVersion || version || 'latest';

        return {
            contents: `You are generating files for Odoo ${odooVersionLabel} module: ${moduleName}.
Return a JSON object mapping each file path to full raw file content. No fences, no explanations.

Specs (summary):
${specsBrief}

Tasks (summary):
${tasksBrief}

Menu (summary):
${menuBrief}

Files:
${list}`,
            config: { responseMimeType: 'application/json' }
        };
    };

    const parseBatchResult = (raw: unknown, expectedPath: string): string => {
        try {
            const rawText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
            const jsonText = extractJsonFromText(rawText);
            if (!jsonText) {
                return rawText;
            }
            const parsed = JSON.parse(jsonText) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object') {
                if (Object.prototype.hasOwnProperty.call(parsed, expectedPath)) {
                    const value = parsed[expectedPath];
                    if (typeof value === 'string') {
                        return value;
                    }
                }
                const firstValue = Object.values(parsed)[0];
                if (typeof firstValue === 'string') {
                    return firstValue;
                }
            }
            return rawText;
        } catch (error) {
            console.warn('parseBatchResult: Failed to parse JSON response, returning raw text.', error);
            return typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
        }
    };

    const runValidationAndAutoFix = async (path: string, content: string): Promise<string> => {
        let validationError: string | null = null;
        if (path.endsWith('.py')) {
            validationError = validatePython(content);
        } else if (path.endsWith('.xml')) {
            validationError = validateXML(content);
        }

        if (!validationError) {
            return content;
        }

        console.warn(`Validation detected issue in ${path}: ${validationError}`);
        const extension = path.split('.').pop() || 'file';
        const odooVersionLabel = ctx.project?.odooVersion || resolvedVersion || version || 'latest';
        const fixPrompt = {
            contents: `Fix the following ${extension} file for Odoo ${odooVersionLabel}.
Error: ${validationError}
Content:
${content}
Return only corrected content.`,
        };

        try {
            const fixed = await generateContent(fixPrompt, context);
            const cleaned = cleanFileContent(fixed) || content;

            if (path.endsWith('.py')) {
                validationError = validatePython(cleaned);
            } else if (path.endsWith('.xml')) {
                validationError = validateXML(cleaned);
            } else {
                validationError = null;
            }

            if (validationError) {
                console.warn(`Auto-fix attempt for ${path} still failing: ${validationError}`);
                return cleaned;
            }

            return cleaned;
        } catch (error) {
            console.error(`Auto-fix failed for ${path}:`, error);
            return content;
        }
    };

    // OPTIMIZATION: Initialize generation context and stats
    ctx.project = {
        ...ctx.project,
        odooVersion: resolvedVersion || ctx.project?.odooVersion,
    };
    ctx.artifacts.specs = specifications;

    const sessCtx = getSessionContext(context);
    // Initialize generation statistics
    sessCtx.generationStats = {
        filesGenerated: 0,
        filesFailed: 0,
        filesRetried: 0,
        startTime: Date.now()
    };

    const targetFiles = options?.targetFiles && options.targetFiles.length ? options.targetFiles : null;
    if (targetFiles) {
        console.log(`Targeted generation mode: ${targetFiles.length} file(s)`);

        // Process targeted files one at a time (sequentially)
        for (const filePath of targetFiles) {
            if (cancelRequested?.()) { throw new Error('Cancelled'); }
            
            console.log(`Generating targeted file: ${filePath}`);
            try {
                const batchPrompt = makeSlimBatchPrompt([{ path: filePath, taskLine: `Generate ${filePath}` }]);
                const rawBatch = await generateContent(batchPrompt, context);
                const fileContent = parseBatchResult(rawBatch, filePath);
                const cleanContent = cleanFileContent(fileContent);
                if (cleanContent) {
                    const validatedContent = await runValidationAndAutoFix(filePath, cleanContent);
                    allFiles[filePath] = validatedContent;
                    ctx.generated[filePath] = validatedContent;
                    fileCount++;
                    sessCtx.generationStats!.filesGenerated++;
                } else {
                    sessCtx.generationStats!.filesRetried++;
                }
            } catch (fileError) {
                console.error(`Targeted file generation failed for ${filePath}:`, fileError);
                sessCtx.generationStats!.filesFailed++;
            }
        }
        
        // Update stats for targeted generation
        sessCtx.generationStats!.filesGenerated = fileCount;
    } else {
        // OPTIMIZATION: Step 3 - Generate tasks first (needed for menu)
        const tasksPrompt = { contents: prompts.createStrictTasksPrompt(specifications, resolvedVersion, moduleName) };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        tasks = await generateContent(tasksPrompt, context);
        ctx.artifacts.tasks = tasks;
        
        // Step 4: Generate menu structure (after tasks are ready)
        const menuPrompt = { contents: prompts.createAdvancedMenuPrompt(tasks, specifications, resolvedVersion) };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        menuStructure = await generateContent(menuPrompt, context);
        ctx.artifacts.menu = menuStructure;
        ctx.artifacts.specs = specifications;
        
        // OPTIMIZATION: Generate concise summaries for context reuse (reduces token usage by 80-90%)
        console.log('Generating context summaries for efficient file generation...');
        ctx.artifacts.specsSummary = await generateContextSummary(specifications, 'specs', context);
        ctx.artifacts.tasksSummary = await generateContextSummary(tasks, 'tasks', context);
        ctx.artifacts.menuSummary = await generateContextSummary(menuStructure, 'menu', context);
        
        console.log('Tasks generated:', tasks.substring(0, 100));
        progressCb?.({ type: 'tasks.ready', payload: { preview: tasks.substring(0, 600) } });
        console.log('Menu structure generated:', menuStructure.substring(0, 100));
        progressCb?.({ type: 'menu.ready', payload: { preview: menuStructure.substring(0, 600) } });

        // Step 5: Generate core files individually to avoid JSON parsing issues
        // OPTIMIZATION: Improved file path extraction - prefer paths with slashes and extensions
        const taskLineRegex = /^\s*- \[ \] .*`[^`\n]+`/;
        const taskLines = tasks.split('\n').filter(line => taskLineRegex.test(line));
        updatedTasks = tasks;
        console.log(`Found ${taskLines.length} file generation tasks`);
        try { progressCb?.({ type: 'files.count', payload: { count: taskLines.length } }); } catch {}

        // Use centralized path normalization utility
        const { enforcePathPolicy } = await import('../utils/pathUtils.js');
        
        // Track generated files to prevent duplicates
        const generatedPaths = new Set<string>();
        
        // OPTIMIZATION: Extract file paths intelligently - prefer paths with slashes and extensions
        const extractFilePath = (taskLine: string): string | null => {
            // Find all backticked content
            const allMatches = [...taskLine.matchAll(/`([^`]+)`/g)];
            if (allMatches.length === 0) return null;
            
            // Prefer paths that have:
            // 1. A slash (directory separator)
            // 2. A file extension
            const pathLikeMatches = allMatches.filter(m => {
                const content = m[1];
                return content.includes('/') && /\.(py|xml|csv|js|css|json|yaml|yml)$/i.test(content);
            });
            
            // If we found path-like matches, use the last one (usually the file path)
            if (pathLikeMatches.length > 0) {
                return pathLikeMatches[pathLikeMatches.length - 1][1];
            }
            
            // Fallback: use the last backticked content
            return allMatches[allMatches.length - 1][1];
        };

        // Process files one at a time (sequentially)
        const fileTasks: Array<{ path: string; taskLine: string }> = [];
        
        for (const taskLine of taskLines) {
            const rawPath = extractFilePath(taskLine);
            if (!rawPath) continue;
            
            const safePath = enforcePathPolicy(rawPath, moduleName);
            if (!safePath) {
                console.warn(`Skipped invalid or out-of-structure path from task: ${rawPath}`);
                progressCb?.({ type: 'file.skipped', payload: { path: rawPath, reason: 'invalid_path' } });
                continue;
            }
            
            // Skip if already generated (deduplication)
            if (generatedPaths.has(safePath)) {
                console.log(`Skipping duplicate file generation: ${safePath}`);
                progressCb?.({ type: 'file.skipped', payload: { path: safePath, reason: 'duplicate' } });
                continue;
            }
            
            generatedPaths.add(safePath);
            fileTasks.push({ path: safePath, taskLine });
        }
        
        // Process files sequentially (one at a time)
        for (const { path: safePath, taskLine } of fileTasks) {
            if (cancelRequested?.()) { throw new Error('Cancelled'); }
            
            try {
                progressCb?.({ type: 'file.started', payload: { path: safePath } });

                if (cancelRequested?.()) { throw new Error('Cancelled'); }
                const batchPrompt = makeSlimBatchPrompt([{ path: safePath, taskLine }]);
                const rawBatch = await generateContent(batchPrompt, context);
                const fileContent = parseBatchResult(rawBatch, safePath);
                const beforeLen = typeof fileContent === 'string' ? fileContent.length : String(fileContent).length;
                const cleanContent = cleanFileContent(fileContent);
                
                // OPTIMIZATION: Handle empty __init__.py files with fallback (generic, not Odoo-specific)
                if (!cleanContent && safePath.endsWith('__init__.py')) {
                    const pathParts = safePath.split('/');
                    const dirName = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1]?.replace('__init__.py', '') || 'modules';
                    // Generate minimal __init__.py content (generic imports)
                    const fallbackContent = `# -*- coding: utf-8 -*-\nfrom . import ${dirName}\n`;
                    allFiles[safePath] = fallbackContent;
                    ctx.generated[safePath] = fallbackContent;
                    fileCount++;
                    progressCb?.({ type: 'file.ready', payload: { path: safePath, content: fallbackContent } });
                    progressCb?.({ type: 'file.done', payload: { path: safePath, size: fallbackContent.length } });
                    
                    // Mark the generated task as completed locally in the markdown
                    const completedLine = taskLine.replace('- [ ]', '- [x]');
                    updatedTasks = updatedTasks.replace(taskLine, completedLine);
                    continue;
                }
                
                if (cleanContent) {
                    const validatedContent = await runValidationAndAutoFix(safePath, cleanContent);
                    allFiles[safePath] = validatedContent;
                    ctx.generated[safePath] = validatedContent;
                    fileCount++;
                    sessCtx.generationStats!.filesGenerated++;
                    try { progressCb?.({ type: 'file.ready', payload: { path: safePath, content: validatedContent } }); } catch {}
                    try {
                        // OPTIMIZATION: Fix file extension parsing
                        const pathParts = safePath.split('.');
                        const ext = pathParts.length > 1 ? pathParts[pathParts.length - 1].toLowerCase() : 'unknown';
                        const beforeLen = validatedContent.length;
                        progressCb?.({ type: 'file.cleaned', payload: { path: safePath, before: beforeLen, after: validatedContent.length, ext } });
                    } catch {}
                    progressCb?.({ type: 'file.done', payload: { path: safePath, size: validatedContent.length } });
                    
                    // Mark the generated task as completed locally in the markdown
                    const completedLine = taskLine.replace('- [ ]', '- [x]');
                    updatedTasks = updatedTasks.replace(taskLine, completedLine);
                } else {
                    progressCb?.({ type: 'file.empty', payload: { path: safePath } });
                    sessCtx.generationStats!.filesRetried++;
                }
            } catch (fileError) {
                console.error(`File generation failed for ${safePath}:`, fileError);
                progressCb?.({ type: 'file.error', payload: { path: safePath, error: String(fileError) } });
                sessCtx.generationStats!.filesFailed++;
                if (String(fileError || '').includes('Cancelled')) { throw fileError; }
            }
        }
        
        // Note: filesGenerated is tracked incrementally during generation
        // fileCount and filesGenerated should match, but fileCount includes post-processed files
    }

    // REMOVED: Hardcoded Odoo-specific post-processing (models/__init__.py, views/, security/)
    // All file structure should come from tasks/specifications, not hardcoded assumptions

    // REMOVED: Hardcoded essential files (__manifest__.py, __init__.py)
    // All essential files should come from tasks/specifications, not hardcoded assumptions

    // Generic path filtering: only validate basic structure, no hardcoded directory restrictions
    const filteredFiles: Record<string, string> = {};
    for (const [k, v] of Object.entries(allFiles)) {
        try {
            // Ensure path is within project directory
            if (!k.startsWith(`${moduleName}/`)) continue;
            const tail = k.slice(moduleName.length + 1);
            
            // Basic validation: ensure file has valid extension or is in root
            if (tail.split('/').length === 1) {
                // Root level files - allow any file
                filteredFiles[k] = v;
                continue;
            }
            
            // Subdirectory files - ensure they have a valid extension
            const base = tail.split('/').pop() || '';
            if (/\.[A-Za-z0-9]+$/.test(base)) {
                filteredFiles[k] = v;
            }
        } catch { /* drop on error */ }
    }

    const testFiles: Record<string, string> = {}; // Keep empty - tests only created if explicitly requested

    // Combine all files
    const finalFiles = { ...filteredFiles, ...testFiles };
    ctx.generated = { ...ctx.generated, ...finalFiles };
    
    // OPTIMIZATION: Post-processing summary with statistics
    sessCtx.generationStats!.endTime = Date.now();
    const totalDuration = sessCtx.generationStats!.endTime - sessCtx.generationStats!.startTime;
    const durationSeconds = (totalDuration / 1000).toFixed(1);
    const durationMinutes = Math.floor(totalDuration / 60000);
    const durationSecondsRemainder = ((totalDuration % 60000) / 1000).toFixed(1);
    const durationFormatted = durationMinutes > 0 
        ? `${durationMinutes}m ${durationSecondsRemainder}s` 
        : `${durationSeconds}s`;
    
    // Update final file count (includes post-processed files like __init__.py)
    const finalFileCount = Object.keys(finalFiles).length;
    
    // Generate comprehensive summary
    const summaryParts: string[] = [];
    summaryParts.push(`✅ ${finalFileCount} file(s) generated successfully`);
    if (sessCtx.generationStats!.filesRetried > 0) {
        summaryParts.push(`${sessCtx.generationStats!.filesRetried} file(s) retried (empty)`);
    }
    if (sessCtx.generationStats!.filesFailed > 0) {
        summaryParts.push(`${sessCtx.generationStats!.filesFailed} file(s) failed`);
    }
    summaryParts.push(`in ${durationFormatted}`);
    
    const summaryMessage = summaryParts.join('. ');
    console.log(`\n🎉 ${summaryMessage}\n`);
    
    // Send summary via progress callback
    try {
        progressCb?.({ 
            type: 'generation.complete', 
            payload: { 
                summary: summaryMessage,
                sessionId,
                stats: sessCtx.generationStats,
                duration: totalDuration,
                durationFormatted
            } 
        });
    } catch {}

    return {
        files: finalFiles,
        progressInfo: {
            sessionId,
            environment: ctx.project,
            specifications: specifications.substring(0, 150) + '...',
            tasks: updatedTasks.substring(0, 150) + '...',
            menuStructure: menuStructure.substring(0, 150) + '...',
            filesGenerated: Object.keys(finalFiles),
            totalFiles: Object.keys(finalFiles).length,
            fileCount: fileCount,
            testCount: Object.keys(testFiles).length,
            hasTests: Object.keys(testFiles).length > 0,
            generationSuccess: true,
            summary: summaryMessage,
            stats: sessCtx.generationStats,
            duration: totalDuration,
            durationFormatted
        }
    };
}

// Re-export utilities for convenience
export { cleanFileContent } from './contentCleaner.js';
export { extractJsonFromText, repairJsonForValidation } from './jsonRepair.js';

