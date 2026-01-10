import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Models & API keys rotation
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
];
const API_KEYS = [
  process.env.GEN_AI_KEY_1,
  process.env.GEN_AI_KEY_2,
  process.env.GEN_AI_KEY_3,
];

// Session memory & trial limits
const sessionMemory: Record<string, string[]> = {};
const sessionUsage: Record<string, number> = {};
const MAX_TRIAL_MESSAGES = 20; // trial limit per session

// Parse Calendly-like booking info
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

    if (!message || !sessionId) {
      return NextResponse.json(
        { reply: "I didn’t fully receive that." },
        { headers: corsHeaders }
      );
    }

    // Initialize session usage
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    if (!sessionUsage[sessionId]) sessionUsage[sessionId] = 0;

    // Trial limit check
    if (sessionUsage[sessionId] >= MAX_TRIAL_MESSAGES) {
      return NextResponse.json(
        {
          reply:
            "Your trial ends! Reach out to us clearly to move forward or explore our website for distilled info.",
        },
        { headers: corsHeaders }
      );
    }

    // Increment trial usage
    sessionUsage[sessionId]++;

    // Load KB
    const kbDir = path.join(process.cwd(), "data/kb");
    let knowledgeBase = "";
    for (let i = 1; i <= 5; i++) {
      try {
        const content = await readFile(
          path.join(kbDir, `section.${i}.md`),
          "utf-8"
        );
        knowledgeBase += `\n${content}`;
      } catch {
        continue;
      }
    }

    // System prompt
    const rawSystemPrompt = `${knowledgeBase.length > 10 ? `Use this context: ${knowledgeBase}` : "You are Effic AI."}

You are Effic AI.
You are the AI interface of Effic — an AI transformation and deployment agency.
You are a senior agency operator embedded into the product experience.
Lead clearly, explain responsibly, guide users, make them feel supported and in control.

Core: Clarify goals, identify high-leverage AI ops, design architectures, deploy into operations, enable teams.
Do not replace people. Enable them.

Tone: Calm, clear, confident, supportive, trustworthy.

History + instructions follow.`;

    const SYSTEM_PROMPT =
      rawSystemPrompt.length > 14000
        ? rawSystemPrompt.slice(-14000)
        : rawSystemPrompt;

    const history = sessionMemory[sessionId].slice(-8).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

    let reply: string | null = null;

    // Loop through models and API keys
    outer: for (const key of API_KEYS) {
      for (const model of MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
                generationConfig: { temperature: 0.65, maxOutputTokens: 2000 },
              }),
            }
          );

          const data = await res.json();
          reply = data?.candidates?.[0]?.content?.[0]?.text || null;
          if (reply) break outer;
        } catch {
          continue;
        }
      }
    }

    // Final fallback
    if (!reply) {
      reply =
        "Your trial ends! Reach out to us clearly to move forward or explore our website for distilled info.";
    }

    // Save booking intent if found
    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      await redis.set(`lead:${sessionId}`, {
        email: bookingIntent.email,
        preferredTime: bookingIntent.time,
        createdAt: new Date().toISOString(),
      });
      reply +=
        "\n\nI’ve noted your contact details. I’ll confirm and follow up shortly.";
    }

    // Save session history
    sessionMemory[sessionId].push(`User: ${message}`);
    sessionMemory[sessionId].push(`AI: ${reply}`);

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        reply:
          "Your trial ends! Reach out to us clearly to move forward or explore our website for distilled info.",
      },
      { headers: corsHeaders }
    );
  }
    }
