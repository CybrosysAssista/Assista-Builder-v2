/**
 * JSON extraction and repair utilities for AI responses
 */

/**
 * Extract JSON from text, handling markdown wrappers and common AI response formats
 */
export function extractJsonFromText(text: string): string {
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

/**
 * Repair JSON strings for validation responses
 */
export function repairJsonForValidation(jsonStr: string): string {
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

/**
 * Fix common JSON issues (trailing commas, unescaped newlines, etc.)
 */
export function fixCommonJsonIssues(jsonStr: string): string {
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
 * Repair JSON strings for Python string content in JSON responses
 */
export function repairJsonStrings(jsonStr: string): string {
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

