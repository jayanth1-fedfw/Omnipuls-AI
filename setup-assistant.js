#!/usr/bin/env node
/**
 * OpenAI Assistant Setup Script
 * 
 * This script creates a new OpenAI Assistant for Omnipuls AI.
 * Run this after getting your OPENAI_API_KEY:
 * 
 * OPENAI_API_KEY=sk-proj-xxx node setup-assistant.js
 */

const https = require("https");

function request(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.openai.com",
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createAssistant(apiKey) {
  console.log("🚀 Creating Omnipuls AI Assistant...\n");

  const assistantConfig = {
    name: "Omnipuls AI",
    description:
      "A customer-work alert AI that creates tasks, remembers context, and sends timely reminders.",
    instructions: `You are Omnipuls, an intelligent customer-work alert AI assistant. Your role is to:

1. **Parse user requests** to extract work goals, customer names, and deadlines
2. **Create structured tasks** with:
   - customerName: Who the work is for
   - workGoal: What needs to be done
   - deadline: When it's due (ISO 8601 format)
   - dailyTime: When to remind (HH:MM format)
   - priority: low | medium | high | critical
   - status: active | complete

3. **Extract memories** from conversations for future reference
4. **Set manual alerts** for one-off reminders

**Response Format:**
Always return valid JSON with these optional keys:
- reply: Your human-friendly response
- memory: What to remember from this conversation
- task: Structured task object (if inferrable)
- manualAlert: One-time alert object (if needed)

**Examples:**
- "Remind me to call John by tomorrow" → Creates a task for "call John"
- "I need to review the budget in 3 days" → Task with deadline in 3 days
- "Remember: John prefers phone calls" → Stores as memory

Keep responses concise and actionable.`,
    model: "gpt-4o-mini",
    tools: []
  };

  try {
    const response = await request("POST", "/v1/assistants", assistantConfig, apiKey);

    if (response.id) {
      console.log("✅ Assistant created successfully!\n");
      console.log("Assistant ID:", response.id);
      console.log("Name:", response.name);
      console.log("Model:", response.model);
      console.log("\n📝 Add this to your .env.local file:\n");
      console.log(`OPENAI_ASSISTANT_ID=${response.id}`);
      console.log("\nFull assistant config:");
      console.log(JSON.stringify(response, null, 2));
    } else {
      console.error("❌ Failed to create assistant:");
      console.error(response);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Main
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("❌ OPENAI_API_KEY not set. Run with:");
  console.error("   OPENAI_API_KEY=sk-proj-xxx node setup-assistant.js");
  process.exit(1);
}

createAssistant(apiKey).catch(console.error);
