// Grok provider (xAI). STUB: wired up but not enabled by default.
// Turn on with AI_PROVIDER=grok and XAI_API_KEY=... in the environment.
// Uses fetch + Web streams only, so it runs unchanged in a Cloudflare Worker.
const URL_ = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-4.3';

export function createGrokProvider({ apiKey, model = MODEL } = {}) {
  return {
    name: 'grok',
    async *chat({ client, messages }) {
      if (!apiKey) throw new Error('XAI_API_KEY is not set. Grok provider is not enabled.');
      yield { type: 'status', text: 'Thinking...' };
      const res = await fetch(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: systemPrompt(client) }, ...messages.slice(-20)] })
      });
      if (!res.ok || !res.body) throw new Error(`Grok API error ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += value; const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (data === '[DONE]') return;
          try { const d = JSON.parse(data).choices?.[0]?.delta?.content; if (d) yield { type: 'delta', text: d }; } catch {}
        }
      }
      // TODO: let the model request UI actions (lead form, booking form, chips) via tool calls,
      // then yield { type: 'actions', actions: [...] } in the same shape the mock provider uses.
    }
  };
}

export function systemPrompt(c) {
  return [
    `You are the website chat assistant for ${c.brand}.`,
    `Tone: ${c.tone}`,
    `Services and prices:\n${(c.services || []).map(s => `- ${s.name}: ${s.price}`).join('\n')}`,
    `FAQs:\n${(c.faqs || []).map(f => `- ${f.answer}`).join('\n')}`,
    `If you do not know, offer to pass it to the team or suggest calling ${c.phone}. Never invent prices.`
  ].join('\n\n');
}
