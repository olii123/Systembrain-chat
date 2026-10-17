// Short customer questions often use words the website does not (a site says "$50 off per cleaning",
// a visitor asks "how much"). Adding a few related words to common question types helps the search.
const EXPAND = [
  [/\b(how much|prices?|pricing|cost|costs|charge|rates?|quote|expensive|cheap|fees?|discounts?|deals?|specials?|promo\w*)\b/i, 'prices, cost, $ off, discounts and offers per cleaning'],
  [/\b(contact|phone|call|ring|email|number)\b/i, 'contact details, phone number and email'],
  [/\b(area|areas|suburbs?|where|locations?|service you|come to)\b/i, 'areas served and suburbs covered'],
  [/\b(services?|offer|do you do|what do you)\b/i, 'our services']
];
export const expandQuery = q => { const extra = EXPAND.filter(([re]) => re.test(q)).map(([, w]) => w); return extra.length ? `${q} (${extra.join('; ')})` : q; };
