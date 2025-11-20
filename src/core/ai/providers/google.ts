/**
 * Google Gemini provider implementation
 * Based on: https://ai.google.dev/gemini-api/docs/function-calling
 */
import * as vscode from 'vscode';
import { ProviderConfig } from './types.js';
import { TOOL_DECLARATIONS } from '../../tools/registry.js';
import { readFileTool } from '../../tools/readFileTool.js';
import { writeFileTool } from '../../tools/writeFileTool.js';
import { applyPatchTool } from '../../tools/applyPatchTool.js';
import { createFolderTool } from '../../tools/createFolderTool.js';

async function executeTool(name: string, args: any): Promise<any> {
    switch (name) {
        case 'readFileTool':
            if (!args?.path) throw new Error('readFileTool requires path argument');
            return await readFileTool(args.path);
        case 'writeFileTool':
            if (!args?.path || args.content === undefined) throw new Error('writeFileTool requires path and content arguments');
            return await writeFileTool(args.path, args.content);
        case 'applyPatchTool':
            if (!args?.path || !args?.patch) throw new Error('applyPatchTool requires path and patch arguments');
            return await applyPatchTool(args.path, args.patch);
        case 'createFolderTool':
            if (!args?.path) throw new Error('createFolderTool requires path argument');
            return await createFolderTool(args.path);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export async function generateWithGoogle(
    params: any,
    config: ProviderConfig,
    _context: vscode.ExtensionContext
): Promise<string> {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: config.apiKey });

    // Build contents array from messages
    let contents: Array<{ role: string; parts: Array<any> }> = [];

    if (Array.isArray(params?.messages) && params.messages.length) {
        // Convert messages to Gemini format, handling tool messages
        for (const m of params.messages) {
            if (m.role === 'user' || m.role === 'assistant') {
                contents.push({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: String(m.content || '') }]
                });
            } else if (m.role === 'tool' && m.name) {
                // Handle tool responses from previous iterations
                contents.push({
                    role: 'tool',
                    parts: [{
                        functionResponse: {
                            name: m.name,
                            response: typeof m.content === 'string' ? JSON.parse(m.content) : m.content
                        }
                    }]
                });
            }
        }
    } else {
        // Single prompt
        const userContent = typeof params.contents === 'string' 
            ? params.contents 
            : String(params.contents || '');
        contents = [{ role: 'user', parts: [{ text: userContent }] }];
    }

    // Build config with system instruction if provided
    const generateConfig: any = {};
    const systemInstruction = params.config?.systemInstruction;
    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
        generateConfig.systemInstruction = systemInstruction.trim();
    }

    // Add function declarations to config
    const functionDeclarations = await Promise.all(TOOL_DECLARATIONS);
    if (functionDeclarations.length > 0) {
        generateConfig.tools = [{
            functionDeclarations: functionDeclarations
        }];
    }

    let lastError: Error | null = null;
    
    // Loop until we get a final text response (no more function calls)
    while (true) {
        const requestPayload = {
            model: config.model,
            contents,
            ...(Object.keys(generateConfig).length > 0 ? { config: generateConfig } : {})
        };

    console.log('[Assista X] Gemini Request:', requestPayload);

        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                const response = await ai.models.generateContent(requestPayload);
                
                console.log('[Assista X] Gemini Response:',response);

                // Check for function calls
                if (response.functionCalls && response.functionCalls.length > 0) {
                    // Process each function call
                    for (const functionCall of response.functionCalls) {
                        if (!functionCall.name) continue;
                        
                        console.log(`[Assista X] Function to call: ${functionCall.name}`);
                        console.log(`[Assista X] Arguments: ${JSON.stringify(functionCall.args)}`);

                        // Execute the tool
                        const toolResult = await executeTool(functionCall.name, functionCall.args || {});
                        console.log(`[Assista X] Tool returned: ${JSON.stringify(toolResult)}`);

                        // Get function call parts from response for conversation history
                        const candidate = response.candidates?.[0];
                        if (candidate) {
                            const functionCallParts = candidate.content?.parts?.filter((p: any) => p.functionCall) || [];
                            const matchingPart = functionCallParts.find((p: any) => 
                                p.functionCall?.name === functionCall.name
                            ) || functionCallParts[0];

                            if (matchingPart) {
                                // Add model's function call to conversation history
                                contents.push({
                                    role: 'model',
                                    parts: [matchingPart]
                                });
                            }
                        }

                        // Add tool response to conversation history
                        contents.push({
                            role: 'tool',
                            parts: [{
                                functionResponse: {
                                    name: functionCall.name,
                                    response: toolResult
                                }
                            }]
                        });
                    }
                    // Continue loop to send updated contents back
                    break;
                } else {
                    // No function calls → final answer
                    const finalText = response.text || '';
                    console.log('[Assista X] Final output:', finalText);
                    return finalText.trim();
                }
            } catch (error) {
                lastError = error as Error;
                if (attempt < 5) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                } else {
                    throw new Error(`Gemini API failed after 5 attempts: ${lastError?.message}`);
                }
            }
        }
    }
}


