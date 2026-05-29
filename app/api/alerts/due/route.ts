import { NextResponse } from "next/server";
import { createAlertMessage } from "@/lib/alerts";
import { getDueAlerts } from "@/lib/db";

export async function GET() {
  try {
    const due = await getDueAlerts();
    const taskAlerts = due.tasks.map((task) => ({
      id: task.id,
      type: "daily",
      title: "Omnipuls daily alert",
      message: createAlertMessage(task, due.memories, "creative")
    }));
    const manualAlerts = due.manualAlerts.map((alert) => ({
      id: alert.id,
      type: "manual",
      title: "Omnipuls manual alert",
      message: alert.message
    }));

    return NextResponse.json({
      todayKey: due.todayKey,
      alerts: [...taskAlerts, ...manualAlerts]
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
