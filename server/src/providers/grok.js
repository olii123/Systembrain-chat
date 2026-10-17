// Grok provider (xAI). STUB: wired up but not enabled by default.
// Turn on with AI_PROVIDER=grok and XAI_API_KEY=... in the environment.
// Uses fetch + Web streams only, so it runs unchanged in a Cloudflare Worker.
const URL_ = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-4.3';

export function createGrokProvider({ apiKey, model = MODEL } = {}) {
  return {
    name: 'grok',
    async *chat({ client, messages, context = [] }) {
      if (!apiKey) throw new Error('XAI_API_KEY is not set. Grok provider is not enabled.');
      yield { type: 'status', text: 'Thinking...' };
      const res = await fetch(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: systemPrompt(client, context) }, ...messages.slice(-20)] })
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

// Grounded prompt: answer only from the retrieved knowledge base context plus the client config.
export function systemPrompt(c, context = []) {
  const sources = context.map((k, i) => `[${i + 1}] ${k.title || k.url} (${k.url})\n${k.text}`).join('\n\n');
  return [
    `You are the website chat assistant for ${c.brand}.`,
    `Tone: ${c.tone}`,
    'Answer only from the business details and the knowledge base extracts below. Do not use outside knowledge and never guess.',
    `If the answer is not clearly covered, say you are not sure and will check with the team, and suggest calling ${c.phone}. Never invent prices, services, areas or promises.`,
    'Keep answers short. You may mention the page an answer came from.',
    `Business details:\nPhone: ${c.phone}${c.website ? `\nWebsite: ${c.website}` : ''}`,
    `Services and prices:\n${(c.services || []).map(s => `- ${s.name}: ${s.price}`).join('\n') || '- none listed'}`,
    `FAQs:\n${(c.faqs || []).map(f => `- ${f.answer}`).join('\n') || '- none'}`,
    `Knowledge base extracts:\n${sources || '(nothing relevant found for this question)'}`
  ].join('\n\n');
}
