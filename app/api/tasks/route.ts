import { NextRequest, NextResponse } from "next/server";
import { deleteTask, updateTaskStatus, upsertTask } from "@/lib/db";
import type { Priority, TaskStatus } from "@/lib/types";

const priorities = new Set(["low", "medium", "high", "critical"]);
const statuses = new Set(["active", "complete"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateTask(body);
    const task = await upsertTask(input, typeof body.id === "string" ? body.id : undefined);
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body.id !== "string" || !statuses.has(body.status)) {
      throw new Error("A valid task id and status are required.");
    }

    await updateTaskStatus(body.id, body.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      throw new Error("Task id is required.");
    }

    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

function validateTask(body: Record<string, unknown>) {
  const customerName = readRequiredString(body.customerName, "Customer name");
  const workGoal = readRequiredString(body.workGoal, "Work goal");
  const deadline = readRequiredString(body.deadline, "Deadline");
  const dailyTime = readRequiredString(body.dailyTime, "Daily alert time");
  const sourceMemory = typeof body.sourceMemory === "string" ? body.sourceMemory.trim() : "";
  const priority = priorities.has(String(body.priority)) ? (body.priority as Priority) : "medium";
  const status = statuses.has(String(body.status)) ? (body.status as TaskStatus) : "active";

  if (Number.isNaN(new Date(deadline).getTime())) {
    throw new Error("Deadline must be a valid date.");
  }

  if (!/^\d{2}:\d{2}$/.test(dailyTime)) {
    throw new Error("Daily alert time must use HH:MM.");
  }

  return {
    customerName,
    workGoal,
    sourceMemory,
    deadline,
    dailyTime,
    priority,
    status
  };
}

function readRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
