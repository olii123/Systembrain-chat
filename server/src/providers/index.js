import { createMockProvider } from './mock.js';
import { createGrokProvider } from './grok.js';

// env is process.env in Node, or the Worker env bindings in Cloudflare.
export function getProvider(env = {}) {
  const which = (env.AI_PROVIDER || 'mock').toLowerCase();
  if (which === 'grok') return createGrokProvider({ apiKey: env.XAI_API_KEY, model: env.XAI_MODEL });
  return createMockProvider({ delayMs: Number(env.MOCK_DELAY_MS ?? 600) });
}
