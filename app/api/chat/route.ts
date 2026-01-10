import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv(); 

// --- ADDITION: CORS PERMISSIONS ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allows Framer to talk to this API
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
};

// --- ADDITION: HANDSHAKE HANDLER ---
// This stops the "Connection Interrupted" error in the browser
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

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
    ? text.slice(0, maxChars) + "\n\n[Context trimmed]"
    : text;
}

const sessionMemory: Record<string, string[]> = {};

function parseCalendlyIntent(message: string) {
  const email = message.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0];
  const time = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)?.[0];
  if (!email || !time) return null;
  return { email, time };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, sessionId } = body;

    // Return with corsHeaders
    if (!message || !sessionId) {
      return NextResponse.json({ reply: "Missing data." }, { headers: corsHeaders });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ reply: "API Key Missing." }, { headers: corsHeaders });
    }

    const kbDir = path.join(process.cwd(), "data/kb");
    const [s1, s2, s3, s4, s5] = await Promise.all([
      readFile(path.join(kbDir, "section.1.md"), "utf-8"),
      readFile(path.join(kbDir, "section.2.md"), "utf-8"),
      readFile(path.join(kbDir, "section.3.md"), "utf-8"),
      readFile(path.join(kbDir, "section.4.md"), "utf-8"),
      readFile(path.join(kbDir, "section.5.md"), "utf-8"),
    ]);

    const SYSTEM_PROMPT = `You are a calm AI assistant... [Logic Unchanged]`;

    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-6).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory: ${history}\nUser: ${message}`;

    let reply: string | null = null;

    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) continue;
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        if (reply) break;
      } catch { continue; }
    }

    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      await redis.set(`lead:${sessionId}`, { email: bookingIntent.email, time: bookingIntent.time });
      reply += "\n\nLead saved.";
    }

    sessionMemory[sessionId].push(`User: ${message}`, `AI: ${reply}`);

    // FINAL RETURN WITH THE PERMISSION HEADERS
    return NextResponse.json({ reply: reply || "Listening..." }, { headers: corsHeaders });

  } catch (err) {
    return NextResponse.json({ reply: "Server Error" }, { headers: corsHeaders });
  }
}
