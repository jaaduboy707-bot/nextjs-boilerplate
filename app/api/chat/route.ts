        
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// ---------------------------
// MODEL PRIORITY
// ---------------------------
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

// ---------------------------
// TEXT SAFETY LIMIT
// ---------------------------
function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[TRUNCATED FOR SAFETY]"
    : text;
}

// ---------------------------
// MEMORY (TEMP – IN-MEMORY)
// ---------------------------
const sessionMemory: Record<string, string[]> = {};

// ---------------------------
// CORS (FOR FRAMER / BROWSER)
// ---------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ---------------------------
// POST HANDLER
// ---------------------------
export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    if (!message || !sessionId) {
      return NextResponse.json(
        { reply: "Message and sessionId are required." },
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = process.env.GEN_AI_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: "GEN_AI_KEY missing in environment variables." },
        { status: 500, headers: corsHeaders }
      );
    }

    // ---------------------------
    // LOAD KB FILES
    // ---------------------------
    const kbDir = path.join(process.cwd(), "data", "kb");

    const [s1, s2, s3, s4, s5] = await Promise.all([
      readFile(path.join(kbDir, "section.1.md"), "utf-8"),
      readFile(path.join(kbDir, "section.2.md"), "utf-8"),
      readFile(path.join(kbDir, "section.3.md"), "utf-8"),
      readFile(path.join(kbDir, "section.4.md"), "utf-8"),
      readFile(path.join(kbDir, "section.5.md"), "utf-8"),
    ]);

    const SYSTEM_PROMPT = `
You are a calm, competent, grounded AI assistant.

[CORE]
${limitText(s1, 3000)}

[INTERPRETATION]
${limitText(s2, 2000)}

[STEERING]
${limitText(s3, 1500)}

[ADAPTIVE]
${limitText(s4, 1500)}

[TRUTH]
${limitText(s5, 3000)}
`;

    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-6).join("\n");

    const finalPrompt = `${SYSTEM_PROMPT}\n\nConversation:\n${history}\n\nUser: ${message}`;

    let reply: string | null = null;

    for (const model of MODELS) {
      try {
        const res = await fetch(
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
                maxOutputTokens: 500,
              },
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) continue;

        reply =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            ?.join("") || null;

        if (reply) break;
      } catch {
        continue;
      }
    }

    sessionMemory[sessionId].push(`User: ${message}`);
    if (reply) sessionMemory[sessionId].push(`AI: ${reply}`);

    if (!reply) {
      reply =
        "I'm here. Could you tell me a bit more about what you're trying to do?";
    }

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return NextResponse.json(
      { reply: "Server error. Try again shortly." },
      { status: 500, headers: corsHeaders }
    );
  }
}
