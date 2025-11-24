import * as vscode from 'vscode';
import { ChatMessage, ChatSession, getAllSessions, getActiveSession, switchActiveSession, deleteSession } from '../../runtime/sessionManager.js';

export class HistoryController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly postMessage: (type: string, payload?: any) => void,
  ) {}

  public async handleLoadHistory(_message?: any) {
    const sessions: ChatSession[] = await getAllSessions(this.context);
    const active: ChatSession = await getActiveSession(this.context);
    // Map to lightweight payload with a full-session preview string
    const items = sessions.map((s: ChatSession) => {
      const first = s.messages[0];
      const preview = first ? first.content : (s.title || '');
      return {
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        tokensApprox: s.messages.reduce((acc: number, m: ChatMessage) => acc + m.content.length, 0),
        preview,
        isActive: s.id === active.id,
      };
    });
    this.postMessage('historyData', { items });
  }

  public async handleOpenSession(message: any) {
    const id = String(message?.id || '');
    if (!id) return;
    const switched = await switchActiveSession(this.context, id);
    this.postMessage('historyOpened', { sessionId: switched.id });
  }

  public async handleDeleteSession(message: any) {
    const id = String(message?.id || '');
    if (!id) return;
    try {
      await deleteSession(this.context, id);
      this.postMessage('historyDeleted', { id });
      await this.handleLoadHistory();
    } catch (err: any) {
      this.postMessage('historyDeleteFailed', { id, error: String(err?.message || err || 'Unknown error') });
    }
  }
}
