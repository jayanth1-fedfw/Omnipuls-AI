/**
 * Arithmetic & Logical Operations AI Handler
 * Performs calculations, logic operations, and triggers alerts
 */

export type ArithmeticOperation = "add" | "subtract" | "multiply" | "divide" | "modulo" | "power";
export type LogicalOperation = "and" | "or" | "not" | "xor" | "comparison";

export interface ArithmeticRequest {
  operation: ArithmeticOperation;
  operands: number[];
  description?: string;
}

export interface LogicalRequest {
  operation: LogicalOperation;
  operands: (number | boolean)[];
  description?: string;
}

export interface CalculationResult {
  result: number | boolean;
  expression: string;
  description: string;
  alert: boolean;
  alertMessage?: string;
  timestamp: string;
}

function performArithmetic(op: ArithmeticOperation, operands: number[]): number | null {
  if (operands.length < 2) return null;

  switch (op) {
    case "add":
      return operands.reduce((a, b) => a + b, 0);
    case "subtract":
      return operands.reduce((a, b) => a - b);
    case "multiply":
      return operands.reduce((a, b) => a * b, 1);
    case "divide":
      if (operands.some((n) => n === 0)) return null;
      return operands.reduce((a, b) => a / b);
    case "modulo":
      if (operands.length !== 2 || operands[1] === 0) return null;
      return operands[0] % operands[1];
    case "power":
      if (operands.length !== 2) return null;
      return Math.pow(operands[0], operands[1]);
    default:
      return null;
  }
}

function performLogical(
  op: LogicalOperation,
  operands: (number | boolean)[]
): boolean | null {
  const boolOperands = operands.map((o) => (typeof o === "boolean" ? o : o !== 0));

  switch (op) {
    case "and":
      return boolOperands.every((b) => b);
    case "or":
      return boolOperands.some((b) => b);
    case "not":
      return !boolOperands[0];
    case "xor":
      if (boolOperands.length !== 2) return null;
      return boolOperands[0] !== boolOperands[1];
    case "comparison":
      if (operands.length !== 2 || typeof operands[0] === "boolean" || typeof operands[1] === "boolean") return null;
      return operands[0] > operands[1];
    default:
      return null;
  }
}

function buildExpression(op: string, operands: (number | boolean)[]): string {
  const opSymbols: Record<string, string> = {
    add: "+",
    subtract: "-",
    multiply: "*",
    divide: "/",
    modulo: "%",
    power: "^",
    and: "&&",
    or: "||",
    not: "!",
    xor: "XOR",
    comparison: ">"
  };

  const symbol = opSymbols[op] || op;
  if (op === "not") return `${symbol}${operands[0]}`;
  return operands.join(` ${symbol} `);
}

function generateAlertTrigger(result: number | boolean, operation: string): { alert: boolean; message: string } {
  const numResult = typeof result === "boolean" ? (result ? 1 : 0) : result;

  // Alert on critical thresholds
  if (numResult > 1000000) {
    return { alert: true, message: `⚠️ ALERT: Result is very large (${numResult})` };
  }
  if (numResult < -1000000) {
    return { alert: true, message: `⚠️ ALERT: Result is very negative (${numResult})` };
  }
  if (typeof result === "boolean" && !result && operation.includes("critical")) {
    return { alert: true, message: `🔔 ALERT: Critical condition failed` };
  }
  if (Number.isNaN(numResult)) {
    return { alert: true, message: `❌ ALERT: Invalid calculation result` };
  }

  return { alert: false, message: "" };
}

export async function calculateArithmetic(req: ArithmeticRequest): Promise<CalculationResult> {
  const result = performArithmetic(req.operation, req.operands);
  if (result === null) {
    throw new Error("Invalid arithmetic operation");
  }

  const expression = buildExpression(req.operation, req.operands);
  const { alert, message } = generateAlertTrigger(result, req.operation);

  return {
    result,
    expression,
    description: req.description || `Performed ${req.operation} on ${req.operands.length} operands`,
    alert,
    alertMessage: message || undefined,
    timestamp: new Date().toISOString()
  };
}

export async function calculateLogical(req: LogicalRequest): Promise<CalculationResult> {
  const result = performLogical(req.operation, req.operands);
  if (result === null) {
    throw new Error("Invalid logical operation");
  }

  const expression = buildExpression(req.operation, req.operands);
  const { alert, message } = generateAlertTrigger(result, req.operation);

  return {
    result,
    expression,
    description: req.description || `Performed ${req.operation} logic operation`,
    alert,
    alertMessage: message || undefined,
    timestamp: new Date().toISOString()
  };
}

export function parseExpression(input: string): {
  operation: ArithmeticOperation | LogicalOperation;
  operands: (number | boolean)[];
} | null {
  // Handle simple expressions: "5 + 3", "true && false", etc.
  const arithmeticMatch = input.match(/(\d+(?:\.\d+)?)\s*([\+\-\*/%^])\s*(\d+(?:\.\d+)?)/);
  if (arithmeticMatch) {
    const operands = [parseFloat(arithmeticMatch[1]), parseFloat(arithmeticMatch[3])];
    const opMap: Record<string, ArithmeticOperation> = {
      "+": "add",
      "-": "subtract",
      "*": "multiply",
      "/": "divide",
      "%": "modulo",
      "^": "power"
    };
    return { operation: opMap[arithmeticMatch[2]], operands };
  }

  const logicalMatch = input.match(/(true|false)\s*(&&|\|\||xor)\s*(true|false)/i);
  if (logicalMatch) {
    const operands = [
      logicalMatch[1].toLowerCase() === "true",
      logicalMatch[3].toLowerCase() === "true"
    ];
    const opMap: Record<string, LogicalOperation> = {
      "&&": "and",
      "||": "or",
      xor: "xor"
    };
    return { operation: opMap[logicalMatch[2].toLowerCase()], operands };
  }

  return null;
}
