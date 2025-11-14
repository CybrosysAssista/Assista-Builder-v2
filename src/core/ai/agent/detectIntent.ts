import * as vscode from "vscode";
import { runAgent } from "../agent.js";
import type { DetectedIntent } from "./types.js";

const normalize = (t: string) => t.toLowerCase().trim();
const log = (message: string, ...data: unknown[]) =>
  console.info(`[detectIntent] ${message}`, ...data);
const GREETING_PATTERNS: RegExp[] = [
  /^hi+$/i,
  /^he+y+$/i,
  /^hello+$/i,
  /^hy+$/i,
  /^yo+$/i,
  /^hiya$/i,
  /^sup$/i,
  /^howdy$/i,
  /^gm$/i,
  /^gn$/i,
];

function isGreeting(prompt: string): boolean {
  const text = normalize(prompt);

  if (!text) { return false; }
  const cleaned = text
    .replace(/\b(bro|man|dude|dear|friend|buddy)\b/g, "")
    .trim();

  if (!cleaned) { return false; }
  const words = cleaned.split(/\s+/);

  if (words.length === 1) {
    return GREETING_PATTERNS.some((rx) => rx.test(words[0]));
  }

  if (words.length === 2) {
    return /^good (morning|afternoon|evening|night)$/i.test(cleaned);
  }
  return false;
}

const RULES: Array<{ type: DetectedIntent["type"]; patterns: RegExp[] }> = [
  {
    type: "create_module",
    patterns: [
      /(create|generate|build|scaffold|craft|make|setup|init|start).*(module|app|addon)/,
      /(module|addon|app).*create/,
    ],
  },
  {
    type: "create_model",
    patterns: [/(create|add|generate|make).*(model|object)/, /new model/],
  },
  {
    type: "add_field",
    patterns: [/(add|create|generate).*(field|column)/, /new field/],
  },
  {
    type: "generate_view",
    patterns: [
      /(form|tree|list|kanban|calendar|graph).*view/,
      /(view).*(form|tree|list|kanban)/,
    ],
  },
  {
    type: "explain_code",
    patterns: [
      /(explain|describe|what does|how does).*(code|this)/,
      /explain.*odoo/,
    ],
  },
  {
    type: "refactor_code",
    patterns: [/(refactor|clean|improve|optimize).*(code)/, /rewrite/],
  },
];

function ruleBasedIntent(prompt: string): DetectedIntent | null {
  const text = normalize(prompt);
  for (const rule of RULES) {
    if (rule.patterns.every((rx) => rx.test(text))) { return { type: rule.type, raw: prompt }; }
  }
  return null;
}

const sanitize = (raw: string) =>
  raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

function extractJson(text: string): string | null {
  // Remove markdown
  text = text.replace(/```json/gi, "").replace(/```/g, "");

  // Attempt direct parse
  try {
    JSON.parse(text.trim());
    return text.trim();
  } catch { }

  // Balanced object detection
  const match = text.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      JSON.parse(match[0]);
      return match[0];
    } catch { }
  }

  // Line-based key-value detection fallback
  const lines = text.split("\n");
  let obj: Record<string, string> = {};

  for (const line of lines) {
    const kv = line.match(/"?(type|name|entity)"?\s*[:=]\s*"?([^"]+)"?/i);
    if (kv) { obj[kv[1]] = kv[2]; }
  }

  if (Object.keys(obj).length > 0) {
    return JSON.stringify(obj);
  }

  return null;
}

function validate(parsed: any, raw: string): DetectedIntent {
  const allowed = new Set([
    "create_module",
    "create_model",
    "add_field",
    "generate_view",
    "explain_code",
    "refactor_code",
    "unknown",
  ]);

  const type = allowed.has(parsed?.type) ? parsed.type : "unknown";

  return {
    type,
    name: parsed?.name || "",
    entity: parsed?.entity || "",
    raw,
  };
}

async function llmIntentDetection(
  prompt: string,
  context: vscode.ExtensionContext,
): Promise<DetectedIntent> {
  const classifierPrompt = `
You are an Odoo development INTENT classifier.

Return ONLY valid JSON.
NO markdown.
NO backticks.
NO prose.
NO comments.
NO extra fields.

JSON schema:
{
  "type": "create_module | create_model | add_field | generate_view | explain_code | refactor_code | unknown",
  "name": "string | empty",
  "entity": "string | empty"
}

Return ONLY the JSON object.
If unsure, return:
{"type": "unknown", "name": "", "entity": ""}
`;

  const raw = await runAgent(
    {
      messages: [
        { role: "system", content: classifierPrompt },
        { role: "user", content: prompt },
      ],
      config: { useSession: false },
    },
    context,
  );

  const rawText = typeof raw === "string" ? raw : JSON.stringify(raw);
  const cleaned = sanitize(rawText);
  const block = extractJson(cleaned);

  if (!block) { return { type: "unknown", raw: rawText }; }

  // strict parse
  try {
    return validate(JSON.parse(block), rawText);
  } catch { }

  // relaxed fallback
  const relaxed = block
    .replace(/[\u201C\u201D]/g, '"') // smart quotes
    .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":') // single-quoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"'); // single-quoted values

  try {
    return validate(JSON.parse(relaxed), rawText);
  } catch { }

  return { type: "unknown", raw: rawText };
}

export async function detectIntent(
  prompt: string,
  context: vscode.ExtensionContext,
): Promise<DetectedIntent> {
  if (isGreeting(prompt)) {
    const result = { type: "greeting", raw: prompt };
    log("greeting intent detected", result);
    return result;
  }

  const rb = ruleBasedIntent(prompt);
  if (rb) {
    log("rule-based intent detected", rb);
    return rb;
  }

  log("fallback to llm intent detection");
  const llm = await llmIntentDetection(prompt, context);
  log("llm intent detection result", llm);

  return llm;
}
