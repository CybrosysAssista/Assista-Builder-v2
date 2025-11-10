export interface GenerationArtifacts {
  specs?: string;
  specsSummary?: string;
  tasks?: string;
  tasksSummary?: string;
  menu?: string;
  menuSummary?: string;
  filePlan?: Array<{ path: string; reason?: string }>;
}

export interface ProjectContext {
  odooVersion: string;
  addonsPaths: string[];
  targetAddonsPath: string;
  configPath?: string;
  existingModules: string[];
}

export interface GenerationContext {
  sessionId: string;
  moduleName: string;
  userPrompt: string;
  artifacts: GenerationArtifacts;
  project: ProjectContext;
  generated: Record<string, string>;
}

/**
 * A simple in-memory session store.
 * Later, we can upgrade this to persist in a DB or JSON cache.
 */
const sessions = new Map<string, GenerationContext>();

export function getOrCreateContext(
  sessionId: string,
  init?: Partial<GenerationContext>
): GenerationContext {
  let ctx = sessions.get(sessionId);
  if (!ctx) {
    ctx = {
      sessionId,
      moduleName: '',
      userPrompt: '',
      artifacts: {},
      project: {
        odooVersion: 'unknown',
        addonsPaths: [],
        targetAddonsPath: '',
        existingModules: [],
      },
      generated: {},
      ...init,
    } as GenerationContext;
    sessions.set(sessionId, ctx);
  }
  return ctx;
}

export function updateContext(sessionId: string, updates: Partial<GenerationContext>) {
  const ctx = sessions.get(sessionId);
  if (!ctx) return;
  Object.assign(ctx, updates);
  sessions.set(sessionId, ctx);
}

export function clearContext(sessionId: string) {
  sessions.delete(sessionId);
}
