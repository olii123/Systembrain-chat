// Plain rule-based summary. Later the AI provider can write this instead.
export function buildSummary(client, conv, messages, leads) {
  const users = messages.filter(m => m.role === 'user').map(m => m.content);
  const lines = [`Chat summary for ${client.brand}`, `Session: ${conv.id}`, `Started: ${conv.started_at}`, `Messages: ${messages.length}`];
  if (conv.page_url) lines.push(`Page: ${conv.page_url}`);
  for (const l of leads) {
    lines.push(`${l.kind === 'booking' ? 'Booking' : 'Quote'} lead: ${l.name || 'no name'}, ${l.mobile || 'no mobile'}${l.email ? ', ' + l.email : ''}` +
      (l.booking_day ? `, requested ${l.booking_day} ${l.booking_time || ''}`.trimEnd() : ''));
  }
  if (!leads.length) lines.push('No contact details left.');
  if (users.length) lines.push('Customer asked:', ...users.map(u => `- ${u}`));
  return lines.join('\n');
}
