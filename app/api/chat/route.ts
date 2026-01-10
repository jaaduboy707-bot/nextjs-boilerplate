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

const MODELS = ["gemini-2.5-pro", "gemini-2.5-flash"];
const MAX_PROMPT_CHARS = 14000; // Safe chunk to avoid token overflow
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
        { reply: "I didn’t fully receive that." },
        { headers: corsHeaders }
      );
    }

    const geminiKey = process.env.GEN_AI_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { reply: "Configuration issue: AI key missing." },
        { headers: corsHeaders }
      );
    }

    // Load KB safely
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
    let rawSystemPrompt = `
${knowledgeBase.length > 10 ? `Use this context: ${knowledgeBase}` : "You are Effic AI."}

You are Effic AI.
You are the AI interface of Effic — an AI transformation and deployment agency.
You are a senior agency operator embedded into the product experience.
Lead clearly, explain responsibly, guide users, make them feel supported and in control.

Core: Clarify goals, identify high-leverage AI ops, design architectures, deploy into operations, enable teams.
Do not replace people. Enable them.

Tone: Calm, clear, confident, supportive, trustworthy.
History + instructions follow.
`;

    // Trim if too long
    if (rawSystemPrompt.length > MAX_PROMPT_CHARS) {
      rawSystemPrompt = rawSystemPrompt.slice(-MAX_PROMPT_CHARS);
    }

    // Initialize session memory
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const historyChunk = sessionMemory[sessionId].slice(-8).join("\n");
    const finalPrompt = `${rawSystemPrompt}\n\nHistory:\n${historyChunk}\n\nUser: ${message}`;

    let reply: string | null = null;

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
        const candidate = data?.candidates?.[0]?.content?.[0]?.text?.trim() || null;

        if (candidate && candidate.length > 10) {
          reply = candidate;
          break;
        }
      } catch (err) {
        console.error("Model request error:", err);
        continue;
      }
    }

    // Final fallback if nothing returned
    if (!reply) {
      reply =
        "Your trial ends! Reach out to us clearly to move forward or explore our website for distilled info!";
    }

    // Lead parsing & saving
    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      try {
        await redis.set(`lead:${sessionId}`, {
          email: bookingIntent.email,
          preferredTime: bookingIntent.time,
          createdAt: new Date().toISOString(),
        });
        reply += "\n\nI’ve noted your contact details. I’ll confirm and follow up shortly.";
      } catch (err) {
        console.error("Lead saving failed:", err);
      }
    }

    // Save session AFTER reply is confirmed
    sessionMemory[sessionId].push(`User: ${message}`);
    sessionMemory[sessionId].push(`AI: ${reply}`);

    return NextResponse.json({ reply }, { headers: corsHeaders });
  } catch (err) {
    console.error("POST error:", err);
    return NextResponse.json(
      { reply: "Your trial ends! Reach out to us clearly to move forward or explore our website for distilled info!" },
      { headers: corsHeaders }
    );
  }
                                 }
