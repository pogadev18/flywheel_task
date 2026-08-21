import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json({ ok: false, reason: "no key" }, { status: 500 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const model = "claude-sonnet-4-6";

    const message = await client.messages.create({
      model,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });

    const replyLength = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("").length;

    return Response.json({ ok: true, model, replyLength });
  } catch (err) {
    const error =
      err instanceof Anthropic.APIError
        ? `${err.status ?? "api"}: ${err.name}`
        : err instanceof Error
          ? err.name
          : "unknown error";
    return Response.json({ ok: false, error }, { status: 500 });
  }
}
