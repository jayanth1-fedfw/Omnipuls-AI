import type { CopilotSuggestion, ManualAlertInput, OmnipulsState, Priority, TaskInput } from "@/lib/types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
};

export async function generateCopilotSuggestion(message: string, state: OmnipulsState): Promise<CopilotSuggestion> {
  if (process.env.OPENAI_API_KEY) {
    const remote = await generateWithOpenAI(message, state);

    if (remote) {
      return remote;
    }
  }

  return generateLocalSuggestion(message, state);
}

async function generateWithOpenAI(message: string, state: OmnipulsState): Promise<CopilotSuggestion | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions:
        "You are Omnipuls, a customer-work alert AI. Return only JSON with keys reply, memory, task, manualAlert. task must include customerName, workGoal, sourceMemory, deadline ISO string, dailyTime HH:MM, priority low|medium|high|critical, status active|complete. manualAlert must include message and alertAt ISO string. Omit keys you cannot infer.",
      input: JSON.stringify({
        request: message,
        existingTasks: state.tasks.slice(0, 8),
        memories: state.memories.slice(0, 8),
        manualAlerts: state.manualAlerts.slice(0, 8),
        now: new Date().toISOString()
      }),
      text: {
        format: {
          type: "json_object"
        }
      },
      max_output_tokens: 900
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OpenAIResponse;
  const text = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.text)?.text;

  if (!text) {
    return null;
  }

  try {
    return normalizeSuggestion(JSON.parse(text));
  } catch {
    return null;
  }
}

function generateLocalSuggestion(message: string, state: OmnipulsState): CopilotSuggestion {
  const lower = message.toLowerCase();
  const customerName = extractCustomerName(message) || state.tasks[0]?.customerName || "Customer";
  const deadline = extractDeadline(lower);
  const priority: Priority = lower.includes("urgent") || lower.includes("asap") ? "critical" : lower.includes("important") ? "high" : "medium";
  const workGoal = extractGoal(message);
  const dailyTime = extractTime(lower) || "09:00";
  const wantsReminder = lower.includes("remind") || lower.includes("alert") || lower.includes("follow up");

  const task: TaskInput | undefined =
    workGoal || deadline
      ? {
          customerName,
          workGoal: workGoal || "Follow up on customer work",
          sourceMemory: message,
          deadline,
          dailyTime,
          priority,
          status: "active"
        }
      : undefined;

  const manualAlert: ManualAlertInput | undefined =
    wantsReminder && !task
      ? {
          message: `Follow up: ${message}`,
          alertAt: deadline
        }
      : undefined;

  return {
    reply: task
      ? `I prepared an automation for ${customerName}. It will remind you daily at ${dailyTime} until the deadline.`
      : `I saved this as customer context and can turn it into a deadline automation when you add a work goal.`,
    memory: message,
    task,
    manualAlert
  };
}

function normalizeSuggestion(value: Partial<CopilotSuggestion>): CopilotSuggestion {
  return {
    reply: typeof value.reply === "string" ? value.reply : "I prepared the next best action.",
    memory: typeof value.memory === "string" ? value.memory : undefined,
    task: value.task ? normalizeTask(value.task) : undefined,
    manualAlert: value.manualAlert ? normalizeManualAlert(value.manualAlert) : undefined
  };
}

function normalizeTask(value: Partial<TaskInput>): TaskInput | undefined {
  if (!value.customerName || !value.workGoal) {
    return undefined;
  }

  return {
    customerName: String(value.customerName),
    workGoal: String(value.workGoal),
    sourceMemory: String(value.sourceMemory || ""),
    deadline: validDate(value.deadline) || defaultDeadline(),
    dailyTime: /^\d{2}:\d{2}$/.test(String(value.dailyTime)) ? String(value.dailyTime) : "09:00",
    priority: isPriority(value.priority) ? value.priority : "medium",
    status: value.status === "complete" ? "complete" : "active"
  };
}

function normalizeManualAlert(value: Partial<ManualAlertInput>): ManualAlertInput | undefined {
  if (!value.message) {
    return undefined;
  }

  return {
    message: String(value.message),
    alertAt: validDate(value.alertAt) || defaultDeadline()
  };
}

function extractCustomerName(message: string) {
  const match = message.match(/\b(?:for|customer|client)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return match?.[1];
}

function extractGoal(message: string) {
  const match = message.match(/\b(?:to|goal is|work is|need to)\s+(.+?)(?:\s+by|\s+before|\s+at|$)/i);
  return match?.[1]?.trim() || message.slice(0, 90);
}

function extractDeadline(message: string) {
  const date = new Date();

  if (message.includes("today")) {
    date.setHours(18, 0, 0, 0);
    return date.toISOString();
  }

  if (message.includes("tomorrow")) {
    date.setDate(date.getDate() + 1);
    date.setHours(18, 0, 0, 0);
    return date.toISOString();
  }

  const days = message.match(/in\s+(\d+)\s+days?/);
  if (days) {
    date.setDate(date.getDate() + Number(days[1]));
    date.setHours(18, 0, 0, 0);
    return date.toISOString();
  }

  return defaultDeadline();
}

function extractTime(message: string) {
  const match = message.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : undefined;
}

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(18, 0, 0, 0);
  return date.toISOString();
}

function validDate(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isPriority(value: unknown): value is Priority {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}
