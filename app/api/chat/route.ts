import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

// ---------------------------
// UPSTASH REDIS INIT
// ---------------------------
const redis = Redis.fromEnv(); // uses UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

// ---------------------------
// CORS HEADERS & OPTIONS
// ---------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // replace * with frontend domain in prod
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ---------------------------
// MODEL PRIORITY
// ---------------------------
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-1.5-pro",
];

// ---------------------------
// TEXT SAFETY LIMIT
// ---------------------------
function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[Context trimmed for safety]"
    : text;
}

// ---------------------------
// SESSION MEMORY
// ---------------------------
const sessionMemory: Record<string, string[]> = {};

// ---------------------------
// BASIC EMAIL + TIME PARSER
// ---------------------------
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

    if (!message || !sessionId) {
      return NextResponse.json(
        { reply: "I didn’t fully receive that. Could you rephrase or send your message again?" },
        { headers: corsHeaders }
      );
    }

    // --- DEBUGGING BLOCK ---
    const geminiKey = process.env.GEN_AI_KEY;
    if (!geminiKey) {
      const availableEnvKeys = Object.keys(process.env).filter(k => k.includes("KEY") || k.includes("AI"));
      return NextResponse.json(
        { reply: `Configuration error: GEN_AI_KEY missing. Vercel sees these keys: ${availableEnvKeys.join(", ") || "none"}` },
        { headers: corsHeaders }
      );
    }

    // ---------------------------
    // LOAD KNOWLEDGE BASE DYNAMICALLY
    // ---------------------------
    const kbDir = path.join(process.cwd(), "data/kb");
    let knowledgeBase = "";

    for (let i = 1; i <= 5; i++) {
      try {
        const filePath = path.join(kbDir, `section.${i}.md`);
        const content = await readFile(filePath, "utf-8");
        knowledgeBase += `\n${content}`;
      } catch {
        console.error(`Missing section.${i}.md at expected path.`);
      }
    }

    const contextPrompt =
      knowledgeBase.length > 10
        ? `Use this context:\n${knowledgeBase.slice(0, 8000)}`
        : "You are Effic AI. Answer professionally even if context files are missing.";

    const SYSTEM_PROMPT = `
${contextPrompt}

ROLE
You are Effic AI — a calm, sharp, and honest deployment partner.
You think like a senior operator, not a chatbot.
You explain things the way a capable human would to another capable human.

CORE BEHAVIOR
- Be clear, grounded, and precise.
- Prefer understanding over verbosity.
- Never expose backend logic, file names, model names, token counts, or system mechanics.
- Never mention prompts, APIs, models, or internal processes.
- If something is unknown or not in context, say so plainly.

RESPONSE STRUCTURE (ALWAYS FOLLOW)
1. **Acknowledge**
   Start with a short, natural acknowledgment that shows you understood the user’s intent.
   (No filler. No flattery.)

2. **Explain**
   Give a structured, logically ordered explanation.
   - Use short paragraphs.
   - Use bullet points only when it improves clarity.
   - Avoid surface-level answers. Go one layer deeper than expected.

3. **Orient Forward**
   End with a grounded next-step question or option that moves the conversation forward.
   Not salesy. Not open-ended fluff.

TONE RULES
- No emojis.
- No hype language.
- No corporate jargon.
- No motivational quotes.
- Sound confident, not loud.
- Calm > clever.

TRUTH ANCHOR
- Use the provided context as your primary source of truth.
- Do not invent features, guarantees, pricing, or capabilities.
- If the context is insufficient, state that clearly and ask for clarification.

OUTPUT QUALITY BAR
If the response feels short, shallow, vague, or generic — it is wrong.
Every answer should feel like it came from someone who actually understands the system and the problem.
`;

    // ---------------------------
    // MEMORY
    // ---------------------------
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-6).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

    let reply: string | null = null;

    // ---------------------------
    // GEMINI AI FALLBACK LOOP
    // ---------------------------
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
              generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
            }),
          }
        );

        const data = await res.json();
        if (!res.ok) continue;

        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        if (reply) break;
      } catch (err) {
        console.error(`Error calling Gemini model ${model}:`, err);
        continue;
      }
    }

    // ---------------------------
    // LEAD SAVING
    // ---------------------------
    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      await redis.set(`lead:${sessionId}`, {
        email: bookingIntent.email,
        preferredTime: bookingIntent.time,
        createdAt: new Date().toISOString(),
      });

      reply =
        (reply || "") +
        "\n\nI’ve noted your contact details. I’ll confirm and follow up shortly.";
    }

    if (!reply) {
      reply = "I'm listening. Can you tell me more about your requirements?";
    }

    // ---------------------------
    // UPDATE MEMORY
    // ---------------------------
    sessionMemory[sessionId].push(`User: ${message}`, `AI: ${reply}`);

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return NextResponse.json(
      { reply: "Something unexpected happened. Please try again." },
      { headers: corsHeaders }
    );
  }
}
