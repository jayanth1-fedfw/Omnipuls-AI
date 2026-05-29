import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { ManualAlert, ManualAlertInput, Memory, OmnipulsState, Task, TaskInput } from "@/lib/types";

type SqlRow = Record<string, unknown>;

const dataPath = process.env.VERCEL ? path.join("/tmp", "omnipuls.json") : path.join(process.cwd(), ".data", "omnipuls.json");
const initialState: OmnipulsState = {
  tasks: [],
  memories: [],
  manualAlerts: []
};

function hasPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(process.env.DATABASE_URL);
}

async function readLocalState(): Promise<OmnipulsState> {
  try {
    const raw = await readFile(dataPath, "utf8");
    return { ...initialState, ...JSON.parse(raw) };
  } catch {
    await writeLocalState(initialState);
    return initialState;
  }
}

async function writeLocalState(state: OmnipulsState) {
  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(state, null, 2));
}

function toTask(row: SqlRow): Task {
  return {
    id: String(row.id),
    customerName: String(row.customer_name),
    workGoal: String(row.work_goal),
    sourceMemory: String(row.source_memory ?? ""),
    deadline: new Date(String(row.deadline)).toISOString(),
    dailyTime: String(row.daily_time),
    priority: row.priority as Task["priority"],
    status: row.status as Task["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function toMemory(row: SqlRow): Memory {
  return {
    id: String(row.id),
    text: String(row.text),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function toManualAlert(row: SqlRow): ManualAlert {
  return {
    id: String(row.id),
    message: String(row.message),
    alertAt: new Date(String(row.alert_at)).toISOString(),
    fired: Boolean(row.fired),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

export async function initializeDatabase() {
  if (!hasPostgres()) {
    await readLocalState();
    return { provider: "local-json" };
  }

  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      work_goal TEXT NOT NULL,
      source_memory TEXT NOT NULL DEFAULT '',
      deadline TIMESTAMPTZ NOT NULL,
      daily_time TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS manual_alerts (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      alert_at TIMESTAMPTZ NOT NULL,
      fired BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fired_alerts (
      key TEXT PRIMARY KEY,
      fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  return { provider: "postgres" };
}

export async function getState(): Promise<OmnipulsState> {
  await initializeDatabase();

  if (!hasPostgres()) {
    return readLocalState();
  }

  const sql = getSql();
  const [tasks, memories, manualAlerts] = await Promise.all([
    sql`SELECT * FROM tasks ORDER BY created_at DESC`,
    sql`SELECT * FROM memories ORDER BY created_at DESC`,
    sql`SELECT * FROM manual_alerts ORDER BY created_at DESC`
  ]);

  return {
    tasks: tasks.map(toTask),
    memories: memories.map(toMemory),
    manualAlerts: manualAlerts.map(toManualAlert)
  };
}

export async function upsertTask(input: TaskInput, id = crypto.randomUUID()) {
  await initializeDatabase();
  const now = new Date().toISOString();
  const task: Task = {
    id,
    ...input,
    createdAt: now,
    updatedAt: now
  };

  if (!hasPostgres()) {
    const state = await readLocalState();
    const existing = state.tasks.find((item) => item.id === id);
    const nextTask = existing ? { ...existing, ...input, updatedAt: now } : task;
    state.tasks = existing ? state.tasks.map((item) => (item.id === id ? nextTask : item)) : [nextTask, ...state.tasks];

    if (input.sourceMemory) {
      state.memories = [
        {
          id: crypto.randomUUID(),
          text: `${input.customerName}: ${input.sourceMemory}`,
          createdAt: now
        },
        ...state.memories
      ];
    }

    await writeLocalState(state);
    return nextTask;
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO tasks (
      id,
      customer_name,
      work_goal,
      source_memory,
      deadline,
      daily_time,
      priority,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${id},
      ${input.customerName},
      ${input.workGoal},
      ${input.sourceMemory},
      ${input.deadline},
      ${input.dailyTime},
      ${input.priority},
      ${input.status},
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      work_goal = EXCLUDED.work_goal,
      source_memory = EXCLUDED.source_memory,
      deadline = EXCLUDED.deadline,
      daily_time = EXCLUDED.daily_time,
      priority = EXCLUDED.priority,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING *
  `;

  if (input.sourceMemory) {
    await addMemory(`${input.customerName}: ${input.sourceMemory}`);
  }

  return toTask(rows[0]);
}

export async function updateTaskStatus(id: string, status: Task["status"]) {
  await initializeDatabase();
  const now = new Date().toISOString();

  if (!hasPostgres()) {
    const state = await readLocalState();
    state.tasks = state.tasks.map((task) => (task.id === id ? { ...task, status, updatedAt: now } : task));
    await writeLocalState(state);
    return;
  }

  const sql = getSql();
  await sql`UPDATE tasks SET status = ${status}, updated_at = NOW() WHERE id = ${id}`;
}

export async function deleteTask(id: string) {
  await initializeDatabase();

  if (!hasPostgres()) {
    const state = await readLocalState();
    state.tasks = state.tasks.filter((task) => task.id !== id);
    await writeLocalState(state);
    return;
  }

  const sql = getSql();
  await sql`DELETE FROM tasks WHERE id = ${id}`;
}

export async function addMemory(text: string) {
  await initializeDatabase();
  const memory: Memory = {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString()
  };

  if (!hasPostgres()) {
    const state = await readLocalState();
    state.memories = [memory, ...state.memories];
    await writeLocalState(state);
    return memory;
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO memories (id, text)
    VALUES (${memory.id}, ${text})
    RETURNING *
  `;
  return toMemory(rows[0]);
}

export async function addManualAlert(input: ManualAlertInput) {
  await initializeDatabase();
  const alert: ManualAlert = {
    id: crypto.randomUUID(),
    message: input.message,
    alertAt: input.alertAt,
    fired: false,
    createdAt: new Date().toISOString()
  };

  if (!hasPostgres()) {
    const state = await readLocalState();
    state.manualAlerts = [alert, ...state.manualAlerts];
    await writeLocalState(state);
    return alert;
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO manual_alerts (id, message, alert_at)
    VALUES (${alert.id}, ${input.message}, ${input.alertAt})
    RETURNING *
  `;
  return toManualAlert(rows[0]);
}

export async function markManualAlertFired(id: string) {
  await initializeDatabase();

  if (!hasPostgres()) {
    const state = await readLocalState();
    state.manualAlerts = state.manualAlerts.map((alert) => (alert.id === id ? { ...alert, fired: true } : alert));
    await writeLocalState(state);
    return;
  }

  const sql = getSql();
  await sql`UPDATE manual_alerts SET fired = TRUE WHERE id = ${id}`;
}

export async function deleteManualAlert(id: string) {
  await initializeDatabase();

  if (!hasPostgres()) {
    const state = await readLocalState();
    state.manualAlerts = state.manualAlerts.filter((alert) => alert.id !== id);
    await writeLocalState(state);
    return;
  }

  const sql = getSql();
  await sql`DELETE FROM manual_alerts WHERE id = ${id}`;
}

export async function getDueAlerts() {
  const state = await getState();
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const dueTasks = state.tasks.filter((task) => {
    if (task.status === "complete") {
      return false;
    }

    const [hour, minute] = task.dailyTime.split(":").map(Number);
    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    return now >= scheduled && now <= new Date(task.deadline);
  });

  const dueManualAlerts = state.manualAlerts.filter((alert) => !alert.fired && now >= new Date(alert.alertAt));

  return {
    todayKey,
    tasks: dueTasks,
    manualAlerts: dueManualAlerts,
    memories: state.memories
  };
}
