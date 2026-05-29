import { NextRequest, NextResponse } from "next/server";
import { addManualAlert, deleteManualAlert, markManualAlertFired } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body.message !== "string" || !body.message.trim()) {
      throw new Error("Alert message is required.");
    }

    if (typeof body.alertAt !== "string" || Number.isNaN(new Date(body.alertAt).getTime())) {
      throw new Error("A valid alert date and time is required.");
    }

    return NextResponse.json(
      await addManualAlert({
        message: body.message.trim(),
        alertAt: body.alertAt
      })
    );
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body.id !== "string") {
      throw new Error("Manual alert id is required.");
    }

    await markManualAlertFired(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      throw new Error("Manual alert id is required.");
    }

    await deleteManualAlert(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}
