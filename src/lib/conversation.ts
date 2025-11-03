import * as vscode from 'vscode';

export type ApiRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ApiMessage {
  role: ApiRole;
  content: string;
  ts: number;
  isSummary?: boolean;
}

export interface UiMessage {
  ts: number;
  type: 'user' | 'assistant' | 'tool' | 'system';
  text?: string;
  images?: string[];
  metadata?: any;
}

interface PersistedState {
  apiConversationHistory: ApiMessage[];
  uiMessages: UiMessage[];
  lastResponseId?: string;
}

export class ConversationStore {
  private apiConversationHistory: ApiMessage[] = [];
  private uiMessages: UiMessage[] = [];
  private lastResponseId?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storageKey: string,
  ) {}

  public getApiHistory() { return this.apiConversationHistory; }
  public getUiMessages() { return this.uiMessages; }
  public getLastResponseId() { return this.lastResponseId; }
  public setLastResponseId(v?: string) { this.lastResponseId = v; this.save().catch(()=>{}); }

  public async reset() {
    this.apiConversationHistory = [];
    this.uiMessages = [];
    this.lastResponseId = undefined;
    await this.save();
  }

  public async load() {
    try {
      const raw = await this.context.globalState.get<string>(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        this.apiConversationHistory = Array.isArray(parsed.apiConversationHistory) ? parsed.apiConversationHistory : [];
        this.uiMessages = Array.isArray(parsed.uiMessages) ? parsed.uiMessages : [];
        this.lastResponseId = parsed.lastResponseId;
      }
    } catch { /* ignore */ }
  }

  private async save() {
    const data: PersistedState = {
      apiConversationHistory: this.apiConversationHistory,
      uiMessages: this.uiMessages,
      lastResponseId: this.lastResponseId,
    };
    await this.context.globalState.update(this.storageKey, JSON.stringify(data));
  }

  public async addUserMessage(text: string, images?: string[]) {
    const ts = Date.now();
    const api: ApiMessage = { role: 'user', content: text, ts };
    const ui: UiMessage = { ts, type: 'user', text, images };
    this.apiConversationHistory.push(api);
    this.uiMessages.push(ui);
    await this.save();
  }

  public async addAssistantMessage(text: string, metadata?: any) {
    const ts = Date.now();
    const api: ApiMessage = { role: 'assistant', content: text, ts };
    const ui: UiMessage = { ts, type: 'assistant', text, metadata };
    this.apiConversationHistory.push(api);
    this.uiMessages.push(ui);
    // Persist GPT-5 previous_response_id if provided in metadata
    try { const prev = metadata?.gpt5?.previous_response_id as string | undefined; if (prev) this.lastResponseId = prev; } catch {}
    await this.save();
  }

  public async addSystemMessage(text: string) {
    const ts = Date.now();
    const api: ApiMessage = { role: 'system', content: text, ts };
    const ui: UiMessage = { ts, type: 'system', text };
    this.apiConversationHistory.push(api);
    this.uiMessages.push(ui);
    await this.save();
  }
}

let defaultStore: ConversationStore | undefined;
export function getConversationStore(context: vscode.ExtensionContext): ConversationStore {
  if (!defaultStore) {
    defaultStore = new ConversationStore(context, 'assistaX.conversation.default');
    // Fire and forget load
    defaultStore.load().catch(()=>{});
  }
  return defaultStore;
}
