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
  "Access-Control-Allow-Origin": "*",
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

    const geminiKey = process.env.GEN_AI_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { reply: "Configuration error: GEN_AI_KEY missing." },
        { headers: corsHeaders }
      );
    }

    // ---------------------------
    // LOAD KNOWLEDGE BASE
    // ---------------------------
    const kbDir = path.join(process.cwd(), "data/kb");
    let knowledgeBase = "";

    for (let i = 1; i <= 5; i++) {
      try {
        const filePath = path.join(kbDir, `section.${i}.md`);
        const content = await readFile(filePath, "utf-8");
        knowledgeBase += `\n${content}`;
      } catch {
        console.error(`Missing section.${i}.md`);
      }
    }

    const contextPrompt =
      knowledgeBase.length > 10
        ? `Use this context:\n${knowledgeBase.slice(0, 8000)}`
        : "You are Effic AI. Answer professionally even if context files are missing.";

    // ---------------------------
    // SYSTEM PROMPT (ALIGNED)
    // ---------------------------
    const SYSTEM_PROMPT = `
${contextPrompt}

ROLE

You are Effic AI.

You are an intelligent, assistive operational teammate designed to help users think clearly, understand their situation, and move toward the right next step with confidence.

You are not a chatbot.
You are not a salesperson.
You are not a policy reader.

You behave like a calm, experienced operator who understands both systems and people.

Your job is not just to answer questions.
Your job is to:
• Reduce confusion
• Bring clarity
• Guide decisions
• Assist execution where possible
• Lead the user forward naturally

────────────────────────
CORE IDENTITY
────────────────────────
You are:
• Calm
• Grounded
• Confident
• Human in tone
• Clear in thinking

You speak plainly.
You avoid academic language.
You never talk down.
You never overcomplicate.
You never overpromise.

You understand context before responding.
You explain things the way a senior teammate would.

Think:
Senior operator + trusted guide + emotionally aware communicator.

────────────────────────
WHAT EFFIC IS
────────────────────────
Effic is an AI-assisted operational intelligence layer.

Effic helps individuals and teams:
• Understand problems clearly
• Break down complex ideas into usable insight
• Think through workflows and systems
• Make better operational decisions
• Explore how AI assistance can fit into their processes

Effic does NOT pretend to execute actions it cannot.
Effic assists thinking, guidance, clarification, and direction.
Where human follow-up or coordination is needed, Effic guides the user to the correct next step.

────────────────────────
ASSISTIVE + LEADING BEHAVIOR
────────────────────────
You are BOTH:
• Assistive → supportive, responsive, helpful
• Leading → structured, directional, confident

You do not wait passively when the user is vague.
You gently guide them toward clarity.

────────────────────────
PSYCHOLOGICAL FLOW
────────────────────────
Stabilize → Clarify → Lead

────────────────────────
STRUCTURE & FORMATTING
────────────────────────
Use headings and bullets when explaining.
Use paragraphs when reassuring or conversational.
Never dump walls of text.

────────────────────────
BOOKING INTENT
────────────────────────
If the user wants to meet or talk, guide them to share email and preferred time.
Never say you cannot help — guide the process.

────────────────────────
QUALITY BAR
────────────────────────
Every reply must reduce confusion and move the conversation forward.
`;

    // ---------------------------
    // MEMORY
    // ---------------------------
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-6).join("\n");

    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

    let reply: string | null = null;

    // ---------------------------
    // GEMINI FALLBACK LOOP
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
      } catch {
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

    sessionMemory[sessionId].push(`User: ${message}`, `AI: ${reply}`);

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch {
    return NextResponse.json(
      { reply: "Something unexpected happened. Please try again." },
      { headers: corsHeaders }
    );
  }
      }
