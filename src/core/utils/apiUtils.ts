import * as https from 'https';
import * as http from 'http';

export interface AvailableModel {
    id: string;
    name: string;
    costMultiplier?: number;
}

export interface AvailableModelsResponse {
    models: AvailableModel[];
}

/**
 * Fetches available models from the Assista API
 * @returns Promise resolving to array of available models
 */
export async function fetchAvailableModels(): Promise<AvailableModel[]> {
    console.log('[AssistaCoder] fetchAvailableModels called');
    return new Promise((resolve, reject) => {
        const url = 'https://assista-api.cybrosys.com/api/settings/available-models';
        console.log(`[AssistaCoder] Fetching models from: ${url}`);

        const request = https.get(url, (response) => {
            let data = '';
            console.log(`[AssistaCoder] API status code: ${response.statusCode}`);

            // Handle redirect
            if (response.statusCode === 301 || response.statusCode === 302) {
                if (response.headers.location) {
                    const redirectUrl = response.headers.location;
                    console.log(`[AssistaCoder] Redirecting to: ${redirectUrl}`);
                    const redirectRequest = (redirectUrl.startsWith('https') ? https : http).get(redirectUrl, (redirectResponse) => {
                        let redirectData = '';

                        redirectResponse.on('data', (chunk) => {
                            redirectData += chunk;
                        });

                        redirectResponse.on('end', () => {
                            try {
                                const result = JSON.parse(redirectData);
                                console.log('[AssistaCoder] API raw response (after redirect):', result);
                                if (Array.isArray(result)) {
                                    resolve(result.map(m => ({ id: m, name: m.split('/').pop() || m })));
                                } else if (result && Array.isArray(result.models)) {
                                    resolve(result.models);
                                } else {
                                    resolve([]);
                                }
                            } catch (error) {
                                console.error('[AssistaCoder] Failed to parse API response after redirect:', error);
                                reject(new Error('Failed to parse API response'));
                            }
                        });
                    });

                    redirectRequest.on('error', (error) => {
                        console.error('[AssistaCoder] Redirect request error:', error);
                        reject(error);
                    });

                    return;
                }
            }

            // Check for successful response
            if (response.statusCode !== 200) {
                console.error(`[AssistaCoder] API error status: ${response.statusCode}`);
                reject(new Error(`API returned status code ${response.statusCode}`));
                return;
            }

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log('[AssistaCoder] API raw response:', result);
                    if (Array.isArray(result)) {
                        // Handle array of strings case
                        const models = result.map(modelId => ({
                            id: modelId,
                            name: modelId.split('/').pop() || modelId
                        }));
                        resolve(models);
                    } else if (result && Array.isArray(result.models)) {
                        // Handle structured object case
                        resolve(result.models);
                    } else {
                        console.warn('[AssistaCoder] API returned unexpected format');
                        resolve([]);
                    }
                } catch (error) {
                    console.error('[AssistaCoder] Failed to parse API response:', error);
                    reject(new Error('Failed to parse API response'));
                }
            });
        });

        request.on('error', (error) => {
            console.error('[AssistaCoder] API request error:', error);
            reject(error);
        });

        // Set timeout for the request
        request.setTimeout(10000, () => {
            console.error('[AssistaCoder] API request timeout');
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}
/**
 * Fetches the external OpenRouter API key for a given email
 * @param email User's email
 * @returns Promise resolving to the API key response
 */
export async function fetchExternalKey(email: string): Promise<{ apiKey: string; keyName: string; usageLimit: number; limitReset: string }> {
    console.log(`[AssistaCoder] fetchExternalKey called for: ${email}`);
    return new Promise((resolve, reject) => {
        const url = `https://assista-api.cybrosys.com/api/settings/external/openrouter-key?email=${encodeURIComponent(email)}`;

        const request = https.get(url, (response) => {
            let data = '';

            if (response.statusCode! < 200 || response.statusCode! >= 300) {
                reject(new Error(`API returned status code ${response.statusCode}`));
                return;
            }

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result && result.apiKey) {
                        resolve(result);
                    } else {
                        reject(new Error('Invalid key response'));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse key response'));
                }
            });
        });

        request.on('error', reject);
        request.setTimeout(10000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}
