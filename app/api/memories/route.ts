import { NextRequest, NextResponse } from "next/server";
import { addMemory } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body.text !== "string" || !body.text.trim()) {
      throw new Error("Memory text is required.");
    }

    return NextResponse.json(await addMemory(body.text.trim()));
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
