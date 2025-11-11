/**
 * Handler for plan generation and validation
 */
import * as vscode from 'vscode';
import { sanitizeModuleName } from '../../utils/moduleName.js';
import { MessageHandler } from './contextHandler.js';

export class PlanHandler implements MessageHandler {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly cancelChecker: () => boolean,
        private readonly resetCancel: () => void
    ) {}

    async handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView }): Promise<boolean> {
        // Request plan generation
        if (message.command === 'requestPlan') {
            try {
                this.resetCancel();
                if (this.cancelChecker()) { return true; }
                
                const promptText: string = String(message.prompt || '').trim();
                const inputName: string = String(message.moduleName || '').trim();
                const moduleName: string = sanitizeModuleName(inputName || promptText);
                
                if (!promptText || !moduleName) {
                    provider.sendMessage({ command: 'aiReply', text: 'Missing information to prepare a plan. Please retry.' });
                    return true;
                }
                
                const { generateContent } = await import('../../ai/index.js');
                const planPrompt = [
                    `You are preparing a short build plan for an Odoo module named "${moduleName}". The runtime environment (Odoo version, addons paths) will be auto-detected later in the workflow; avoid asking the user for it. Base the plan on the user's request below.`,
                    `User request: "${promptText}"`,
                    '',
                    'Respond with HTML ONLY (no markdown, no code fences). Use this exact structure and headings:',
                    '<h3>Build Plan</h3>',
                    '<ul>',
                    '<li>1-2 bullet points summarizing what will be built and the approach (concise).</li>',
                    '</ul>',
                    '<h3>Result</h3>',
                    '<ul>',
                    '<li>Short bullets describing the outcome users will see once generated.</li>',
                    '</ul>',
                    '<h3>Files to be created</h3>',
                    '<ul>',
                    `<li><code>${moduleName}/__init__.py</code></li>`,
                    `<li><code>${moduleName}/__manifest__.py</code></li>`,
                    '</ul>',
                    '',
                    'Rules:',
                    '- Keep the plan brief and clean.',
                    '- Use only the HTML structure above with <h3>, <ul>, <li>, and <code> tags.',
                    '- Infer and list the remaining files (models, views, security, data, report, wizards, static) from the user\'s request using realistic, domain-derived filenames (no generic placeholders).',
                    `- EVERY listed path MUST start with "${moduleName}/" and be placed under the correct directory: models/, views/, security/, data/, report/, wizards/, static/.`,
                    '- If any Python model files are listed under models/, ALSO include models/__init__.py (import aggregator).',
                    '- If new models are introduced, include security/ir.model.access.csv and (optionally) security/<module>_security.xml.',
                    `- View files MUST end with _views.xml (e.g., ${moduleName}/views/<entity>_views.xml).`,
                    `- Menu file should be named ${moduleName}/views/${moduleName}_menu.xml when menus are introduced.`,
                    '- Avoid duplicate filenames and avoid root-level files other than __init__.py and __manifest__.py.',
                    '- No preface or extra commentary outside the structure.'
                ].join('\n');
                
                const html = await generateContent({ contents: planPrompt, config: { mode: 'generate' } }, this.context);
                if (this.cancelChecker()) { return true; }
                
                try {
                    provider.sendMessage({ command: 'planReset' });
                    provider.sendMessage({ command: 'planSection', section: 'tasks', markdown: String(html || '') });
                } catch {}
                
                provider.sendMessage({ command: 'aiReplyHtml', html, kind: 'plan' });
                provider.sendMessage({ command: 'confirmApplyPlan', prompt: 'Proceed to generate this module?', moduleName, promptText });
            } catch (e: any) {
                provider.sendMessage({ command: 'aiReply', text: `Failed to prepare plan: ${e?.message || e}` });
            }
            return true;
        }

        // Validate prompt before showing version choices
        if (message.command === 'validatePrompt') {
            try {
                this.resetCancel();
                if (this.cancelChecker()) { return true; }
                
                const promptText: string = String(message.prompt || '').trim();
                if (!promptText) {
                    provider.sendMessage({ command: 'validationResult', ok: false, reason: 'Please describe your module first.' });
                    return true;
                }
                
                const { generateContent } = await import('../../ai/index.js');
                const prompts = await import('../../prompts.js');
                const valReq: any = {
                    contents: prompts.createOdooValidationPrompt(promptText),
                    config: { responseMimeType: 'application/json', mode: 'generate' }
                };
                
                let raw = '';
                try { raw = await generateContent(valReq, this.context); } catch (e) { raw = ''; }
                if (this.cancelChecker()) { return true; }
                
                let parsed: any = undefined;
                try { parsed = JSON.parse(String(raw || '{}')); } catch { parsed = {}; }

                // Support new validator schema with `intent`; fallback to legacy boolean
                const intent: string | undefined = typeof parsed?.intent === 'string' ? String(parsed.intent).toLowerCase() : undefined;
                const isModuleGen = intent ? intent === 'module_generate' : !!(parsed && (parsed.is_odoo_request === true || parsed.is_odoo_request === 'true'));
                const reason = parsed && parsed.reason ? String(parsed.reason) : (isModuleGen ? '' : (intent ? `Intent classified as '${intent}', not a module generation request.` : 'Your request does not appear to be an Odoo module request.'));

                // Send validation outcome to UI (include intent when available)
                provider.sendMessage({ command: 'validationResult', ok: isModuleGen, is_odoo_request: isModuleGen, intent, reason });

                // If not a module generation request, optionally handle chat/Q&A routing here
                if (!isModuleGen && intent) {
                    const { generateContent } = await import('../../ai/index.js');
                    let systemInstruction = '';
                    let preface = '';
                    if (intent === 'smalltalk') {
                        systemInstruction = 'You are a chill, friendly assistant. Keep replies short, warm, and casual. No code blocks unless explicitly asked.';
                    } else if (intent === 'general_question') {
                        systemInstruction = 'You are a helpful general-purpose assistant. Provide clear, concise answers. Use bullet points when helpful.';
                    } else if (intent === 'odoo_question') {
                        preface = "I can't proceed with module generation for this request. Answering as Odoo expert.";
                        systemInstruction = 'You are an expert on Odoo features, versions, and functional flows. Answer precisely and concisely.';
                    } else if (intent === 'odoo_dev_question') {
                        preface = "I can't proceed with module generation for this request. Answering as Odoo developer.";
                        systemInstruction = 'You are an expert Odoo developer. Explain how to implement things in Odoo with short, actionable guidance.';
                    } else {
                        preface = "I can't understand from the module generation side. Forwarding to model response.";
                        systemInstruction = 'You are a concise assistant. If information is insufficient, ask a clarifying question.';
                    }

                    try {
                        // Ask model to reply in Markdown (not HTML) for chat-style intents
                        const mdInstruction = `${systemInstruction}\n\nRespond in concise Markdown. Do not use HTML or code fences unless necessary.`;
                        const reply = await generateContent({ contents: promptText, config: { mode: 'general', systemInstruction: mdInstruction } }, this.context);
                        if (preface) provider.sendMessage({ command: 'aiReplyMarkdown', markdown: `> ${preface}` });
                        provider.sendMessage({ command: 'aiReplyMarkdown', markdown: String(reply || ''), sender: 'model' });
                    } catch (e) {
                        provider.sendMessage({ command: 'aiReply', text: `Failed to get model response: ${String((e as Error)?.message || e)}` });
                    }
                }
            } catch (e: any) {
                provider.sendMessage({ command: 'validationResult', ok: false, reason: `Validation failed: ${e?.message || e}` });
            }
            return true;
        }

        // Request plan resend
        if (message.command === 'requestPlanResend') {
            try {
                let lp = (provider as any)._lastPlan as any;
                if (!lp) {
                    try { lp = this.context.workspaceState.get('assistaX.lastPlan'); } catch {}
                }
                const req = String(lp?.requirements || '');
                const tsk = String(lp?.tasks || '');
                if (!req && !tsk) {
                    provider._view?.webview.postMessage({ command: 'aiReply', text: 'Assista X: Plan not available to resend. Please try again.' });
                    return true;
                }
                
                provider._view?.webview.postMessage({ command: 'planReset', timestamp: Date.now() });
                if (req) provider._view?.webview.postMessage({ command: 'planSection', section: 'requirements', markdown: req, timestamp: Date.now() });
                if (tsk) provider._view?.webview.postMessage({ command: 'planSection', section: 'tasks', markdown: tsk, timestamp: Date.now() });
                try {
                    provider._view?.webview.postMessage({
                        command: 'showPlan',
                        requirements: req,
                        tasks: tsk,
                        existingFiles: lp?.existingInPlan || [],
                        newFiles: lp?.missingInPlan || [],
                        timestamp: Date.now()
                    });
                } catch {}
                provider._view?.webview.postMessage({ command: 'confirmApplyPlan', prompt: lp?.userPrompt || '' });
            } catch (e) {
                provider._view?.webview.postMessage({ command: 'aiReply', text: `Assista X: Failed to resend plan. ${String((e as Error)?.message || e)}` });
            }
            return true;
        }

        return false;
    }
}

