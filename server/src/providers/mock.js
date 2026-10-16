// Mock AI: keyword replies driven by the client config. No network calls.
// Provider interface: chat({ client, messages }) returns an async iterable of events:
//   { type: 'status', text }   short "working on it" label shown while waiting
//   { type: 'delta', text }    a piece of the reply text
//   { type: 'actions', actions } widget UI to show after the reply (chips, lead form, booking form)
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createMockProvider({ delayMs = 600 } = {}) {
  return {
    name: 'mock',
    async *chat({ client, messages }) {
      const last = [...messages].reverse().find(m => m.role === 'user')?.content || '';
      const r = route(client, last);
      yield { type: 'status', text: r.status };
      await sleep(delayMs);
      for (const word of r.text.match(/\S+\s*/g) || []) { yield { type: 'delta', text: word }; await sleep(15); }
      if (r.actions?.length) yield { type: 'actions', actions: r.actions };
    }
  };
}

function route(client, text) {
  const has = re => re.test(text);
  if (has(/quote|price|cost|how much/i)) {
    const guide = (client.services || []).map(x => `${x.name}: ${x.price}`).join('. ');
    return { status: 'Checking our price list...', text: client.quoteReply || `Here is a rough guide. ${guide}. Pop your details in and we will send a firm quote.`, actions: [{ t: 'lead', kind: 'quote' }] };
  }
  const bookWords = client.bookingKeywords || ['book', 'appointment', 'available'];
  if (bookWords.some(k => text.toLowerCase().includes(k)))
    return { status: 'Checking availability...', text: client.bookingReply || 'We have spots available this week. I just need a few details first.', actions: [{ t: 'lead', kind: 'booking' }] };
  for (const f of client.faqs || []) {
    if (f.keywords.some(k => text.toLowerCase().includes(k.toLowerCase())))
      return { status: f.status || 'Looking that up...', text: f.answer, actions: f.chips ? [{ t: 'chips', x: f.chips }] : [] };
  }
  return { status: 'Thinking...', text: client.fallbackReply || 'Good question. I will pass that to the team, or you can tap Talk to a person below. I can also quote or book right now.', actions: [{ t: 'chips', x: client.chips || [] }] };
}
