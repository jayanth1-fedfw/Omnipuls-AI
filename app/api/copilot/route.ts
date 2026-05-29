import { NextRequest, NextResponse } from "next/server";
import { generateCopilotSuggestion } from "@/lib/copilot";
import { getState } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body.message !== "string" || !body.message.trim()) {
      throw new Error("A message is required.");
    }

    const state = await getState();
    return NextResponse.json(await generateCopilotSuggestion(body.message.trim(), state));
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
