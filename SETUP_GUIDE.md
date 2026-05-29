# Complete OpenAI Assistant Setup & Deployment Guide

## Part 1: Get Your OpenAI API Key

### Step 1.1: Create OpenAI Account
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Sign up or log in
3. Navigate to **API Keys** (https://platform.openai.com/api/keys)
4. Click **Create new secret key**
5. Copy the key (starts with `sk-proj-`)
   - ⚠️ **Save it securely** — you can't view it again!

### Step 1.2: Set Up Billing (if needed)
- Go to **Billing** → **Overview**
- Add a payment method
- Set a usage limit to control costs

---

## Part 2: Create OpenAI Assistant

### Step 2.1: Using the Provided Script

```bash
# Set your API key and run the setup script
$env:OPENAI_API_KEY="sk-proj-YOUR_KEY_HERE"
node setup-assistant.js
```

The script will:
- Create a new Assistant named "Omnipuls AI"
- Output your **Assistant ID** (looks like `asst_xxxx...`)
- Print the exact env variable to add

### Step 2.2: Manual Setup (via Dashboard)

Alternatively, create manually at https://platform.openai.com/assistants:

1. Click **Create** → **+ New Assistant**
2. Fill in:
   - **Name:** `Omnipuls AI`
   - **Model:** `gpt-4o-mini`
   - **Instructions:** (Copy from `setup-assistant.js` lines 36-60)
3. Click **Create**
4. Copy the **ID** from the URL or details panel

---

## Part 3: Configure Local Environment

### Step 3.1: Create `.env.local`

```bash
cp .env.local.example .env.local
```

### Step 3.2: Add Your Credentials

Edit `.env.local`:

```env
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY_HERE
OPENAI_MODEL=gpt-4o-mini
OPENAI_ASSISTANT_ID=asst_YOUR_ASSISTANT_ID_HERE

# Optional: PostgreSQL database
# DATABASE_URL=postgresql://user:password@host/omnipuls_db
```

---

## Part 4: Test Locally

### Step 4.1: Install Dependencies

```bash
npm install
```

### Step 4.2: Start Dev Server

```bash
npm run dev
```

### Step 4.3: Test the Copilot API

Open a new terminal:

```powershell
# Test the copilot endpoint
$body = @{
    message = "Create a task for Jane to review the proposal by Friday"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/copilot" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body | Select-Object -ExpandProperty Content
```

Expected response:
```json
{
  "reply": "I've captured the request...",
  "memory": "Create a task for Jane to review the proposal by Friday",
  "task": {
    "customerName": "Jane",
    "workGoal": "review the proposal",
    "deadline": "2026-06-06T18:00:00.000Z",
    "dailyTime": "09:00",
    "priority": "medium",
    "status": "active"
  }
}
```

---

## Part 5: Deploy to Vercel

### Step 5.1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 5.2: Deploy

```bash
# Deploy to production
vercel --prod --confirm
```

The CLI will:
- Link your project to Vercel
- Create a deployment
- Show your live URL

### Step 5.3: Add Environment Variables in Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **Omnipuls-AI** project
3. Navigate to **Settings** → **Environment Variables**
4. Add these variables:
   - **Key:** `OPENAI_API_KEY` | **Value:** `sk-proj-YOUR_KEY` | **Environments:** Production, Preview, Development
   - **Key:** `OPENAI_MODEL` | **Value:** `gpt-4o-mini` | **Environments:** All
   - **Key:** `OPENAI_ASSISTANT_ID` | **Value:** `asst_YOUR_ID` | **Environments:** All

5. Click **Save**
6. Vercel will auto-redeploy with the new variables

---

## Part 6: Verify Live Deployment

### Step 6.1: Get Your Live URL

From Vercel dashboard, copy the project URL (e.g., `https://omnipuls-ai.vercel.app`)

### Step 6.2: Test the Live API

```powershell
$env:LIVE_URL = "https://your-omnipuls-ai-url.vercel.app"

$body = @{
    message = "Remind me to call John tomorrow at 3 PM"
} | ConvertTo-Json

Invoke-WebRequest -Uri "$($env:LIVE_URL)/api/copilot" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

### Step 6.3: Monitor Logs

In Vercel Dashboard:
- **Deployments** tab: View deployment status
- **Functions** tab: See API call logs
- **Analytics** tab: Monitor usage

---

## Part 7: Commit & Push Updates

```bash
# Add all changes
git add .

# Commit setup files
git commit -m "Add OpenAI Assistant setup script and guides"

# Push to GitHub (auto-triggers Vercel redeploy)
git push origin main
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `OPENAI_API_KEY` not found | Verify env var is set in Vercel; check `.env.local` locally |
| `401 Unauthorized` | API key is invalid or expired; regenerate from OpenAI dashboard |
| `400 Bad Request` | Assistant ID format wrong; should start with `asst_` |
| `No text content in assistant message` | Check assistant instructions; may need debugging via OpenAI dashboard |
| `Module not found` | Run `npm install` locally before deploying |
| Vercel build fails | Check build logs in **Deployments** tab; ensure all imports resolve |

---

## Quick Reference Commands

```bash
# Local development
npm run dev                    # Start dev server
npm run build                  # Test production build
npm run lint                   # Check code quality

# OpenAI setup
$env:OPENAI_API_KEY = "sk-..."
node setup-assistant.js        # Create assistant

# Deployment
vercel --prod                  # Deploy to Vercel
git push origin main           # Push to GitHub (auto-redeploy)
```

---

## Environment Variables Summary

| Variable | Required | Example |
|----------|----------|---------|
| `OPENAI_API_KEY` | ✅ Yes | `sk-proj-abc123...` |
| `OPENAI_MODEL` | ❌ No | `gpt-4o-mini` (default) |
| `OPENAI_ASSISTANT_ID` | ❌ No | `asst_abc123...` (uses Responses API if omitted) |
| `DATABASE_URL` | ❌ No | `postgresql://...` (defaults to local JSON) |

---

## Next Steps

1. ✅ Get OpenAI API key
2. ✅ Create Assistant using `setup-assistant.js`
3. ✅ Add credentials to `.env.local`
4. ✅ Test locally with `npm run dev`
5. ✅ Deploy to Vercel with `vercel --prod`
6. ✅ Add env vars in Vercel dashboard
7. ✅ Test live API endpoint
8. ✅ Monitor in Vercel dashboard

**Questions?** Check [OpenAI Docs](https://platform.openai.com/docs) or [Vercel Docs](https://vercel.com/docs)
