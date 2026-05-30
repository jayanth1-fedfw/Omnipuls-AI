import type { OmnipulsState } from "@/lib/types";

export interface PulseRequest {
  message: string;
  state: OmnipulsState;
}

export interface PulseResponse {
  reply: string;
  action?: {
    type: "task" | "memory" | "manualAlert";
    customerName?: string;
    workGoal?: string;
    deadline?: string;
    dailyTime?: string;
    priority?: string;
    text?: string;
    message?: string;
    alertAt?: string;
  };
}

export async function generatePulseResponse(req: PulseRequest): Promise<PulseResponse> {
  const { message, state } = req;

  const activeTasks = state.tasks.filter((t) => t.status !== "complete");
  const completedTasks = state.tasks.filter((t) => t.status === "complete");
  const criticalTasks = activeTasks.filter((t) => t.priority === "critical" || t.priority === "high");

  const pulseSummary =
    activeTasks.length > 0
      ? `${activeTasks[0].customerName}: "${activeTasks[0].workGoal}"`
      : "No active work yet.";

  const contextBlock = `[Platform context]
Active automations: ${activeTasks.length} (${criticalTasks.length} high/critical)
Completed: ${completedTasks.length}
Memories stored: ${state.memories.length}
Alert tone: ${state.tone || "creative"}
Next deadline: ${pulseSummary}

[User message]
${message}`;

  const systemPrompt = `You are Pulse, the AI Copilot embedded inside OmniPulse — a customer work automation and alert platform.

Your job is to help operators manage customer deadlines, interpret alert patterns, and take action on the platform. You receive live platform context with every message.

RESPONSE RULES:
- Always respond in plain conversational text. No markdown, no bullet points, no headers.
- Keep every response under 3 sentences unless the user explicitly asks for detail.
- Be direct and actionable. Every reply should end with either an answer, a recommendation, or a question that moves things forward.
- Never say "I'm an AI" or mention Claude. You are Pulse.

PLATFORM ACTIONS YOU CAN SUGGEST:
- Create or edit a customer work automation (customerName, workGoal, deadline, dailyTime, priority)
- Add a memory note for a customer
- Set a manual alert at a specific time
- Change the alert tone (focused / creative / urgent / kind)

When the user describes a customer situation, extract the intent and suggest the exact platform action to take. If they give you enough detail, return a ready-to-apply suggestion in JSON format at the end of your reply as:

ACTION: {"type":"task","customerName":"...","workGoal":"...","deadline":"...","dailyTime":"09:00","priority":"medium"}

or

ACTION: {"type":"memory","text":"..."}

or

ACTION: {"type":"manualAlert","message":"...","alertAt":"..."}

Only include the ACTION block when you have enough information to fill it completely. Otherwise just reply conversationally and ask for what's missing.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: contextBlock
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "OpenAI API error");
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message.content || "";

    // Parse ACTION block if present
    const actionMatch = content.match(/ACTION:\s*(\{[\s\S]*?\})/);
    let action: PulseResponse["action"] | undefined;

    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1]);
      } catch {
        // Silent fail on parse error
      }
    }

    // Remove ACTION block from reply
    const reply = content.replace(/ACTION:\s*\{[\s\S]*?\}\s*$/, "").trim();

    return {
      reply: reply || "I'm here to help. What do you need?",
      action
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      reply: `I'm having trouble connecting right now. ${errorMessage}`,
      action: undefined
    };
  }
}
