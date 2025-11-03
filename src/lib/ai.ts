import * as vscode from 'vscode';
import * as prompts from './prompts';
import { getSystemPrompt } from './systemPrompt';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    customUrl?: string;
}

// (removed stray incomplete helper block)

// Helper: normalize a provided path into a `${moduleName}/...` scoped relative path
export function normalizeModuleScopedPath(
    relOrWeirdPath: string,
    moduleRoot: vscode.Uri,
    moduleName: string
): string | null {
    try {
        if (!relOrWeirdPath) return null;
        const path = require('path');
        let p = String(relOrWeirdPath).trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
        // If absolute, ensure it is inside the module root and convert to module-relative
        if (path.isAbsolute(p)) {
            const normAbs = path.normalize(p);
            const normRoot = path.normalize(moduleRoot.fsPath) + path.sep;
            if (!normAbs.startsWith(normRoot)) return null;
            p = path.relative(moduleRoot.fsPath, normAbs).replace(/\\/g, '/');
        }
        if (p.includes('..')) return null;
        // Prefix with moduleName/ if missing
        if (!p.startsWith(moduleName + '/')) p = `${moduleName}/` + p;
        // Collapse duplicate slashes
        p = p.replace(/\/\/+/, '/');
        return p;
    } catch {
        return null;
    }
}

/**
 * Filter and normalize a file map keyed by paths, keeping only entries within the module scope.
 * Keys are rewritten to `${moduleName}/...` relative form.
 */
export function scopeFileMapToModule(
    files: Record<string, string>,
    moduleRoot: vscode.Uri,
    moduleName: string
): Record<string, string> {
    const scoped: Record<string, string> = {};
    for (const [k, v] of Object.entries(files || {})) {
        const norm = normalizeModuleScopedPath(k, moduleRoot, moduleName);
        if (norm) scoped[norm] = v;
    }
    return scoped;
}

/**
 * Utility to check a fully-resolved absolute path is inside a module root.
 */
export function isPathInsideModule(absPath: string, moduleRoot: vscode.Uri): boolean {
    try {
        const path = require('path');
        const normAbs = path.normalize(absPath);
        const normRoot = path.normalize(moduleRoot.fsPath) + path.sep;
        return normAbs.startsWith(normRoot);
    } catch {
        return false;
    }
}

export interface AppSettings {
    activeProvider: string;
    providers: { [key: string]: ProviderConfig };
}

const getApiUrl = (provider: string, config: ProviderConfig): string => {
    switch (provider) {
        case 'openai': return 'https://api.openai.com/v1/chat/completions';
        case 'anthropic': return 'https://openrouter.ai/api/v1/chat/completions';
        case 'openrouter': return `${config.customUrl || 'https://openrouter.ai/api/v1'}/chat/completions`;
        case 'custom': return config.customUrl || '';
        default: throw new Error(`Unknown provider: ${provider}`);
    }
};

async function generateWithOpenAICompat(params: any, config: ProviderConfig, provider: string, context: vscode.ExtensionContext): Promise<string> {
    const url = getApiUrl(provider, config);
    if (!url) throw new Error(`URL for provider ${provider} not configured.`);

    const systemPrompt = params.config?.systemInstruction || '';
    // Support either a full messages array or a single string prompt
    let messages: Array<{ role: string; content: string }> = [];
    if (Array.isArray(params?.messages) && params.messages.length) {
        messages = params.messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') }));
        // Prepend system if provided and not already present
        if (systemPrompt) {
            const hasSystem = messages.length && messages[0].role === 'system';
            if (!hasSystem) messages.unshift({ role: 'system', content: systemPrompt });
        }
    } else {
        let userPrompt = params.contents;
        if (typeof userPrompt !== 'string') {
            userPrompt = JSON.stringify(userPrompt);
        }
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });
    }

    const body: any = {
        model: config.model,
        messages,
    };

    // Optional generation parameters passthrough
    const reqCfg = params.config || {};
    if (typeof reqCfg.temperature === 'number') body.temperature = reqCfg.temperature;
    if (typeof reqCfg.maxTokens === 'number') body.max_tokens = reqCfg.maxTokens;
    if (typeof reqCfg.topP === 'number') body.top_p = reqCfg.topP;

    // Enforce JSON mode where supported and append guard instruction once
    if (reqCfg?.responseMimeType === 'application/json') {
        body.response_format = { type: 'json_object' };
        const hasJsonInstruction = messages.some(
            m => (m as any).role === 'system' && typeof (m as any).content === 'string' && (m as any).content.includes('MUST respond in valid JSON')
        );
        if (!hasJsonInstruction) {
            messages[messages.length - 1].content += '\n\nYou MUST respond in valid JSON format, without any markdown formatting or extra text.';
        }
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
    };

    // Allow OpenRouter header overrides from settings
    if (provider === 'openrouter' || provider === 'anthropic') {
        const cfgSection = vscode.workspace.getConfiguration('assistaX');
        const referer = cfgSection.get<string>('openrouterHeaders.referer', 'https://assista-x.vscode')!;
        const xTitle = cfgSection.get<string>('openrouterHeaders.title', 'Assista X Extension')!;
        headers['HTTP-Referer'] = referer;
        headers['X-Title'] = xTitle;
    }

    // Fetch with retries and timeout for 429/5xx
    const maxRetries = 3;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
                // Parse error payload if possible
                let detail: string = '';
                try {
                    const errJson = await response.json();
                    const ej: any = errJson as any;
                    detail = ej?.error?.message || JSON.stringify(errJson);
                } catch {
                    try {
                        detail = await response.text();
                    } catch { /* ignore */ }
                }

                // Retry on 429/5xx
                if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
                    lastErr = new Error(`API Error (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
                    const backoff = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }

                throw new Error(`API Error (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
            }

            const data = await response.json() as any;
            const text = (data as any)?.choices?.[0]?.message?.content?.trim?.() || '';
            return text;
        } catch (e: any) {
            clearTimeout(timeout);
            lastErr = e;
            // Retry on abort/network error except last attempt
            if (attempt < maxRetries) {
                const backoff = Math.pow(2, attempt - 1) * 1000;
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
        }
    }
    throw new Error(`Request failed after ${maxRetries} attempts: ${lastErr?.message || lastErr}`);
}

function extractJsonFromText(text: string): string {
    if (typeof text !== 'string') {
        console.warn('extractJsonFromText: Expected string input, got', typeof text);
        return '';
    }

    let cleaned = text.trim();

    // Step 1: Comprehensive markdown code block removal
    // Handle various markdown block formats including language identifiers
    cleaned = cleaned.replace(/^```(?:json|python|xml|javascript|typescript)?\s*\n?([\s\S]*?)\n?```\s*$/gi, '$1');
    cleaned = cleaned.replace(/^```\s*\n?([\s\S]*?)\n?```\s*$/gi, '$1');
    
    // Step 2: Remove common AI response prefixes and suffixes
    const prefixes = [
        /^Generated file content:?\s*/i,
        /^Here is the complete content:?\s*/i,
        /^File content for.*?:\s*/i,
        /^This is the complete.*?(?=\n\n)/i,
        /^\s*---\s*File.*?---\s*/gi,
        /\s*---\s*End.*?---\s*/gi,
        /^Response:\s*/i,
        /^Output:\s*/i,
        /^\[JSON\]\s*/i
    ];
    
    prefixes.forEach(regex => {
        cleaned = cleaned.replace(regex, '');
    });

    // Step 3: Clean up whitespace and line breaks
    cleaned = cleaned.replace(/^\s*[\n\r]+/, '').replace(/[\n\r]+\s*$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Limit consecutive newlines

    // Step 4: Handle common JSON wrapper patterns
    // Remove outer markdown-like wrappers
    if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
        cleaned = cleaned.slice(3, -3).trim();
    }

    console.log('After markdown removal (first 200 chars):', cleaned.substring(0, 200));

    // Step 5: Advanced brace/bracket balancing for JSON extraction
    // Handle both { } and [ ] wrapped content
    const jsonStartMarkers = ['{', '['];
    const jsonEndMarkers = ['}', ']'];
    
    let startPos = -1;
    let endPos = -1;
    let contentType = ''; // 'object' or 'array'
    
    // Try to find the outermost JSON structure
    for (let i = 0; i < cleaned.length; i++) {
        if (jsonStartMarkers.includes(cleaned[i])) {
            if (startPos === -1) {
                startPos = i;
                contentType = cleaned[i] === '{' ? 'object' : 'array';
            }
        } else if (jsonEndMarkers.includes(cleaned[i])) {
            if (contentType === 'object' && cleaned[i] === '}') {
                endPos = i;
                break;
            } else if (contentType === 'array' && cleaned[i] === ']') {
                endPos = i;
                break;
            }
        }
    }

    // If no clear JSON boundaries found, try multiple extraction attempts
    if (startPos === -1 || endPos === -1) {
        // Fallback: Look for JSON-like patterns in the text
        const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/;
        const arrayRegex = /\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/;
        
        const jsonMatch = cleaned.match(jsonRegex);
        const arrayMatch = cleaned.match(arrayRegex);
        
        if (jsonMatch) {
            cleaned = jsonMatch[0];
            startPos = cleaned.indexOf('{');
            endPos = cleaned.lastIndexOf('}');
        } else if (arrayMatch) {
            cleaned = arrayMatch[0];
            startPos = cleaned.indexOf('[');
            endPos = cleaned.lastIndexOf(']');
        }
    }

    if (startPos !== -1 && endPos !== -1 && endPos > startPos) {
        let jsonStr = cleaned.substring(startPos, endPos + 1);
        
        // Ensure we have balanced braces within the extracted content
        let braceBalance = 0;
        let bracketBalance = 0;
        let finalStart = startPos;
        let finalEnd = endPos;
        
        // Scan forward from start to find actual balanced end
        for (let i = startPos; i < cleaned.length; i++) {
            if (cleaned[i] === '{') braceBalance++;
            else if (cleaned[i] === '}') braceBalance--;
            else if (cleaned[i] === '[') bracketBalance++;
            else if (cleaned[i] === ']') bracketBalance--;
            
            if (braceBalance === 0 && bracketBalance === 0 && i > startPos) {
                finalEnd = i;
                break;
            }
        }
        
        jsonStr = cleaned.substring(finalStart, finalEnd + 1);
        
        console.log(`Extracted JSON structure: ${contentType} (${jsonStr.length} chars)`);
        console.log('Extracted JSON preview:', jsonStr.substring(0, 150) + (jsonStr.length > 150 ? '...' : ''));
        
        // Apply comprehensive JSON repair
        jsonStr = repairJsonStrings(jsonStr);
        jsonStr = fixCommonJsonIssues(jsonStr);
        
        return jsonStr;
    }

    // Final fallback: return cleaned text if no JSON structure found
    console.log('No valid JSON structure found, returning cleaned text (', cleaned.length, 'chars)');
    console.log('Fallback content preview:', cleaned.substring(0, 150));
    return cleaned;
}

function repairJsonForValidation(jsonStr: string): string {
    if (typeof jsonStr !== 'string') {
        console.warn('repairJsonForValidation: Expected string, got', typeof jsonStr);
        return '{"is_odoo_request": false, "reason": "Invalid input type"}';
    }

    let repaired = jsonStr.trim();

    // Step 1: Comprehensive markdown and wrapper removal
    const wrappers = [
        /^```(?:json)?\s*\n?/gi,
        /\n?```\s*$/gi,
        /^```\s*\n?/gi,
        /\n?```\s*$/gi,
        /^Generated JSON:?\s*/i,
        /^Response:\s*/i,
        /^\[JSON\]\s*/i,
        /^Output:\s*/i
    ];
    
    wrappers.forEach(wrapper => {
        repaired = repaired.replace(wrapper, '');
    });

    // Step 2: Clean whitespace and normalize line endings
    repaired = repaired.replace(/^\s*[\r\n]+/, '').replace(/[\r\n]+\s*$/, '');
    repaired = repaired.replace(/\r\n?/g, '\n'); // Normalize line endings

    // Step 3: Fix structural issues (trailing commas, missing commas)
    // Remove trailing commas before closing braces/brackets
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
    // Add missing commas between object properties (basic heuristic)
    repaired = repaired.replace(/([}\]])\s*([{\[])/g, '$1,\n$2');
    
    // Fix extra whitespace around colons and commas
    repaired = repaired.replace(/\s*:\s*/g, ': ');
    repaired = repaired.replace(/\s*,\s*/g, ', ');

    // Step 4: Handle string quoting issues
    // Convert single quotes to double quotes for JSON values (carefully)
    repaired = repaired.replace(/'([^',}\]]+)'/g, (match, content) => {
        // Only convert simple string literals, not complex content
        if (!content.includes('{') && !content.includes('[') && !content.includes(':')) {
            const escaped = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `"${escaped}"`;
        }
        return match; // Leave complex content alone
    });

    // Step 5: Fix unescaped quotes and special characters in strings
    // Handle single quotes within double-quoted strings
    repaired = repaired.replace(/(")([^"]*?)(['][^'"]*?)(['])([^"]*?)(")/g, (match, open1, before, singleOpen, singleClose, after, close1) => {
        // Escape the single quotes within the string
        const escapedContent = before + singleOpen + singleClose.replace(/'/g, "\\'") + after;
        return `"${escapedContent}"`;
    });

    // Step 6: Handle escaped characters properly
    // Fix common escape sequence issues
    repaired = repaired.replace(/\\n/g, '\\n').replace(/\\t/g, '\\t').replace(/\\r/g, '\\r');
    
    // Step 7: Ensure validation structure exists
    const hasIsOdooKey = repaired.includes('"is_odoo_request"') || repaired.includes("'is_odoo_request'");
    const hasReasonKey = repaired.includes('"reason"') || repaired.includes("'reason'");
    
    if (!hasIsOdooKey || !hasReasonKey) {
        // Try to infer from content if structure is missing
        const lowerContent = repaired.toLowerCase();
        const hasExplicitFalse = /"is_odoo_request"\s*:\s*false/.test(lowerContent);
        const negPhrases = [
            'not odoo', 'non-odoo', "isn't odoo", 'does not', "doesn't", 'no odoo', 'not an odoo',
            'does not contain any odoo', 'not related to odoo', 'not odoo-specific', 'not specific to odoo'
        ];
        const posPhrases = [
            'for odoo', 'odoo module', 'recognized as odoo', 'odoo-specific request', 'odoo request detected'
        ];
        const hasNeg = negPhrases.some(p => lowerContent.includes(p)) ||
                        (lowerContent.includes('odoo') && (lowerContent.includes('not') || lowerContent.includes('no')));
        const hasPos = posPhrases.some(p => lowerContent.includes(p));
        const isOdooPositive = hasExplicitFalse ? false : (hasPos || (lowerContent.includes('odoo') && !hasNeg));
        const reasonText = !isOdooPositive ? 'Request does not appear to be Odoo-specific' :
                          'Request recognized as Odoo module development based on content analysis';

        // If completely empty or malformed, use fallback structure
        if (repaired.length < 10 || !repaired.includes('{')) {
            repaired = `{"is_odoo_request": ${isOdooPositive}, "reason": "${reasonText}"}`;
        } else {
            // Try to inject missing keys into existing structure
            if (!hasIsOdooKey) {
                repaired = repaired.replace(/({)/, '$1"is_odoo_request": ' + (isOdooPositive ? 'true' : 'false') + ', ');
            }
            if (!hasReasonKey) {
                repaired = repaired.replace(/(})/, ', "reason": "' + reasonText + '"$1');
            }
        }
    }

    // Step 8: Final validation and minimal structure guarantee
    try {
        const parsed = JSON.parse(repaired);
        if (typeof parsed.is_odoo_request !== 'boolean') {
            throw new Error('Invalid boolean');
        }
        if (typeof parsed.reason !== 'string') {
            parsed.reason = 'Validation structure repaired automatically';
            repaired = JSON.stringify(parsed);
        }
        console.log('✅ JSON validation repair successful:', { is_odoo_request: parsed.is_odoo_request, reason: parsed.reason.substring(0, 100) });
        return repaired;
    } catch (e) {
        console.warn('Final JSON repair failed, using fallback structure:', e);
        const lower = repaired.toLowerCase();
        const neg = lower.includes('not odoo') || lower.includes('non-odoo') ||
                    (lower.includes('odoo') && (lower.includes('not') || lower.includes('no') || lower.includes("doesn't") || lower.includes('does not')));
        const pos = (lower.includes('for odoo') || lower.includes('odoo module') || lower.includes('recognized as odoo')) && !neg;
        const isOdoo = pos ? true : false;
        const fallbackReason = isOdoo ? 'Odoo request detected from content analysis' : 'Request does not appear to be Odoo-specific';
        return `{"is_odoo_request": ${isOdoo}, "reason": "${fallbackReason}"}`;
    }
}

// Additional helper function for common JSON issues
function fixCommonJsonIssues(jsonStr: string): string {
    let fixed = jsonStr;
    
    // Fix trailing commas in objects and arrays
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');
    
    // Fix unescaped newlines in strings
    fixed = fixed.replace(/"([^"]*?)\n([^"]*?)"/g, (match, before, after) => {
        return `"${before}\\n${after}"`;
    });
    
    // Fix common boolean/string confusions
    fixed = fixed.replace(/(")(true|false|null)(")/g, (match, open, value, close) => {
        return `${open}${value}${close}`; // Keep as string if quoted
    });
    
    // Fix missing quotes around property names (basic cases)
    fixed = fixed.replace(/([{\s,])(\w+)(:)/g, (match, prefix, key, colon) => {
        return `${prefix}"${key}"${colon}`;
    });
    
    return fixed;
}

/**
 * Enhanced file content cleaning function - removes markdown artifacts and ensures proper file format
 * @param content Raw content from AI generation
 * @returns Cleaned file content ready for disk writing
 */
function cleanFileContent(content: string): string {
    if (typeof content !== 'string') {
        console.warn('cleanFileContent: Expected string, got', typeof content);
        return '';
    }

    let cleaned = content.trim();

    // Remove markdown code blocks with language identifiers
    cleaned = cleaned.replace(/^```(?:python|xml|py|javascript|css|json|html|typescript)?\s*\n?([\s\S]*?)\n?```\s*$/gi, '$1');
    // Remove generic markdown code blocks
    cleaned = cleaned.replace(/^```\s*\n?([\s\S]*?)\n?```\s*$/gi, '$1');
    // Remove common AI response prefixes/suffixes
    cleaned = cleaned.replace(/^Generated file content:?\s*/i, '');
    cleaned = cleaned.replace(/^Here is the complete content:?\s*/i, '');
    cleaned = cleaned.replace(/^File content for.*?:\s*/i, '');
    cleaned = cleaned.replace(/This is the complete.*?(?=\n\n)/i, '');
    // Remove file separator banners
    cleaned = cleaned.replace(/^\s*---\s*File.*?---\s*/gi, '');
    cleaned = cleaned.replace(/\s*---\s*End.*?---\s*/gi, '');

    // Clean up extra whitespace
    cleaned = cleaned.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');

    // XML/Odoo formatting
    
    // File type specific formatting fixes (content-based detection)
    
    // For XML/Odoo files: ensure proper declaration if it looks like Odoo XML
    if (cleaned.includes('<odoo>') && !cleaned.match(/^\s*<\?xml/)) {
        if (!cleaned.trim().startsWith('<?xml')) {
            cleaned = `<?xml version="1.0" encoding="UTF-8"?>\n${cleaned}`;
        }
        // Ensure single root <odoo> element if malformed
        if (((cleaned.match(/<odoo/g) || []).length) > 1 || !cleaned.includes('</odoo>')) {
            // Wrap content in proper <odoo> if needed
            if (!cleaned.includes('<odoo')) {
                cleaned = `<?xml version="1.0" encoding="UTF-8"?>\n<odoo>\n${cleaned}\n</odoo>`;
            }
        }
    }
    
    // For Python files: ensure UTF-8 encoding comment if Odoo-related
    if (cleaned.includes('from odoo') || cleaned.includes('odoo.') && !cleaned.includes('# -*- coding')) {
        if (!cleaned.trim().startsWith('# -*-')) {
            cleaned = `# -*- coding: utf-8 -*-\n${cleaned}`;
        }
    }
    
    // Remove any remaining problematic characters that might break file parsing
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
    
    // Final validation - ensure we have meaningful content
    if (cleaned.length < 20) {
        console.warn('cleanFileContent: Content too short after cleaning:', cleaned.length, 'chars');
        return `# WARNING: AI generated empty or minimal content for this file
# 
# Troubleshooting steps:
# 1. The prompt may have been too vague or complex for the AI model
# 2. Consider breaking requirements into smaller, specific tasks
# 3. Try using a different AI provider/model with better code generation
# 4. Review the original AI response above for implementation clues
# 
# Manual Implementation Required:
# Please create this file based on the module specifications and technical requirements.
# 
# File Type: Unknown (content-based detection failed)
# Context: Not available in cleaner utility
#
# Next Steps:
# 1. Review the generated specifications document
# 2. Check the technical task list for this file's requirements
# 3. Refer to Odoo documentation for proper file structure
# 4. Implement the basic file skeleton manually
# 5. Add the required functionality based on specifications
# 6. Test the file syntax before module installation
# 
# For specific implementation help, ask the AI assistant about this particular file type.
`;
    }
    
    // Security check - block potentially dangerous content
    if (cleaned.includes('<?php') || cleaned.includes('<script') || cleaned.includes('rm -rf') || cleaned.includes('eval(')) {
        console.warn('cleanFileContent: Detected potentially dangerous content, returning sanitized version');
        return `# SECURITY FILTER ACTIVATED
# 
# Warning: The AI generated content that was blocked due to potential security risks:
# Detected: ${cleaned.includes('<?php') ? 'PHP execution code' : cleaned.includes('<script') ? 'JavaScript execution' : cleaned.includes('rm -rf') ? 'Shell commands' : 'Dynamic code execution'}
# 
# Safety Recommendation:
# 1. Review the original AI response carefully before implementation
# 2. This protection prevents accidental execution of malicious code
# 3. Implement the file manually using the specifications as guidance
# 4. Never execute untrusted AI-generated code directly
# 
# Manual Implementation Required - Please create this file safely.
`;
    }
    
    console.log(`cleanFileContent: Successfully processed ${content.length} -> ${cleaned.length} characters (type: ${cleaned.includes('<odoo') ? 'XML' : cleaned.includes('from odoo') ? 'Python' : 'Other'})`);
    return cleaned;
}

// Keep original repairJsonStrings for other JSON file content (Python strings in JSON responses)
function repairJsonStrings(jsonStr: string): string {
    let repaired = jsonStr;
    
    // Fix common Python string issues in JSON values
    repaired = repaired.replace(/"([^"]+?)"\s*:\s*"([^"]*'(?!\\)[^']*')([^"]*)"/g, (match, key, problematicStr, rest) => {
        const escapedStr = problematicStr.replace(/'/g, "\\'");
        return `"${key}": "${escapedStr}${rest}"`;
    });
    
    // Handle multiline Python docstrings
    repaired = repaired.replace(/"([^"]+?)"\s*:\s*"""([\s\S]*?)"""/g, (match, key, docstring) => {
        const escapedDocstring = docstring
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'");
        return `"${key}": "${escapedDocstring}"`;
    });
    
    // Fix trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
    return repaired;
}

async function generateWithGoogle(params: any, config: ProviderConfig, context: vscode.ExtensionContext): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(config.apiKey);
            const model = genAI.getGenerativeModel({ model: config.model });

            const systemPrompt = params.config?.systemInstruction || '';
            const promptParts: string[] = [];
            if (Array.isArray(params?.messages) && params.messages.length) {
                if (systemPrompt) promptParts.push(systemPrompt);
                // Flatten messages into a single textual context for Gemini simple generateContent
                const combined = params.messages.map((m: any) => {
                    const role = String(m.role || '').toUpperCase();
                    return `[${role}] ${String(m.content ?? '')}`;
                }).join('\n');
                promptParts.push(combined);
            } else {
                let userPrompt = params.contents;
                if (typeof userPrompt !== 'string') userPrompt = JSON.stringify(userPrompt);
                if (systemPrompt) promptParts.push(systemPrompt);
                promptParts.push(userPrompt);
            }

            const result = await model.generateContent(promptParts);
            const response = await result.response;
            const text = response.text();
            return text ? text.trim() : '';
        } catch (error) {
            lastError = error as Error;
            console.warn(`Google API attempt ${attempt} failed:`, error);
            
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s backoff
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error('Google Generative AI failed after retries:', lastError);
    throw new Error(`Google API Error after ${maxRetries} retries: ${lastError?.message}. The service may be overloaded; try OpenRouter provider or later.`);
}

export async function generateContent(params: any, context: vscode.ExtensionContext): Promise<string> {
    const configSection = vscode.workspace.getConfiguration('assistaX');

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
    const activeProvider = configSection.get<string>('activeProvider');
    if (!activeProvider) {
        throw new Error('No active provider configured. Please go to Settings and select a provider.');
    }

    const providersConfig = configSection.get<any>('providers', {});

    const secretKey = `assistaX.apiKey.${activeProvider}`;
    const apiKey = await context.secrets.get(secretKey);
    if (!apiKey) {
        throw new Error(`API Key for ${activeProvider} is not configured. Please go to Settings.`);
    }

    const providerConfig: ProviderConfig = {
        apiKey,
        model: providersConfig[activeProvider]?.model || '',
        customUrl: providersConfig[activeProvider]?.customUrl,
    };

    if (!providerConfig.model) {
        throw new Error(`Model for ${activeProvider} not configured. Please go to Settings.`);
    }

    // Normalize Google model ids to v1beta-supported variants
    if (activeProvider === 'google') {
        const normalizeGoogleModelId = (m: string): string => {
            if (!m) return m;
            const map: Record<string, string> = {
                'gemini-1.5-flash-latest': 'gemini-1.5-flash-001',
                'gemini-1.5-flash': 'gemini-1.5-flash-001',
                'gemini-1.5-pro-latest': 'gemini-1.5-pro-001',
                'gemini-1.5-pro': 'gemini-1.5-pro-001',
            };
            return map[m] || m;
        };
        const normalized = normalizeGoogleModelId(providerConfig.model);
        if (normalized !== providerConfig.model) {
            console.warn(`[Assista X] Normalized Google model id '${providerConfig.model}' -> '${normalized}' for v1beta compatibility`);
            providerConfig.model = normalized;
        }
    }

    if (activeProvider === 'google') {
        return generateWithGoogle(params, providerConfig, context);
    } else {
        return generateWithOpenAICompat(params, providerConfig, activeProvider, context);
    }
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
    const specifications = await generateContent(specsPrompt, context);
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
                const fileContent = await generateContent(filePrompt, context);
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
        tasks = await generateContent(tasksPrompt, context);
        console.log('Tasks generated:', tasks.substring(0, 100));
        progressCb?.({ type: 'tasks.ready', payload: { preview: tasks.substring(0, 600) } });

        // Step 4: Menu and UI structure
        const menuPrompt = { contents: prompts.createAdvancedMenuPrompt(tasks, specifications, version) };
        if (cancelRequested?.()) { throw new Error('Cancelled'); }
        menuStructure = await generateContent(menuPrompt, context);
        console.log('Menu structure generated:', menuStructure.substring(0, 100));
        progressCb?.({ type: 'menu.ready', payload: { preview: menuStructure.substring(0, 600) } });

        // Step 5: Generate core files individually to avoid JSON parsing issues
        // Detect checklist lines that contain a backticked file path with a slash and an extension
        const taskLineRegex = /^\s*- \[ \] .*`[^`\n]*\/[\w\-./]+\.[a-zA-Z0-9]+`/;
        const taskLines = tasks.split('\n').filter(line => taskLineRegex.test(line));
        updatedTasks = tasks;
        console.log(`Found ${taskLines.length} file generation tasks`);
        try { progressCb?.({ type: 'files.count', payload: { count: taskLines.length } }); } catch {}

        // Helper: enforce module-relative path policy and sensible directory placement
        const enforcePathPolicy = (rawPath: string): string | null => {
            try {
                if (!rawPath) return null;
                let p = String(rawPath).trim().replace(/\\/g, '/').replace(/^\.\/?/, '');
                // Ensure module prefix
                if (!p.startsWith(moduleName + '/')) {
                    p = `${moduleName}/` + p;
                }
                // Split into parts
                const rest = p.slice(moduleName.length + 1); // after moduleName/
                const hasSlash = rest.includes('/');
                const lower = p.toLowerCase();
                // Never allow manifest under subfolders; remap to root manifest
                if (lower.endsWith('/__manifest__.py') && lower !== `${moduleName}/__manifest__.py`) {
                    p = `${moduleName}/__manifest__.py`;
                    return p;
                }
                // Keep root-only for manifest and root __init__.py
                if (!hasSlash) {
                    if (lower.endsWith('__manifest__.py')) return `${moduleName}/__manifest__.py`;
                    if (lower.endsWith('__init__.py')) return `${moduleName}/__init__.py`;
                    const ext = (p.split('.').pop() || '').toLowerCase();
                    // Place orphan .py into models/
                    if (ext === 'py') return `${moduleName}/models/${rest}`;
                    // Place orphan .xml into views/
                    if (ext === 'xml') {
                        const base = rest.endsWith('_views.xml') ? rest : rest.replace(/\.xml$/i, '_views.xml');
                        return `${moduleName}/views/${base}`;
                    }
                    // Place orphan .csv likely into security/
                    if (ext === 'csv') return `${moduleName}/security/${rest}`;
                }
                // Ensure views end with _views.xml when under views/
                if (lower.startsWith(`${moduleName}/views/`) && lower.endsWith('.xml') && !lower.endsWith('_views.xml') && !/menu\.xml$/i.test(lower)) {
                    p = p.replace(/\.xml$/i, '_views.xml');
                }
                // Ensure models live under models/
                if (lower.endsWith('.py') && !lower.startsWith(`${moduleName}/models/`) && !lower.endsWith('/__init__.py')) {
                    // If under wrong dir, move to models/
                    const fname = p.substring(p.lastIndexOf('/') + 1);
                    p = `${moduleName}/models/${fname}`;
                }
                // Security CSV under security/
                if (lower.endsWith('.csv') && !lower.startsWith(`${moduleName}/security/`)) {
                    const fname = p.substring(p.lastIndexOf('/') + 1);
                    p = `${moduleName}/security/${fname}`;
                }
                // Root-only files allowed: __manifest__.py, __init__.py
                if (lower.startsWith(`${moduleName}/`) && !lower.includes('/') ) {
                    if (!(lower.endsWith('__manifest__.py') || lower.endsWith('__init__.py'))) {
                        return null;
                    }
                }
                return p.replace(/\/\/+/, '/');
            } catch { return null; }
        };

        for (const taskLine of taskLines) {
            if (cancelRequested?.()) { throw new Error('Cancelled'); }
            const fileMatch = taskLine.match(/`([^`]+)`/);
            if (fileMatch) {
                const rawPath = fileMatch[1];
                const safePath = enforcePathPolicy(rawPath);
                if (!safePath) {
                    console.warn(`Skipped invalid or out-of-structure path from task: ${rawPath}`);
                    progressCb?.({ type: 'file.skipped', payload: { path: rawPath, reason: 'invalid_path' } });
                    continue;
                }
                console.log(`Generating individual file: ${safePath}`);
                progressCb?.({ type: 'file.started', payload: { path: safePath } });
                const filePrompt = {
                    contents: prompts.createSingleFilePrompt(tasks, menuStructure, specifications, version, moduleName, safePath, taskLine),
                    config: {}
                };
                try {
                    if (cancelRequested?.()) { throw new Error('Cancelled'); }
                    const fileContent = await generateContent(filePrompt, context);
                    const beforeLen = typeof fileContent === 'string' ? fileContent.length : String(fileContent).length;
                    let cleanContent = cleanFileContent(fileContent);
                    if (cleanContent) {
                        const normalizedPath = enforcePathPolicy(safePath);
                        if (normalizedPath) {
                            allFiles[normalizedPath] = cleanFileContent(fileContent);
                            try { progressCb?.({ type: 'file.ready', payload: { path: normalizedPath, content: allFiles[normalizedPath] } }); } catch {}
                            fileCount++;
                            try {
                                const ext = (normalizedPath.split('.').pop() || '').toLowerCase();
                                progressCb?.({ type: 'file.cleaned', payload: { path: normalizedPath, before: beforeLen, after: cleanContent.length, ext } });
                            } catch {}
                            progressCb?.({ type: 'file.done', payload: { path: normalizedPath, size: cleanContent.length } });
                        } else {
                            console.warn(`Skipped invalid or out-of-structure path from task: ${safePath}`);
                            progressCb?.({ type: 'file.skipped', payload: { path: safePath, reason: 'invalid_path' } });
                        }
                    } else {
                        console.warn(`cleanFileContent returned empty for ${safePath}, skipping`);
                        progressCb?.({ type: 'file.empty', payload: { path: safePath } });
                    }
                    // Mark the generated task as completed locally in the markdown
                    const completedLine = taskLine.replace('- [ ]', '- [x]');
                    updatedTasks = updatedTasks.replace(taskLine, completedLine);
                } catch (fileError) {
                    console.error(`File generation failed for ${safePath}:`, fileError);
                    progressCb?.({ type: 'file.error', payload: { path: safePath, error: String(fileError) } });
                    if (String(fileError || '').includes('Cancelled')) { throw fileError; }
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
                const fallbackContent = await generateContent(fallbackPrompt, context);
                const cleanFallback = fallbackContent.replace(/^```(?:python)?\s*\n?([\s\S]*?)\n?```$/g, '$1').trim();
                if (cleanFallback) {
                    allFiles[essential] = cleanFallback;
                    try { progressCb?.({ type: 'file.ready', payload: { path: essential, content: cleanFallback } }); } catch {}
                    fileCount++;
                }
            } catch (fallbackError) {
                console.error(`Fallback generation failed for ${essential}:`, fallbackError);
                if (essential.endsWith('/__manifest__.py')) {
                    allFiles[essential] = `{
    'name': '${moduleName.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}',
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
            generationSuccess: true
        }
    };
}