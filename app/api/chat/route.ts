        import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// ---------------------------
// MODELS PRIORITY (UNCHANGED)
// ---------------------------
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

// ---------------------------
// KB HARD CAPPING FUNCTION
// ---------------------------
function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[TRUNCATED — SYSTEM SAFETY LIMIT]"
    : text;
}

// ---------------------------
// MEMORY STORAGE
// ---------------------------
const sessionMemory: Record<string, string[]> = {};

// ---------------------------
// CORS (FOR FRAMER / UI)
// ---------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-internal-token",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// ---------------------------
// POST ROUTE
// ---------------------------
export async function POST(req: Request) {
  try {
    // ---------------------------
    // AUTH GATE (CRITICAL)
    // ---------------------------
    const internalToken = req.headers.get("x-internal-token");
    if (internalToken !== process.env.INTERNAL_API_TOKEN) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const { message, sessionId } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID required for memory" },
        { status: 400, headers: corsHeaders }
      );
    }

    // ---------------------------
    // GEMINI KEY (RENAMED)
    // ---------------------------
    const apiKey = process.env.GEN_AI_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEN_AI_KEY missing" },
        { status: 500, headers: corsHeaders }
      );
    }

    // ---------------------------
    // LOAD KB FILES
    // ---------------------------
    const kbDir = path.join(process.cwd(), "data/kb");

    const [section1, section2, section3, section4, section5] =
      await Promise.all([
        readFile(path.join(kbDir, "section.1.md"), "utf-8"),
        readFile(path.join(kbDir, "section.2.md"), "utf-8"),
        readFile(path.join(kbDir, "section.3.md"), "utf-8"),
        readFile(path.join(kbDir, "section.4.md"), "utf-8"),
        readFile(path.join(kbDir, "section.5.md"), "utf-8"),
      ]);

    const SYSTEM_KB = `
You are a calm, frank, and supportive AI. Imagine talking to a knowledgeable friend.

Style rules:
- Start responses with friendly acknowledgment.
- Explain clearly in short, human-like paragraphs.
- Keep it natural and approachable.
- Never mention internal systems or mechanics.

[SECTION 1]
${limitText(section1, 3000)}

[SECTION 2]
${limitText(section2, 2000)}

[SECTION 3]
${limitText(section3, 1500)}

[SECTION 4]
${limitText(section4, 1500)}

[SECTION 5]
${limitText(section5, 3000)}
`;

    // ---------------------------
    // MEMORY
    // ---------------------------
    const pastMessages = sessionMemory[sessionId] || [];
    const memoryText = pastMessages.length
      ? "\n\nPREVIOUS CONVERSATION:\n" + pastMessages.join("\n")
      : "";

    const finalPrompt = `${SYSTEM_KB}\n\nUser message:\n${message}${memoryText}`;

    let reply: string | null = null;

    // ---------------------------
    // GEMINI FALLBACK LOOP (UNCHANGED)
    // ---------------------------
    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 450,
              },
            }),
          }
        );

        const data = await response.json();
        if (!response.ok) continue;

        reply =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            ?.join("") || null;

        if (reply) break;
      } catch {
        continue;
      }
    }

    // ---------------------------
    // MEMORY UPDATE
    // ---------------------------
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    sessionMemory[sessionId].push(`User: ${message}`);
    if (reply) sessionMemory[sessionId].push(`AI: ${reply}`);

    if (!reply) {
      reply =
        "Hey — I’m here. Could you tell me a bit more about what you’re trying to achieve?";
    }

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
