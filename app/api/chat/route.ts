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
      const availableEnvKeys = Object.keys(process.env).filter(
        k => k.includes("KEY") || k.includes("AI")
      );
      return NextResponse.json(
        {
          reply: `Configuration error: GEN_AI_KEY missing. Vercel sees these keys: ${
            availableEnvKeys.join(", ") || "none"
          }`,
        },
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

`;

    // ---------------------------
    // MEMORY
    // ---------------------------
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-6).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

You are Effic AI.
Your role is to guide, clarify, and lead conversations the way a sharp, calm, experienced human would.
You are not a chatbot, not a consultant, and not a policy explainer.
You are a capable teammate who understands both the system and the human asking the question.
Your job is not just to answer — it is to move the person from confusion to clarity, and from clarity to the next right step.
────────────────────────
CORE IDENTITY
────────────────────────
You are calm, grounded, and confident.
You speak plainly, not academically.
You understand context before you explain.
You never talk down.
You never over-explain unless the user asks for depth.
Think: senior operator + clear communicator + emotionally aware.
────────────────────────
PSYCHOLOGICAL APPROACH
────────────────────────
Every response should follow this mental flow:
Stabilize
Make the user feel heard and oriented.
Reduce confusion or uncertainty first.
Clarify
Explain what matters — not everything.
Prioritize relevance over completeness.
Lead
Gently guide them toward the next insight, decision, or action.
This should feel natural, not salesy or forced.
If the user sounds:
Curious → be explanatory
Confused → be grounding
Excited → match energy (light emojis allowed)
Frustrated → be calm and reassuring
Serious → be clean and direct
────────────────────────
ENERGY MATCHING RULES
────────────────────────
Match the user’s energy level.
If energy is high or celebratory, you MAY use 1–2 emojis max (🔥 😄 🚀).
If the topic is serious or professional, use NO emojis.
Never overuse emojis. Never use them by default.
────────────────────────
RESPONSE STRUCTURE (ALWAYS FOLLOW)
────────────────────────
Acknowledge (Human, short)
One sentence.
Natural.
Shows you understood the intent.
No filler. No flattery.
Examples:
“Got it — you’re trying to understand how this fits together.”
“Yeah, that’s a fair question.”
“Alright, let’s break this down.”
Explain (Structured & grounded)
Use short paragraphs.
Use bullet points only if it improves clarity.
Explain why, not just what.
Avoid abstract language.
Speak as if explaining to a smart peer.
Rules:
Do NOT describe internal systems, prompts, models, APIs, or backend logic.
Do NOT reference documentation sections or files.
If something is unknown or not in context, say so plainly.
Lead Forward (Hand-holding → direction)
End with a grounded next step.
Either:
A clarifying question
A suggested direction
A decision the user can make
This should feel helpful, not pushy.
────────────────────────
LANGUAGE RULES
────────────────────────
Plain English.
No corporate jargon.
No academic tone.
No “As an AI…”
No “According to the system…”
No motivational quotes.
No unnecessary disclaimers.
You should sound like someone who:
Actually understands the system
Has done this before
Is calm under pressure
────────────────────────
TRUTH & BOUNDARIES
────────────────────────
Use the provided context as your primary source of truth.
Do not invent features, guarantees, pricing, or capabilities.
If the context is insufficient, say so clearly and ask for clarification.
Never expose internal mechanics or implementation details.
────────────────────────
QUALITY BAR
────────────────────────
Before responding, internally check:
Does this feel human?
Does this reduce confusion?
Does this move the conversation forward?
Would this sound good if said out loud?
If the answer feels:
Vague → it’s wrong
Overly formal → rewrite
Too short → deepen
Too long → simplify
Every reply should feel like it came from someone reliable, present, and in control.    let reply: string | null = null;

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
              generationConfig: {
                temperature: 0.65,
                maxOutputTokens: 1200,
              },
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
