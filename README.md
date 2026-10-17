# SystemBrain Chat

A chat bubble you can add to any website with one line, plus a small server that answers the chats, saves leads and writes a summary when a chat ends.

Right now it runs on your own computer, with no outside services. The "AI" is a simple built-in responder (the mock) that answers from each client's settings file. Later, the same code moves to Cloudflare and switches to Grok for real AI answers.

## What is in the folder

| Folder | What it is |
| --- | --- |
| `widget/v1/widget.js` | The chat bubble (version 1). Websites load it through `/widget.js`. |
| `server/` | The server that the bubble talks to. |
| `server/clients/` | One settings file per business (client). |
| `server/data/db.json` | Where leads, chats and summaries are saved (created automatically). |
| `server/schema.sql` | The database layout, ready for Cloudflare D1 later. |
| `demo/index.html` | A demo website with the bubble on it. |
| `tests/e2e.mjs` | An automatic test that clicks through the bubble in a browser. |
| `shots/` | Screenshots from the last test run. |

## How to run it

You need Node.js version 20 or newer (download from nodejs.org).

1. Open a terminal in this folder.
2. The first time only, run: `npm install`
3. Start it: `npm start`
4. Open http://localhost:8787/demo/ in your browser and click the round orb in the bottom right.

To stop it, press Ctrl and C in the terminal.

To run the automatic browser test: `npx playwright install chromium` (first time only), then `npm test`.

## Adding the bubble to a website

Paste this one line just before `</body>` on the website, changing the address to wherever your server lives and `demo` to the client's name:

```html
<script src="https://systembrain-chat.systembrain.workers.dev/widget.js" data-client-id="demo" defer></script>
```

That is all. The bubble loads its colours, greeting and buttons from the server, so you never need to edit the website again to change them.

## Adding a new client

1. Go to `server/clients/`.
2. Copy `demo.json` and rename the copy to the new client's short name, for example `bobs-plumbing.json`. Use lowercase letters, numbers and dashes only.
3. Open the new file and change the text. Inside the file, set `"clientId"` to the same short name.
4. Restart the server (Ctrl and C, then `npm start`). For Cloudflare, also import the JSON in `server/src/worker.js` and add it to `clients`, then `npm run deploy`.
5. On the client's website use `data-client-id="bobs-plumbing"`.

### What each setting means

| Setting | What it does |
| --- | --- |
| `brand` | Business name shown at the top of the chat. |
| `colours.accent`, `colours.accentText` | Colour of buttons and the customer's messages, and the text on them. |
| `greeting` | First message when the chat opens. |
| `teaser` | Small bubble above the orb, e.g. "Need a quote? Ask me". Leave empty to hide it. |
| `chips` | Quick-reply buttons under the greeting. |
| `placeholder` | Grey hint text in the message box. |
| `phone`, `sms` | Used for the "Talk to a person" and "Text us instead" links. Replace the placeholder 0400 000 000. |
| `tone` | How the AI should sound (used once Grok is on). |
| `summaryEmail` | Where chat summaries will be emailed (emailing comes later; for now they are saved). |
| `services` | Services and price guides. Used for quote answers. |
| `bookingSlots` | Time options on the booking card. |
| `bookingKeywords` | Words that start a booking, e.g. "book", "visit". |
| `quoteReply`, `bookingReply`, `fallbackReply` | Optional fixed answers for the built-in responder. |
| `faqs` | Common questions. Each has `keywords` (words to listen for), an `answer`, and optional `chips`. |

Owner-only settings (`tone`, `summaryEmail`) are never sent to the website visitor.

## Where leads and chats are saved

Everything goes into `server/data/db.json`, in four lists that match the future database tables:

* `conversations`: one per chat session
* `messages`: every message in and out
* `leads`: names, mobiles, emails and booking requests
* `summaries`: a short write-up created when a visitor ends a chat (the X button)

## How it works (for the curious)

The bubble talks to four addresses on the server:

* `GET /api/config/:clientId` gets the client's look and greeting.
* `POST /api/chat` sends the conversation and gets a reply, streamed word by word.
* `POST /api/lead` saves the quote and booking forms.
* `POST /api/end` ends the chat and saves a summary.

## Running on Cloudflare

The same app runs as a Cloudflare Worker named `systembrain-chat` (`server/src/worker.js`, settings in `wrangler.jsonc`).

- Test demo pages: https://systembrain-chat.systembrain.workers.dev/demo/ (demo client) and https://systembrain-chat.systembrain.workers.dev/demo/cloud9/ (Cloud 9).
- The widget and demo pages are served as Workers static assets. `npm run deploy` copies `widget/` and `demo/` into `.assets/` first, so nothing else in the repo is public.
- Storage is the D1 database `systembrain-chat`. Create the tables with `npm run db:migrate`. Local `npm start` still uses the JSON file.
- Client configs in `server/clients/*.json` are bundled into the Worker (see `worker.js`).
- `AI_PROVIDER` is `mock` by default (set in `wrangler.jsonc`). To switch to Grok, run `npx wrangler secret put XAI_API_KEY`, set `AI_PROVIDER` to `grok`, then deploy. The key never goes in the repo. Summary emails come later, sent to each client's `summaryEmail`.
- Live test: `npm run test:live` (demo) and `DEMO_PATH=/demo/cloud9/ npm run test:live` (Cloud 9). Screenshots go in `shots-live/<client>/`.

### Client isolation

Every table row has a `client_id`, and every query filters on it. Routes never touch the database directly. They go through `server/src/store/repo.js`, which ties a store to one client and checks that a chat session belongs to that client before using it. Another client's session gets a 403, and unknown client IDs get a 404.

All clients share the `DB` binding today. To give a client its own database, add another `d1_databases` entry in `wrangler.jsonc` (for example binding `DB_ACME`), run the schema on it, and add `acme: 'DB_ACME'` to `D1_BINDINGS` in `repo.js`.

### Widget versions and rollout

Widget files live at `/widget/<version>/widget.js` (today only `v1`). Websites load `/widget.js`, which points to the default version. When the widget loads a client's config and that client has a different `widgetVersion`, it hands over to that version. `/widget.js?c=<clientId>` also jumps straight to the client's version. To try a new version on one client first:

1. Add `widget/v2/widget.js` (set `VERSION = 'v2'` inside it) and add `'v2'` to `WIDGET_VERSIONS` in `app.js`.
2. Set `"widgetVersion": "v2"` in that one client's JSON and deploy. Everyone else stays on `v1`.
3. For smaller switches, use the `features` object in a client config.

### Rolling back

Every deploy creates a new Worker version.

- `npx wrangler deployments list` shows recent deploys.
- `npx wrangler rollback` goes back to the previous version, or `npx wrangler rollback <version-id>` for a specific one.
- `npx wrangler versions list` and `npx wrangler versions deploy` let you split traffic between two versions for a gradual rollout.

Rollback only restores code and bundled configs. It does not undo D1 data or schema changes. To roll one client back to an older widget, change its `widgetVersion` and deploy.

## Settings you can change when starting

| Setting | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8787 | Web address port. |
| `AI_PROVIDER` | mock | `mock` or `grok`. |
| `XAI_API_KEY` | none | Grok key, only for `grok`. |
| `DB_FILE` | server/data/db.json | Where data is saved. |

Example: `AI_PROVIDER=mock PORT=3000 npm start`
