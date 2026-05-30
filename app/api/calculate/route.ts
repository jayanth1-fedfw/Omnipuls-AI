import { NextRequest, NextResponse } from "next/server";
import { calculateArithmetic, calculateLogical, parseExpression } from "@/lib/arithmetic";
import type { ArithmeticRequest, LogicalRequest } from "@/lib/arithmetic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.type === "arithmetic") {
      const req = body as ArithmeticRequest;
      if (!req.operation || !Array.isArray(req.operands) || req.operands.length < 2) {
        throw new Error("Invalid arithmetic request");
      }
      const result = await calculateArithmetic(req);
      return NextResponse.json(result);
    } else if (body.type === "logical") {
      const req = body as LogicalRequest;
      if (!req.operation || !Array.isArray(req.operands)) {
        throw new Error("Invalid logical request");
      }
      const result = await calculateLogical(req);
      return NextResponse.json(result);
    } else if (body.expression) {
      // Parse natural expression like "5 + 3" or "true && false"
      const parsed = parseExpression(body.expression);
      if (!parsed) {
        throw new Error("Could not parse expression");
      }

      const isLogical = typeof parsed.operands[0] === "boolean";
      if (isLogical) {
        const result = await calculateLogical({
          operation: parsed.operation as any,
          operands: parsed.operands as any,
          description: body.description || body.expression
        });
        return NextResponse.json(result);
      } else {
        const result = await calculateArithmetic({
          operation: parsed.operation as any,
          operands: parsed.operands as number[],
          description: body.description || body.expression
        });
        return NextResponse.json(result);
      }
    } else {
      throw new Error("Missing type or expression");
    }
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown calculation error";
}
