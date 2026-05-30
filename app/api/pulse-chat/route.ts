import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: Request) {
  try {
    const { system, messages } = await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "API key not configured" }, { status: 500 });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system,
      messages,
    });

    return Response.json(response);
  } catch (error) {
    console.error("Pulse Chat Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
