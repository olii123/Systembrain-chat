# SystemBrain Chat

A chat bubble you can add to any website with one line, plus a small server that answers the chats, saves leads and writes a summary when a chat ends.

Right now it runs on your own computer, with no outside services. The "AI" is a simple built-in responder (the mock) that answers from each client's settings file. Later, the same code moves to Cloudflare and switches to Grok for real AI answers.

## What is in the folder

| Folder | What it is |
| --- | --- |
| `widget/widget.js` | The chat bubble. This is the one file a website loads. |
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
<script src="https://YOUR-SERVER/widget/widget.js" data-client-id="demo" defer></script>
```

That is all. The bubble loads its colours, greeting and buttons from the server, so you never need to edit the website again to change them.

## Adding a new client

1. Go to `server/clients/`.
2. Copy `demo.json` and rename the copy to the new client's short name, for example `bobs-plumbing.json`. Use lowercase letters, numbers and dashes only.
3. Open the new file and change the text. Inside the file, set `"clientId"` to the same short name.
4. Restart the server (Ctrl and C, then `npm start`).
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

## Later: Cloudflare Workers, D1 and Grok

The server is built with Hono, which runs the same way on your computer and on Cloudflare. Moving it over is a short job:

1. **Cloudflare Workers** (hosting). `server/src/app.js` holds all the logic and does not depend on Node. `server/src/worker.example.js` shows the Cloudflare starting point. The widget file goes on Cloudflare too (or any web host), and websites point their script tag at it.
2. **Cloudflare D1** (database). Create a D1 database and load `server/schema.sql` into it. The local file store is swapped for the D1 store sketched in `worker.example.js`; the tables are already the same.
3. **Grok** (real AI). `server/src/providers/grok.js` is written but switched off. To turn it on, set two settings: `AI_PROVIDER=grok` and `XAI_API_KEY=your key`. On Cloudflare the key is stored as a secret. Grok then answers using the client's services, FAQs and tone. Until then, `AI_PROVIDER=mock` (the default) is used.

Summary emails will also be switched on at that stage, sent to each client's `summaryEmail`.

## Settings you can change when starting

| Setting | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8787 | Web address port. |
| `AI_PROVIDER` | mock | `mock` or `grok`. |
| `XAI_API_KEY` | none | Grok key, only for `grok`. |
| `DB_FILE` | server/data/db.json | Where data is saved. |

Example: `AI_PROVIDER=mock PORT=3000 npm start`
