import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

// ---------------------------
// UPSTASH REDIS INIT
// ---------------------------
const redis = Redis.fromEnv(); 

// 1. ADDITION: CORS HEADERS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allows Framer to talk to this API
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
};

// 2. ADDITION: OPTIONS HANDLER (The "Handshake")
// This resolves the "Connection Interrupted" by telling the browser it's safe to send data.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// ---------------------------
// MODEL PRIORITY (UNCHANGED)
// ---------------------------
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[Context trimmed for safety]"
    : text;
}

const sessionMemory: Record<string, string[]> = {};

function parseCalendlyIntent(message: string) {
  const email = message.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0];
  const time = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)?.[0];
  if (!email || !time) return null;
  return { email, time };
}

// ---------------------------
// POST HANDLER
// ---------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, sessionId } = body;

    // ADDED corsHeaders to these error returns
    if (!message || !sessionId) {
      return NextResponse.json({
        reply: "I didn’t fully receive that. Could you rephrase or send your message again?",
      }, { headers: corsHeaders });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({
        reply: "I'm temporarily unavailable due to a configuration issue. Please try again shortly.",
      }, { headers: corsHeaders });
    }

    // ---------------------------
    // LOAD KNOWLEDGE BASE (UNCHANGED)
    // ---------------------------
    const kbDir = path.join(process.cwd(), "data/kb");
    const [s1, s2, s3, s4, s5] = await Promise.all([
      readFile(path.join(kbDir, "section.1.md"), "utf-8"),
      readFile(path.join(kbDir, "section.2.md"), "utf-8"),
      readFile(path.join(kbDir, "section.3.md"), "utf-8"),
      readFile(path.join(kbDir, "section.4.md"), "utf-8"),
      readFile(path.join(kbDir, "section.5.md"), "utf-8"),
    ]);

    const SYSTEM_PROMPT = `
You are a calm, competent, and grounded AI assistant.
You speak like a knowledgeable human, not a bot.

Rules:
- Clear, short paragraphs
- No emojis
- No hype language
- No technical explanations unless asked
- Guide the user forward naturally
- Never mention internal systems or APIs

[CORE CONTEXT]
${limitText(s1, 3000)}

[INTERPRETATION]
${limitText(s2, 2000)}

[COGNITIVE STEERING]
${limitText(s3, 1500)}

[ADAPTIVE RULES]
${limitText(s4, 1500)}

[TRUTH ANCHOR]
${limitText(s5, 3000)}
`;

    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-6).join("\n");

    const finalPrompt = `
${SYSTEM_PROMPT}

Conversation so far:
${history}

User:
${message}
`;

    let reply: string | null = null;

    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey,
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

        reply = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text)?.join("") || null;
        if (reply) break;
      } catch {
        continue;
      }
    }

    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      await redis.set(`lead:${sessionId}`, {
        email: bookingIntent.email,
        preferredTime: bookingIntent.time,
        createdAt: new Date().toISOString(),
      });
      reply += "\n\nI’ve noted your email and preferred time. I’ll confirm availability and follow up shortly.";
      sessionMemory[sessionId].push(`Lead saved: ${bookingIntent.email} at ${bookingIntent.time}`);
    }

    sessionMemory[sessionId].push(`User: ${message}`);
    if (reply) sessionMemory[sessionId].push(`AI: ${reply}`);

    if (!reply) {
      reply = "I’m here and listening. Could you tell me a bit more about what you’re looking to achieve?";
    }

    // 3. FINAL RETURN WITH CORS HEADERS
    return NextResponse.json({ reply }, { headers: corsHeaders });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return NextResponse.json({
      reply: "Something unexpected happened on my side. Please try again in a moment.",
    }, { headers: corsHeaders });
  }
}
