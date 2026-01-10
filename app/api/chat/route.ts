import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
];

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

    if (!message || !sessionId) {
      return NextResponse.json(
        { reply: "I didn’t fully receive that. Could you try again?" },
        { headers: corsHeaders }
      );
    }

    const geminiKey = process.env.GEN_AI_KEY;
    if (!geminiKey) {
      console.error("GEN_AI_KEY missing");
      return NextResponse.json(
        { reply: "Server configuration error. Please try later." },
        { headers: corsHeaders }
      );
    }

    // Load Knowledge Base
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

    // SYSTEM PROMPT
    const rawSystemPrompt = `${knowledgeBase.length > 10 ? `Use this context: ${knowledgeBase}` : "You are Effic AI."}

You are Effic AI, the AI interface of Effic — an AI transformation and deployment agency.
You are a senior agency operator embedded into the product experience.
Lead clearly, explain responsibly, guide users, make them feel supported and in control.

Core: Clarify goals, identify high-leverage AI ops, design architectures, deploy into operations, enable teams.
Do not replace people. Enable them.

Tone: Calm, clear, confident, supportive, trustworthy.

History + instructions follow.`;

    // Limit system prompt to last 14k chars for API stability
    const SYSTEM_PROMPT =
      rawSystemPrompt.length > 14000
        ? rawSystemPrompt.slice(-14000)
        : rawSystemPrompt;

    // Initialize session memory
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-8).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

    let reply: string | null = null;

    // Try each model in order until one gives a reply
    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`,
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
        reply = data?.candidates?.[0]?.content?.[0]?.text?.trim() || null;

        // If a valid reply found, stop trying other models
        if (reply && reply.length > 5) break;
      } catch (err) {
        console.error(`Model ${model} failed`, err);
        continue;
      }
    }

    // Safe fallback
    if (!reply || reply.length < 5) {
      reply =
        "Alright, let’s clarify this together. Can you give me a little more context so I can guide you properly?";
    }

    // Check and save Calendly intent
    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      try {
        await redis.set(`lead:${sessionId}`, {
          email: bookingIntent.email,
          preferredTime: bookingIntent.time,
          createdAt: new Date().toISOString(),
        });
        reply +=
          "\n\nI’ve noted your contact details. I’ll confirm and follow up shortly.";
      } catch (err) {
        console.error("Error saving lead", err);
      }
    }

    // Save session memory
    sessionMemory[sessionId].push(`User: ${message}`);
    sessionMemory[sessionId].push(`AI: ${reply}`);

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err) {
    console.error("POST handler error:", err);
    return NextResponse.json(
      { reply: "Something went wrong. Try again in a moment." },
      { headers: corsHeaders }
    );
  }
          }
