import { NextResponse } from "next/server";
import { getState } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(await getState());
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
