/**
 * Content cleaning utilities for AI-generated content
 * Removes markdown artifacts and ensures proper file format
 */

/**
 * Enhanced file content cleaning function - removes markdown artifacts and ensures proper file format
 * @param content Raw content from AI generation
 * @returns Cleaned file content ready for disk writing
 */
export function cleanFileContent(content: string): string {
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
    
    // Enhanced control character removal - comprehensive Unicode cleanup
    // Remove ASCII control characters (C0 controls) except TAB (0x09), LF (0x0A), CR (0x0D)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Remove C1 control characters (U+0080-U+009F) - common in Windows-1252 and other encodings
    cleaned = cleaned.replace(/[\u0080-\u009F]/g, '');
    
    // Remove zero-width and invisible Unicode characters that can cause display issues
    // Zero Width Space (U+200B), Zero Width Non-Joiner (U+200C), Zero Width Joiner (U+200D)
    // Zero Width No-Break Space (U+FEFF), Word Joiner (U+2060), etc.
    cleaned = cleaned.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    
    // Remove directional formatting marks and other invisible formatting characters
    // These can appear as <ctrlXX> in some editors (e.g., <ctrl63>)
    cleaned = cleaned.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
    
    // Remove literal "<ctrl" patterns in case they're being inserted as text by the AI
    cleaned = cleaned.replace(/<ctrl\d+>/gi, '');
    
    // Normalize line endings to LF only (Unix style) - handles CRLF and stray CR
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove trailing whitespace from each line (but preserve indentation)
    cleaned = cleaned.split('\n').map(line => {
        // Preserve leading whitespace (indentation) but remove trailing
        return line.replace(/[ \t]+$/, '');
    }).join('\n');

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
    
    // Log if control characters were detected and removed
    const removedControls = content.length - cleaned.length;
    return cleaned;
}

