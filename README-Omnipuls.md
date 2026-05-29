# Omnipuls

Omnipuls is a full-stack customer-work alert AI dashboard. It stores customer context from previous browsing or AI bot chats, creates daily creative reminders until the work deadline, and supports one-off manual alerts.

The dashboard uses a futuristic GenAI operations interface with accessible focus states, skip navigation, display modes, and reduced-motion support.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database

The app uses a database adapter:

- `DATABASE_URL` set: Neon/Postgres through `@neondatabase/serverless`.
- `DATABASE_URL` missing: local JSON database at `.data/omnipuls.json` for development.

For production deployment, attach a Neon Postgres database in Vercel Marketplace and set `DATABASE_URL`.

## AI Copilot

The platform includes an Omnipuls AI Copilot. If `OPENAI_API_KEY` is set, it calls the OpenAI Assistant API (if `OPENAI_ASSISTANT_ID` is set) or falls back to the Responses API. Without a key, it uses the built-in local action engine so the app still works.

Optional environment variables:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ASSISTANT_ID=your_assistant_id
```

## Deploy

```bash
npm run build
vercel --prod
```

If `vercel` is not installed, use:

```bash
npx vercel --prod
```
