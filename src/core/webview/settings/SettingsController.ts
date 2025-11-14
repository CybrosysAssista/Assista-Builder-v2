import * as vscode from 'vscode';

export class SettingsController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly postMessage: (type: string, payload?: any) => void,
  ) { }

  public async handleLoadSettings() {
    const config = vscode.workspace.getConfiguration('assistaX');
    const providers = config.get<any>('providers', {});
    const activeProvider = config.get<string>('activeProvider') || 'google';
    const googleModel = providers?.google?.model || '';
    const openrouterModel = providers?.openrouter?.model || '';

    const hasGoogleKey = !!(await this.context.secrets.get('assistaX.apiKey.google'));
    const hasOpenrouterKey = !!(await this.context.secrets.get('assistaX.apiKey.openrouter'));

    this.postMessage('settingsData', {
      activeProvider,
      googleModel,
      openrouterModel,
      hasGoogleKey,
      hasOpenrouterKey,
    });
  }

  public async handleSaveSettings(message: any) {
    try {
      const activeProvider = typeof message.activeProvider === 'string' ? message.activeProvider : 'google';
      const googleKey = typeof message.googleKey === 'string' ? message.googleKey.trim() : '';
      const openrouterKey = typeof message.openrouterKey === 'string' ? message.openrouterKey.trim() : '';
      const googleModel = typeof message.googleModel === 'string' ? message.googleModel.trim() : '';
      const openrouterModel = typeof message.openrouterModel === 'string' ? message.openrouterModel.trim() : '';

      const config = vscode.workspace.getConfiguration('assistaX');
      const providers = config.get<any>('providers', {});
      const nextProviders: any = { ...providers };

      nextProviders.google = { ...(nextProviders.google || {}) };
      nextProviders.openrouter = { ...(nextProviders.openrouter || {}) };

      if (googleModel) {
        nextProviders.google.model = googleModel;
      }
      if (openrouterModel) {
        nextProviders.openrouter.model = openrouterModel;
      }

      await config.update('providers', nextProviders, vscode.ConfigurationTarget.Global);

      if (activeProvider === 'google' || activeProvider === 'openrouter') {
        await config.update('activeProvider', activeProvider, vscode.ConfigurationTarget.Global);
      }

      if (googleKey) {
        await this.context.secrets.store('assistaX.apiKey.google', googleKey);
      }
      if (openrouterKey) {
        await this.context.secrets.store('assistaX.apiKey.openrouter', openrouterKey);
      }

      const hasGoogleKey = !!(await this.context.secrets.get('assistaX.apiKey.google'));
      const hasOpenrouterKey = !!(await this.context.secrets.get('assistaX.apiKey.openrouter'));

      this.postMessage('settingsSaved', {
        success: true,
        hasGoogleKey,
        hasOpenrouterKey,
      });
    } catch (error: any) {
      this.postMessage('settingsSaved', {
        success: false,
        error: error?.message || String(error) || 'Failed to save settings.',
      });
    }
  }

  public async handleListModels(message: any) {
    try {
      const provider = typeof message.provider === 'string' ? message.provider : '';
      const providedKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';
      const config = vscode.workspace.getConfiguration('assistaX');

      let models: Array<{ id: string; name?: string }> = [];

      if (provider === 'openrouter') {
        const baseUrl = config.get<string>('providers.openrouter.customUrl', 'https://openrouter.ai/api/v1') || 'https://openrouter.ai/api/v1';
        const key = providedKey || (await this.context.secrets.get('assistaX.apiKey.openrouter')) || '';
        if (!key) { throw new Error('OpenRouter API key is required to list models.'); }

        const url = `${baseUrl.replace(/\/$/, '')}/models`;
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json',
        };
        // Optional custom headers same as completions
        const referer = config.get<string>('openrouterHeaders.referer', 'https://assista-x.vscode')!;
        const title = config.get<string>('openrouterHeaders.title', 'Assista X Extension')!;
        headers['HTTP-Referer'] = referer;
        headers['X-Title'] = title;

        const resp = await fetch(url, { method: 'GET', headers });
        if (!resp.ok) {
          const detail = await resp.text().catch(() => '');
          throw new Error(`OpenRouter models error (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ''}`);
        }
        const json: any = await resp.json();
        const items: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
        models = items
          .map((m: any) => ({ id: String(m?.id || m?.name || ''), name: String(m?.name || m?.id || '') }))
          .filter((m) => !!m.id);
      } else if (provider === 'google') {
        // Use Google Generative Language public models endpoint
        const key = providedKey || (await this.context.secrets.get('assistaX.apiKey.google')) || '';
        if (!key) { throw new Error('Gemini API key is required to list models.'); }
        // Fetch all pages
        let nextPageToken: string | undefined;
        const collected: any[] = [];
        do {
          const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
          url.searchParams.set('key', key);
          // Large page size to reduce pagination; API caps internally
          url.searchParams.set('pageSize', '200');
          if (nextPageToken) { url.searchParams.set('pageToken', nextPageToken); }

          const resp = await fetch(url.toString(), { method: 'GET' });
          if (!resp.ok) {
            const detail = await resp.text().catch(() => '');
            throw new Error(`Google models error (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ''}`);
          }
          const json: any = await resp.json();
          if (Array.isArray(json?.models)) { collected.push(...json.models); }
          nextPageToken = typeof json?.nextPageToken === 'string' && json.nextPageToken ? json.nextPageToken : undefined;
        } while (nextPageToken);

        const seen = new Set<string>();
        models = collected
          .map((m: any) => {
            const raw = String(m?.name || ''); // e.g. 'models/gemini-2.5-flash'
            const id = raw.startsWith('models/') ? raw.substring('models/'.length) : raw;
            const name = String(m?.displayName || id);
            return { id, name };
          })
          .filter((m) => !!m.id && !seen.has(m.id) && (seen.add(m.id), true))
          .sort((a, b) => a.id.localeCompare(b.id));
      } else if (provider === 'openai') {
        const key = providedKey || (await this.context.secrets.get('assistaX.apiKey.openai')) || '';
        if (!key) { throw new Error('OpenAI API key is required to list models.'); }
        const resp = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Accept': 'application/json',
          },
        });
        if (!resp.ok) {
          const detail = await resp.text().catch(() => '');
          throw new Error(`OpenAI models error (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ''}`);
        }
        const json: any = await resp.json();
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        const seen = new Set<string>();
        models = items
          .map((m: any) => ({ id: String(m?.id || ''), name: String(m?.id || '') }))
          .filter((m) => !!m.id && !/(embedding|audio|tts|whisper|edits?|fine-tune|moderation)/i.test(m.id))
          .filter((m) => !seen.has(m.id) && (seen.add(m.id), true))
          .sort((a, b) => a.id.localeCompare(b.id));
      } else if (provider === 'anthropic') {
        const key = providedKey || (await this.context.secrets.get('assistaX.apiKey.anthropic')) || '';
        if (!key) { throw new Error('Anthropic API key is required to list models.'); }
        const resp = await fetch('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Accept': 'application/json',
          },
        });
        if (!resp.ok) {
          const detail = await resp.text().catch(() => '');
          throw new Error(`Anthropic models error (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ''}`);
        }
        const json: any = await resp.json();
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        const seen = new Set<string>();
        models = items
          .map((m: any) => ({ id: String(m?.id || ''), name: String(m?.display_name || m?.id || '') }))
          .filter((m) => !!m.id && !seen.has(m.id) && (seen.add(m.id), true))
          .sort((a, b) => a.id.localeCompare(b.id));
      } else if (provider === 'mistral') {
        const key = providedKey || (await this.context.secrets.get('assistaX.apiKey.mistral')) || '';
        if (!key) { throw new Error('Mistral API key is required to list models.'); }
        const resp = await fetch('https://api.mistral.ai/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Accept': 'application/json',
          },
        });
        if (!resp.ok) {
          const detail = await resp.text().catch(() => '');
          throw new Error(`Mistral models error (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ''}`);
        }
        const json: any = await resp.json();
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        const seen = new Set<string>();
        models = items
          .map((m: any) => ({ id: String(m?.id || ''), name: String(m?.name || m?.id || '') }))
          .filter((m) => !!m.id && !seen.has(m.id) && (seen.add(m.id), true))
          .sort((a, b) => a.id.localeCompare(b.id));
      } else {
        throw new Error(`Listing models not implemented for provider: ${provider}`);
      }

      this.postMessage('modelsListed', { provider, models });
    } catch (error: any) {
      this.postMessage('modelsError', { error: error?.message || String(error) || 'Failed to list models.' });
    }
  }
}
