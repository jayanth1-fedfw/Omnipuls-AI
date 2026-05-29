"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createAlertMessage, remainingText } from "@/lib/alerts";
import type { AlertTone, CopilotSuggestion, OmnipulsState, Task } from "@/lib/types";

type Props = {
  initialState: OmnipulsState;
};

type AccessMode = "comfortable" | "focus" | "large";

const blankTask = {
  customerName: "",
  workGoal: "",
  sourceMemory: "",
  deadline: "",
  dailyTime: "09:00",
  priority: "medium",
  status: "active"
};

export default function OmnipulsClient({ initialState }: Props) {
  const [state, setState] = useState(initialState);
  const [taskForm, setTaskForm] = useState(blankTask);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memoryText, setMemoryText] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [manualAt, setManualAt] = useState("");
  const [tone, setTone] = useState<AlertTone>("creative");
  const [toast, setToast] = useState("");
  const [copilotMessage, setCopilotMessage] = useState("");
  const [copilotSuggestion, setCopilotSuggestion] = useState<CopilotSuggestion | null>(null);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("comfortable");
  const activeTasks = state.tasks.filter((task) => task.status !== "complete");
  const completedTasks = state.tasks.filter((task) => task.status === "complete");
  const criticalTasks = activeTasks.filter((task) => task.priority === "critical" || task.priority === "high");

  const pulseSummary = useMemo(() => {
    if (!activeTasks.length) {
      return "No active work yet.";
    }

    const soonest = [...activeTasks].sort((first, second) => {
      return new Date(first.deadline).getTime() - new Date(second.deadline).getTime();
    })[0];

    return `${soonest.customerName}: ${remainingText(soonest.deadline)} for "${soonest.workGoal}".`;
  }, [activeTasks]);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0);

    const nextManual = new Date();
    nextManual.setHours(nextManual.getHours() + 1, 0, 0, 0);

    setTaskForm((current) => ({
      ...current,
      deadline: current.deadline || toInputDateTime(tomorrow)
    }));
    setManualAt((current) => current || toInputDateTime(nextManual));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch("/api/alerts/due");
      const data = await response.json();

      if (!response.ok || !Array.isArray(data.alerts)) {
        return;
      }

      for (const alert of data.alerts) {
        const firedKey = `omnipuls-fired:${data.todayKey}:${alert.type}:${alert.id}`;

        if (window.localStorage.getItem(firedKey)) {
          continue;
        }

        window.localStorage.setItem(firedKey, "true");
        fireAlert(alert.title, alert.message);

        if (alert.type === "manual") {
          await fetch("/api/manual-alerts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: alert.id })
          });
          await refreshState();
        }
      }
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  async function refreshState() {
    const response = await fetch("/api/state");
    const data = await response.json();

    if (response.ok) {
      setState(data);
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...taskForm,
        id: editingId
      })
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

  async function addMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!memoryText.trim()) {
      return;
    }

    const response = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: memoryText })
    });

    if (response.ok) {
      setMemoryText("");
      await refreshState();
    }
  }

  async function addManualAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/manual-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: manualMessage,
        alertAt: manualAt
      })
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

  async function askCopilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!copilotMessage.trim()) {
      return;
    }

    setCopilotBusy(true);
    const response = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: copilotMessage })
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
    if (!copilotSuggestion) {
      return;
    }

    if (copilotSuggestion.memory) {
      await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: copilotSuggestion.memory })
      });
    }

    if (copilotSuggestion.task) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copilotSuggestion.task)
      });
    }

    if (copilotSuggestion.manualAlert) {
      await fetch("/api/manual-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copilotSuggestion.manualAlert)
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
      body: JSON.stringify({ id, status: "complete" })
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

  function editTask(task: Task) {
    setEditingId(task.id);
    setTaskForm({
      customerName: task.customerName,
      workGoal: task.workGoal,
      sourceMemory: task.sourceMemory,
      deadline: toInputDateTime(new Date(task.deadline)),
      dailyTime: task.dailyTime,
      priority: task.priority,
      status: task.status
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestNotifications() {
    if (!("Notification" in window)) {
      setToast("This browser does not support desktop alerts.");
      return;
    }

    Notification.requestPermission().then((permission) => {
      setToast(permission === "granted" ? "Desktop alerts enabled." : "Desktop alerts not enabled.");
    });
  }

  return (
    <main className={`shell ${accessMode}`}>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar" aria-label="Omnipuls navigation and settings">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <div>
            <h1>Omnipuls</h1>
            <p>Customer work alert AI</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Dashboard sections">
          <a href="#copilot">AI Copilot</a>
          <a href="#customer-work">Customer Work</a>
          <a href="#manual-alerts">Manual Alerts</a>
          <a href="#automations">Automations</a>
        </nav>

        <section className="panel compact">
          <div className="panel-title">
            <h2>Alert Pulse</h2>
            <button className="icon-button" title="Enable browser alerts" type="button" onClick={requestNotifications}>
              <span aria-hidden="true">!</span>
              <span className="sr-only">Enable browser alerts</span>
            </button>
          </div>
          <p className="muted">{pulseSummary}</p>
          <div className="signal">
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <h2>Daily Style</h2>
          </div>
          <label className="sr-only" htmlFor="tone">
            Daily alert writing style
          </label>
          <select id="tone" value={tone} onChange={(event) => setTone(event.target.value as AlertTone)}>
            <option value="focused">Focused</option>
            <option value="creative">Creative</option>
            <option value="urgent">Urgent</option>
            <option value="kind">Kind</option>
          </select>
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <h2>Access Mode</h2>
            <span>Inclusive</span>
          </div>
          <div className="segmented" role="group" aria-label="Accessibility display mode">
            <button className={accessMode === "comfortable" ? "selected" : ""} type="button" onClick={() => setAccessMode("comfortable")}>
              Comfort
            </button>
            <button className={accessMode === "focus" ? "selected" : ""} type="button" onClick={() => setAccessMode("focus")}>
              Focus
            </button>
            <button className={accessMode === "large" ? "selected" : ""} type="button" onClick={() => setAccessMode("large")}>
              Large
            </button>
          </div>
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <h2>Platform Health</h2>
            <span>Live</span>
          </div>
          <div className="stat-list">
            <span>{activeTasks.length} active</span>
            <span>{criticalTasks.length} high focus</span>
            <span>{completedTasks.length} complete</span>
            <span>{state.memories.length} memories</span>
          </div>
        </section>
      </aside>

      <section className="workspace" id="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Neural operations deck</p>
            <h2>Convert customer signals into intelligent work pulses</h2>
            <p className="topbar-copy">
              Command Omnipuls in natural language, preserve customer memory, and launch accessible deadline alerts that stay useful.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={loadDemo}>
            Load demo
          </button>
        </header>

        <section className="command-panel" id="copilot" aria-labelledby="copilot-heading">
          <div className="command-copy">
            <p className="eyebrow">Omnipuls AI Copilot</p>
            <h2 id="copilot-heading">Describe the signal. Omnipuls generates the next action.</h2>
            <p>
              Built for teams, founders, support agents, students, and anyone who needs a clear path from conversation to completion.
            </p>
          </div>
          <form className="copilot-command" onSubmit={askCopilot}>
            <label htmlFor="copilot-message">Ask Omnipuls</label>
            <textarea
              id="copilot-message"
              rows={5}
              placeholder="For customer Mira, remind me daily at 09:30 to finish onboarding before tomorrow. They asked about pricing and launch time."
              value={copilotMessage}
              onChange={(event) => setCopilotMessage(event.target.value)}
            />
            <div className="prompt-chips" aria-label="Prompt starters">
              {[
                "Create a daily follow-up",
                "Turn this chat into a deadline",
                "Make a kind customer nudge"
              ].map((prompt) => (
                <button key={prompt} type="button" onClick={() => setCopilotMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            <button className="primary-button" type="submit" disabled={copilotBusy}>
              {copilotBusy ? "Thinking" : "Generate action"}
            </button>
          </form>
          {copilotSuggestion ? (
            <div className="copilot-result" role="status" aria-live="polite">
              <p>{copilotSuggestion.reply}</p>
              {copilotSuggestion.task ? (
                <div className="meta-row">
                  <span>Task: {copilotSuggestion.task.workGoal}</span>
                  <span>Customer: {copilotSuggestion.task.customerName}</span>
                  <span>Daily: {copilotSuggestion.task.dailyTime}</span>
                </div>
              ) : null}
              {copilotSuggestion.manualAlert ? (
                <div className="meta-row">
                  <span>Manual: {copilotSuggestion.manualAlert.message}</span>
                </div>
              ) : null}
              <div className="actions">
                <button className="secondary-button" type="button" onClick={applyCopilotSuggestion}>
                  Apply suggestion
                </button>
                <button className="ghost-button" type="button" onClick={() => setCopilotSuggestion(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid">
          <form className="panel form-panel" id="customer-work" onSubmit={saveTask} aria-labelledby="customer-work-heading">
            <div className="panel-title">
              <h2 id="customer-work-heading">Customer Work</h2>
              <span>{editingId ? "Editing" : "New"}</span>
            </div>

            <label htmlFor="customer-name">
              Customer name
              <input
                id="customer-name"
                required
                placeholder="Aarav Sharma"
                value={taskForm.customerName}
                onChange={(event) => setTaskForm({ ...taskForm, customerName: event.target.value })}
              />
            </label>

            <label htmlFor="work-goal">
              Work goal
              <input
                id="work-goal"
                required
                placeholder="Finish proposal review"
                value={taskForm.workGoal}
                onChange={(event) => setTaskForm({ ...taskForm, workGoal: event.target.value })}
              />
            </label>

            <label htmlFor="source-memory">
              Source memory
              <textarea
                id="source-memory"
                rows={4}
                placeholder="Paste what the customer browsed, asked, or chatted with the AI bot."
                value={taskForm.sourceMemory}
                onChange={(event) => setTaskForm({ ...taskForm, sourceMemory: event.target.value })}
              />
            </label>

            <div className="two-column">
              <label htmlFor="deadline">
                Deadline
                <input
                  id="deadline"
                  required
                  type="datetime-local"
                  value={taskForm.deadline}
                  onChange={(event) => setTaskForm({ ...taskForm, deadline: event.target.value })}
                />
              </label>
              <label htmlFor="daily-time">
                Daily alert time
                <input
                  id="daily-time"
                  required
                  type="time"
                  value={taskForm.dailyTime}
                  onChange={(event) => setTaskForm({ ...taskForm, dailyTime: event.target.value })}
                />
              </label>
            </div>

            <div className="two-column">
              <label htmlFor="priority">
                Priority
                <select
                  id="priority"
                  value={taskForm.priority}
                  onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}
                >
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label htmlFor="status">
                Status
                <select id="status" value={taskForm.status} onChange={(event) => setTaskForm({ ...taskForm, status: event.target.value })}>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
                </select>
              </label>
            </div>

            <div className="actions">
              <button className="primary-button" type="submit">
                Save automation
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTaskForm(blankTask);
                }}
              >
                Clear
              </button>
            </div>
          </form>

          <section className="panel chat-panel" aria-labelledby="memory-heading">
            <div className="panel-title">
              <h2 id="memory-heading">AI Bot Memory</h2>
              <span>{state.memories.length} notes</span>
            </div>
            <div className="chat-log" aria-live="polite">
              {state.memories.length ? (
                state.memories.map((memory) => (
                  <div className="chat-note" key={memory.id}>
                    {memory.text}
                    <time>{formatDate(memory.createdAt)}</time>
                  </div>
                ))
              ) : (
                <div className="empty">Customer browsing and AI bot chat notes appear here.</div>
              )}
            </div>
            <form className="chat-input" onSubmit={addMemory}>
              <label className="sr-only" htmlFor="memory-text">
                Add customer memory
              </label>
              <input
                id="memory-text"
                placeholder="Add browsed/chatted customer context"
                value={memoryText}
                onChange={(event) => setMemoryText(event.target.value)}
              />
              <button className="icon-button" type="submit" title="Add memory">
                <span aria-hidden="true">+</span>
                <span className="sr-only">Add memory</span>
              </button>
            </form>
          </section>
        </section>

        <section className="panel" id="manual-alerts" aria-labelledby="manual-alert-heading">
          <div className="panel-title">
            <h2 id="manual-alert-heading">Manual Alert Setter</h2>
            <span>Database backed</span>
          </div>
          <form className="manual-grid" onSubmit={addManualAlert}>
            <label htmlFor="manual-message">
              Alert message
              <input
                id="manual-message"
                required
                placeholder="Call customer before close of day"
                value={manualMessage}
                onChange={(event) => setManualMessage(event.target.value)}
              />
            </label>
            <label htmlFor="manual-at">
              Alert date and time
              <input id="manual-at" required type="datetime-local" value={manualAt} onChange={(event) => setManualAt(event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              Set manual alert
            </button>
          </form>
        </section>

        <section className="panel" id="automations" aria-labelledby="automations-heading">
          <div className="panel-title">
            <h2 id="automations-heading">Active Automations</h2>
            <span>{activeTasks.length} active</span>
          </div>
          <div className="task-list">
            {state.tasks.length || state.manualAlerts.length ? (
              <>
                {state.tasks.map((task) => (
                  <article className="task-card" key={task.id}>
                    <div className="task-head">
                      <div>
                        <p className="customer">{task.customerName}</p>
                        <h3>{task.workGoal}</h3>
                      </div>
                      <span className={`badge ${task.priority}`}>{task.status === "complete" ? "Done" : task.priority}</span>
                    </div>
                    <p className="message">{createAlertMessage(task, state.memories, tone)}</p>
                    <div className="meta-row">
                      <span>Deadline: {formatDate(task.deadline)}</span>
                      <span>Daily: {task.dailyTime}</span>
                      <span>{remainingText(task.deadline)}</span>
                    </div>
                    <div className="task-actions">
                      <button className="secondary-button" type="button" onClick={() => editTask(task)}>
                        Edit
                      </button>
                      <button className="ghost-button" type="button" onClick={() => completeTask(task.id)}>
                        Complete
                      </button>
                      <button className="ghost-button" type="button" onClick={() => deleteTask(task.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {state.manualAlerts.map((alert) => (
                  <article className="task-card" key={alert.id}>
                    <div className="task-head">
                      <div>
                        <p className="customer">Manual alert</p>
                        <h3>{alert.message}</h3>
                      </div>
                      <span className={`badge ${alert.fired ? "low" : "high"}`}>{alert.fired ? "Sent" : "Armed"}</span>
                    </div>
                    <div className="meta-row">
                      <span>{formatDate(alert.alertAt)}</span>
                    </div>
                    <div className="task-actions">
                      <button className="ghost-button" type="button" onClick={() => deleteManualAlert(alert.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <div className="empty">Create a customer work automation to start the pulse.</div>
            )}
          </div>
        </section>
      </section>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </main>
  );

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
      status: "active"
    });
    setMemoryText("Customer browsed pricing, asked the AI bot about implementation time, and wanted a final checklist.");
  }
}

function fireAlert(title: string, message: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body: message });
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toInputDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
