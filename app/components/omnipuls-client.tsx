"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createAlertMessage, remainingText } from "@/lib/alerts";
import type { AlertTone, CopilotSuggestion, OmnipulsState, Task } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────

type Props = {
  initialState: OmnipulsState;
};

type AccessMode = "comfortable" | "focus" | "large";

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: number;
};

// ── Constants ──────────────────────────────────────────────────

const blankTask = {
  customerName: "",
  workGoal: "",
  sourceMemory: "",
  deadline: "",
  dailyTime: "09:00",
  priority: "medium",
  status: "active",
};

const PULSE_SYSTEM_PROMPT = `You are Pulse, the AI Copilot embedded inside OmniPulse — a customer work automation and alert platform.

Your job is to help operators manage customer deadlines, interpret alert patterns, and take action on the platform. You receive live platform context with every message.

RESPONSE RULES:
- Always respond in plain conversational text. No markdown, no bullet points, no headers.
- Keep every response under 3 sentences unless the user explicitly asks for detail.
- Be direct and actionable. Every reply should end with either an answer, a recommendation, or a question that moves things forward.
- Never say you are an AI or mention Claude. You are Pulse.

PLATFORM ACTIONS YOU CAN SUGGEST:
- Create or edit a customer work automation (customerName, workGoal, deadline, dailyTime, priority)
- Add a memory note for a customer
- Set a manual alert at a specific time
- Change the alert tone (focused / creative / urgent / kind)

When the user describes a customer situation, extract the intent and suggest the exact platform action to take. If they give you enough detail, return a ready-to-apply suggestion in this JSON format at the end of your reply:

ACTION: {"type":"task","customerName":"...","workGoal":"...","deadline":"...","dailyTime":"09:00","priority":"medium"}

or

ACTION: {"type":"memory","text":"..."}

or

ACTION: {"type":"manualAlert","message":"...","alertAt":"..."}

Only include the ACTION block when you have enough information to fill it completely. Otherwise just reply conversationally and ask for what is missing.`;

// ── Helpers ────────────────────────────────────────────────────

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toInputDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fireAlert(title: string, message: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body: message });
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Component ──────────────────────────────────────────────────

export default function OmnipulsClient({ initialState }: Props) {

  // ── Core state ─────────────────────────────────────────────
  const [state, setState] = useState(initialState);
  const [taskForm, setTaskForm] = useState(blankTask);
  const [editingId, setEditingId] = useState(null);
  const [memoryText, setMemoryText] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [manualAt, setManualAt] = useState("");
  const [tone, setTone] = useState("creative");
  const [toast, setToast] = useState("");
  const [copilotMessage, setCopilotMessage] = useState("");
  const [copilotSuggestion, setCopilotSuggestion] = useState(null);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [accessMode, setAccessMode] = useState("comfortable");

  // ── Pulse chat state ───────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([
    {
      id: uid(),
      role: "ai",
      text: "Hi, I am Pulse. I can help you analyze customer patterns, interpret alerts, and suggest next actions on the platform. What is on your radar?",
      timestamp: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatLogRef = useRef(null);
  const chatInputRef = useRef(null);

  // ── Derived ────────────────────────────────────────────────
  const activeTasks = state.tasks.filter((t) => t.status !== "complete");
  const completedTasks = state.tasks.filter((t) => t.status === "complete");
  const criticalTasks = activeTasks.filter(
    (t) => t.priority === "critical" || t.priority === "high"
  );

  const pulseSummary = useMemo(() => {
    if (!activeTasks.length) return "No active work yet.";
    const soonest = [...activeTasks].sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    )[0];
    return `${soonest.customerName}: ${remainingText(soonest.deadline)} for "${soonest.workGoal}".`;
  }, [activeTasks]);

  // ── Init datetime defaults ─────────────────────────────────
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0);
    const nextManual = new Date();
    nextManual.setHours(nextManual.getHours() + 1, 0, 0, 0);
    setTaskForm((c) => ({ ...c, deadline: c.deadline || toInputDateTime(tomorrow) }));
    setManualAt((c) => c || toInputDateTime(nextManual));
  }, []);

  // ── Poll due alerts ────────────────────────────────────────
  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch("/api/alerts/due");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.alerts)) return;
      for (const alert of data.alerts) {
        const firedKey = `omnipuls-fired:${data.todayKey}:${alert.type}:${alert.id}`;
        if (window.localStorage.getItem(firedKey)) continue;
        window.localStorage.setItem(firedKey, "true");
        fireAlert(alert.title, alert.message);
        if (alert.type === "manual") {
          await fetch("/api/manual-alerts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: alert.id }),
          });
          await refreshState();
        }
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  // ── Auto scroll chat ───────────────────────────────────────
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages, chatBusy]);

  // ── Auto clear toast ───────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── API helpers ────────────────────────────────────────────

  async function refreshState() {
    const response = await fetch("/api/state");
    const data = await response.json();
    if (response.ok) setState(data);
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...taskForm, id: editingId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setToast(data.error || "Could not save automation.");
      return;
    }
    setToast("Automation saved.");
    setEditingId(null);
    setTaskForm({ ...blankTask, deadline: taskForm.deadline });
    await refreshState();
  }

  async function addMemory(event: FormEvent) {
    event.preventDefault();
    if (!memoryText.trim()) return;
    const response = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: memoryText }),
    });
    if (response.ok) {
      setMemoryText("");
      await refreshState();
    }
  }

  async function addManualAlert(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/manual-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: manualMessage, alertAt: manualAt }),
    });
    const data = await response.json();
    if (!response.ok) {
      setToast(data.error || "Could not set manual alert.");
      return;
    }
    setManualMessage("");
    setToast("Manual alert armed.");
    await refreshState();
  }

  async function askCopilot(event: FormEvent) {
    event.preventDefault();
    if (!copilotMessage.trim()) return;
    setCopilotBusy(true);
    const response = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: copilotMessage }),
    });
    const data = await response.json();
    setCopilotBusy(false);
    if (!response.ok) {
      setToast(data.error || "Copilot could not respond.");
      return;
    }
    setCopilotSuggestion(data);
    setToast("Copilot prepared an action.");
  }

  async function applyCopilotSuggestion() {
    if (!copilotSuggestion) return;
    if (copilotSuggestion.memory) {
      await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: copilotSuggestion.memory }),
      });
    }
    if (copilotSuggestion.task) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copilotSuggestion.task),
      });
    }
    if (copilotSuggestion.manualAlert) {
      await fetch("/api/manual-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copilotSuggestion.manualAlert),
      });
    }
    setCopilotMessage("");
    setCopilotSuggestion(null);
    setToast("Copilot action applied.");
    await refreshState();
  }

  async function completeTask(id: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "complete" }),
    });
    await refreshState();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refreshState();
  }

  async function deleteManualAlert(id: string) {
    await fetch(`/api/manual-alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refreshState();
  }

  // ── Pulse chat ─────────────────────────────────────────────

  function buildPulseContext() {
    return [
      `Current platform state:`,
      `- Active automations: ${activeTasks.length} (${criticalTasks.length} high/critical)`,
      `- Completed: ${completedTasks.length}`,
      `- Memories stored: ${state.memories.length}`,
      `- Manual alerts pending: ${state.manualAlerts.filter((a) => !a.fired).length}`,
      `- Alert tone: ${tone}`,
      activeTasks.length ? `- Next deadline: ${pulseSummary}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", text, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatBusy(true);

    const history = chatMessages
      .slice(1)
      .map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
    history.push({ role: "user", content: text });

    try {
      const response = await fetch("/api/pulse-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `${PULSE_SYSTEM_PROMPT}\n\n${buildPulseContext()}`,
          messages: history,
        }),
      });
      const data = await response.json();
      const reply =
        data.content
          ?.map((b: { type: string; text?: string }) => b.text ?? "")
          .join("") || "I could not generate a response. Please try again.";

      setChatMessages((prev) => [
        ...prev,
        { id: uid(), role: "ai", text: reply, timestamp: Date.now() },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "ai",
          text: "Connection error. Check your network and try again.",
          timestamp: Date.now(),
        },
      ]);
    }

    setChatBusy(false);
    chatInputRef.current?.focus();
  }

  function handleChatKey(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  }

  function handleChatChip(prompt: string) {
    setChatInput(prompt);
    chatInputRef.current?.focus();
  }

  // ── Other UI helpers ───────────────────────────────────────

  function editTask(task: Task) {
    setEditingId(task.id);
    setTaskForm({
      customerName: task.customerName,
      workGoal: task.workGoal,
      sourceMemory: task.sourceMemory,
      deadline: toInputDateTime(new Date(task.deadline)),
      dailyTime: task.dailyTime,
      priority: task.priority,
      status: task.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestNotifications() {
    if (!("Notification" in window)) {
      setToast("This browser does not support desktop alerts.");
      return;
    }
    Notification.requestPermission().then((permission) => {
      setToast(
        permission === "granted"
          ? "Desktop alerts enabled."
          : "Desktop alerts not enabled."
      );
    });
  }

  async function loadDemo() {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 4);
    deadline.setHours(17, 30, 0, 0);
    setTaskForm({
      customerName: "Mira Kapoor",
      workGoal: "Complete onboarding package",
      sourceMemory: "Asked about setup steps, billing, and how fast the team can go live.",
      deadline: toInputDateTime(deadline),
      dailyTime: "09:30",
      priority: "high",
      status: "active",
    });
    setMemoryText(
      "Customer browsed pricing, asked the AI bot about implementation time, and wanted a final checklist."
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", minHeight: "100vh", gap: "1.5rem", padding: "1.5rem" }}>
      {/* Sidebar */}
      <aside style={{ width: "200px", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: "1.75rem", fontWeight: "bold" }}>
            O
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontWeight: "bold" }}>Omnipuls</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>
              Customer work alert AI
            </div>
          </div>
        </div>

        <nav style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <a href="#copilot" style={{ textDecoration: "none", cursor: "pointer" }}>AI Copilot</a>
          <a href="#pulse-chat" style={{ textDecoration: "none", cursor: "pointer" }}>Pulse Chat</a>
          <a href="#customer-work" style={{ textDecoration: "none", cursor: "pointer" }}>Customer Work</a>
          <a href="#manual-alerts" style={{ textDecoration: "none", cursor: "pointer" }}>Manual Alerts</a>
          <a href="#automations" style={{ textDecoration: "none", cursor: "pointer" }}>Automations</a>
        </nav>

        <div style={{ marginBottom: "1.5rem" }}>
          <button onClick={requestNotifications} style={{ padding: "0.5rem", width: "100%" }}>
            Enable browser alerts
          </button>
          <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>{pulseSummary}</div>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Daily Style
          </label>
          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.5rem" }}>
            Daily alert writing style
          </div>
          <select value={tone} onChange={(e) => setTone(e.target.value as AlertTone)} style={{ width: "100%" }}>
            <option value="focused">Focused</option>
            <option value="creative">Creative</option>
            <option value="urgent">Urgent</option>
            <option value="kind">Kind</option>
          </select>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Access Mode
          </label>
          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.5rem" }}>
            Inclusive
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["comfortable", "focus", "large"] as AccessMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setAccessMode(mode)}
                style={{ flex: 1, padding: "0.5rem", background: accessMode === mode ? "#3c3489" : "#f0f0f0", color: accessMode === mode ? "white" : "black" }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Platform Health
          </div>
          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.25rem" }}>
            Live
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem" }}>
            <div>{activeTasks.length} active</div>
            <div>{criticalTasks.length} high focus</div>
            <div>{completedTasks.length} complete</div>
            <div>{state.memories.length} memories</div>
          </div>
        </div>
      </aside>

      {/* Workspace */}
      <main style={{ flex: 1 }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ marginBottom: "0.5rem" }}>Neural operations deck</h1>
          <p style={{ opacity: 0.6, marginBottom: "0.5rem" }}>
            Convert customer signals into intelligent work pulses
          </p>
          <p style={{ fontSize: "0.875rem", opacity: 0.6, marginBottom: "1rem" }}>
            Command Omnipuls in natural language, preserve customer memory, and launch
            accessible deadline alerts that stay useful.
          </p>
          <button onClick={loadDemo} style={{ padding: "0.5rem 1rem" }}>
            Load demo
          </button>
        </div>

        {/* AI Copilot — action generator */}
        <section id="copilot" style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "0.5rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Omnipuls AI Copilot</h2>
          <p style={{ fontSize: "0.875rem", opacity: 0.6, marginBottom: "0.5rem" }}>
            Describe the signal. Omnipuls generates the next action.
          </p>
          <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "1rem" }}>
            Built for teams, founders, support agents, students, and anyone who needs
            a clear path from conversation to completion.
          </p>

          <form onSubmit={askCopilot} style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Ask Omnipuls
            </label>
            <input
              type="text"
              value={copilotMessage}
              onChange={(e) => setCopilotMessage(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              {[
                "Create a daily follow-up",
                "Turn this chat into a deadline",
                "Make a kind customer nudge",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setCopilotMessage(prompt)}
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem", background: "#f0f0f0", border: "1px solid #ddd" }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <button type="submit" style={{ padding: "0.5rem 1rem" }}>
              {copilotBusy ? "Thinking…" : "Generate action"}
            </button>
          </form>

          {copilotSuggestion && (
            <div style={{ padding: "1rem", background: "#f0f0f0", borderRadius: "0.5rem", marginBottom: "1rem" }}>
              <p style={{ marginBottom: "0.5rem" }}>{copilotSuggestion.reply}</p>

              {copilotSuggestion.task && (
                <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <div>Task: {copilotSuggestion.task.workGoal}</div>
                  <div>Customer: {copilotSuggestion.task.customerName}</div>
                  <div>Daily: {copilotSuggestion.task.dailyTime}</div>
                </div>
              )}
              {copilotSuggestion.manualAlert && (
                <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <div>Manual: {copilotSuggestion.manualAlert.message}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button onClick={applyCopilotSuggestion} style={{ padding: "0.5rem 1rem" }}>
                  Apply suggestion
                </button>
                <button onClick={() => setCopilotSuggestion(null)} style={{ padding: "0.5rem 1rem" }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Pulse AI Chatbot — replaces CalculatorBrowser */}
        <section id="pulse-chat" style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>Pulse — AI Copilot Chat</h2>
            <span className="pulse-chat-badge">Claude-powered</span>
          </div>

          <div className="pulse-chat-chips">
            {[
              "Summarize my active tasks",
              "Which customer is most urgent?",
              "How should I set alert tones?",
              "Explain the platform health stats",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => handleChatChip(chip)}
                className="pulse-chip"
                style={{ padding: "0.3rem 0.75rem" }}
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="pulse-chat-log" ref={chatLogRef}>
            {chatMessages.map((msg) => (
              <div key={msg.id} className="pulse-msg">
                <div>
                  {msg.text}
                  <div style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: "0.25rem" }}>
                    {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
                      new Date(msg.timestamp)
                    )}
                  </div>
                </div>
              </div>
            ))}

            {chatBusy && (
              <div className="pulse-msg">
                <div style={{ opacity: 0.6 }}>Pulse is thinking…</div>
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }} style={{ display: "flex", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem", display: "block", width: "100%" }}>
              Message Pulse
            </label>
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKey}
              disabled={chatBusy}
              style={{ width: "100%", flex: 1, padding: "0.5rem", marginBottom: "0.5rem" }}
            />
            <button type="submit" style={{ padding: "0.5rem 1rem" }}>
              {chatBusy ? "…" : "Send"}
            </button>
          </form>
        </section>

        {/* Customer Work + Memory grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
          <section id="customer-work" style={{ padding: "1.5rem", border: "1px solid #ddd", borderRadius: "0.5rem" }}>
            <h3 style={{ marginBottom: "1rem" }}>
              Customer Work
              {editingId ? " - Editing" : " - New"}
            </h3>

            <form onSubmit={saveTask} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Customer name
                </label>
                <input
                  type="text"
                  value={taskForm.customerName}
                  onChange={(e) => setTaskForm({ ...taskForm, customerName: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Work goal
                </label>
                <input
                  type="text"
                  value={taskForm.workGoal}
                  onChange={(e) => setTaskForm({ ...taskForm, workGoal: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Source memory
                </label>
                <textarea
                  value={taskForm.sourceMemory}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, sourceMemory: e.target.value })
                  }
                  style={{ width: "100%", padding: "0.5rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={taskForm.deadline}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, deadline: e.target.value })
                    }
                    style={{ width: "100%", padding: "0.5rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    Daily alert time
                  </label>
                  <input
                    type="time"
                    value={taskForm.dailyTime}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, dailyTime: e.target.value })
                    }
                    style={{ width: "100%", padding: "0.5rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    Priority
                  </label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, priority: e.target.value })
                    }
                    style={{ width: "100%", padding: "0.5rem" }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    Status
                  </label>
                  <select
                    value={taskForm.status}
                    onChange={(e) =>
                      setTaskForm({ ...taskForm, status: e.target.value })
                    }
                    style={{ width: "100%", padding: "0.5rem" }}
                  >
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="submit" style={{ flex: 1, padding: "0.5rem 1rem" }}>
                  Save automation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setTaskForm(blankTask);
                  }}
                  style={{ padding: "0.5rem 1rem" }}
                >
                  Clear
                </button>
              </div>
            </form>
          </section>

          <section style={{ padding: "1.5rem", border: "1px solid #ddd", borderRadius: "0.5rem" }}>
            <h3 style={{ marginBottom: "1rem" }}>
              AI Bot Memory
              {state.memories.length ? ` - ${state.memories.length} notes` : ""}
            </h3>

            <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "1rem", border: "1px solid #eee", borderRadius: "0.25rem", padding: "0.5rem" }}>
              {state.memories.length ? (
                state.memories.map((memory) => (
                  <div key={memory.id} style={{ marginBottom: "0.5rem", fontSize: "0.875rem", borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>
                    <div>{memory.text}</div>
                    <div style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: "0.25rem" }}>
                      {formatDate(memory.createdAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "0.875rem", opacity: 0.6 }}>
                  Customer browsing and AI bot chat notes appear here.
                </div>
              )}
            </div>

            <form onSubmit={addMemory}>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
                Add customer memory
              </label>
              <input
                type="text"
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
              />
              <button type="submit" style={{ width: "100%", padding: "0.5rem 1rem" }}>
                + Add memory
              </button>
            </form>
          </section>
        </div>

        {/* Manual Alerts */}
        <section id="manual-alerts" style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "0.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Manual Alert Setter - Database backed</h3>

          <form onSubmit={addManualAlert} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                Alert message
              </label>
              <input
                type="text"
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                Alert date and time
              </label>
              <input
                type="datetime-local"
                value={manualAt}
                onChange={(e) => setManualAt(e.target.value)}
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="submit" style={{ width: "100%", padding: "0.5rem 1rem" }}>
                Set manual alert
              </button>
            </div>
          </form>
        </section>

        {/* Active Automations */}
        <section id="automations" style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #ddd", borderRadius: "0.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>
            Active Automations
            {activeTasks.length ? ` - ${activeTasks.length} active` : ""}
          </h3>

          {state.tasks.length || state.manualAlerts.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {state.tasks.map((task) => (
                <div key={task.id} style={{ padding: "1rem", border: "1px solid #eee", borderRadius: "0.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: "bold" }}>{task.customerName}</div>
                      <div style={{ fontSize: "0.875rem" }}>{task.workGoal}</div>
                    </div>
                    <div style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", background: task.status === "complete" ? "#d0d0d0" : "#fff3cd", borderRadius: "0.25rem" }}>
                      {task.status === "complete" ? "Done" : task.priority}
                    </div>
                  </div>

                  <div style={{ fontSize: "0.875rem", opacity: 0.7, marginBottom: "0.5rem" }}>
                    {createAlertMessage(task, state.memories, tone)}
                  </div>

                  <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.5rem" }}>
                    <div>Deadline: {formatDate(task.deadline)}</div>
                    <div>Daily: {task.dailyTime}</div>
                    <div>{remainingText(task.deadline)}</div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => editTask(task)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                      Edit
                    </button>
                    <button onClick={() => completeTask(task.id)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                      Complete
                    </button>
                    <button onClick={() => deleteTask(task.id)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {state.manualAlerts.map((alert) => (
                <div key={alert.id} style={{ padding: "1rem", border: "1px solid #eee", borderRadius: "0.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: "bold" }}>Manual alert</div>
                      <div style={{ fontSize: "0.875rem" }}>{alert.message}</div>
                    </div>
                    <div style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", background: alert.fired ? "#d0d0d0" : "#cfe2ff", borderRadius: "0.25rem" }}>
                      {alert.fired ? "Sent" : "Armed"}
                    </div>
                  </div>

                  <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.5rem" }}>
                    {formatDate(alert.alertAt)}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => deleteManualAlert(alert.id)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "0.875rem", opacity: 0.6 }}>
              Create a customer work automation to start the pulse.
            </div>
          )}
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            padding: "1rem",
            background: "#333",
            color: "white",
            borderRadius: "0.5rem",
            zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
