# Omnipuls AI Deployment Guide

## Step 1: Local Setup with OpenAI

1. **Copy environment template:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **Get your OpenAI credentials:**
   - Visit [OpenAI API Keys](https://platform.openai.com/api/keys)
   - Create a new API key and copy it
   - (Optional) Create an Assistant ID at [OpenAI Assistants](https://platform.openai.com/assistants) for advanced features

3. **Update `.env.local` with your keys:**
   ```
   OPENAI_API_KEY=sk-proj-your_actual_key
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_ASSISTANT_ID=asst_your_assistant_id  # optional
   ```

4. **Test locally:**
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:3000` and test the Copilot feature.

---

## Step 2: Deploy to Vercel

### Option A: Using Vercel CLI

1. **Install Vercel CLI (if needed):**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel --prod
   ```

3. **Set environment variables in Vercel dashboard:**
   - Go to your project on [Vercel](https://vercel.com)
   - Navigate to **Settings** → **Environment Variables**
   - Add:
     - `OPENAI_API_KEY` = your key
     - `OPENAI_MODEL` = `gpt-4o-mini`
     - `OPENAI_ASSISTANT_ID` = your assistant ID (optional)
     - `DATABASE_URL` = PostgreSQL/Neon URL (optional, uses local JSON if omitted)

### Option B: Using GitHub Integration (Recommended)

1. **Push to GitHub:**
   ```bash
   git remote add origin https://github.com/jayanth1-fedfw/Omnipuls-AI.git
   git branch -M main
   git push -u origin main
   ```

2. **Link to Vercel:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click **New Project** → Select your `Omnipuls-AI` repo
   - Let Vercel auto-detect Next.js
   - Add environment variables before deploying
   - Deploy

---

## Step 3: Verify Deployment

- **Test the live endpoint:**
  ```bash
  curl -X POST https://your-vercel-url.vercel.app/api/copilot \
    -H "Content-Type: application/json" \
    -d '{"message": "Create a task for John to review documents by tomorrow"}'
  ```

- **Expected response:**
  ```json
  {
    "reply": "I've captured the request...",
    "memory": "Create a task for John to review documents by tomorrow",
    "task": {
      "customerName": "John",
      "workGoal": "review documents",
      "deadline": "2026-05-31T18:00:00.000Z",
      "priority": "medium",
      "status": "active"
    }
  }
  ```

---

## Fallback Behavior

- **If `OPENAI_API_KEY` is not set:** The app uses local AI logic (no OpenAI calls).
- **If `OPENAI_ASSISTANT_ID` is set:** Uses the OpenAI Assistant API.
- **Otherwise:** Falls back to OpenAI Responses API (GPT-4o-mini).

All modes support task creation, memory storage, and manual alerts.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `API key not found` | Verify `OPENAI_API_KEY` is set in Vercel Environment Variables |
| `401 Unauthorized` | Check API key is valid; generate a new one if needed |
| `Module not found` | Run `npm install` locally; redeploy |
| Database errors | Set `DATABASE_URL` to a valid Neon PostgreSQL connection string |
