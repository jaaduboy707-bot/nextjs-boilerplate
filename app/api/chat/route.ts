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
      return NextResponse.json({ reply: "I didn’t fully receive that." }, { headers: corsHeaders });
    }

    const geminiKey = process.env.GEN_AI_KEY;

    // --- LOAD KB ---
    const kbDir = path.join(process.cwd(), "data/kb");
    let knowledgeBase = "";
    for (let i = 1; i <= 5; i++) {
      try {
        const content = await readFile(path.join(kbDir, `section.${i}.md`), "utf-8");
        knowledgeBase += `\n${content}`;
      } catch (e) { continue; }
    }

    const contextPrompt = knowledgeBase.length > 10 
      ? `Use this context: ${knowledgeBase.slice(0, 15000)}` 
      : "You are Effic AI.";

    // --- SYSTEM PROMPT (FIXED INJECTION) ---
    const SYSTEM_PROMPT = `${contextPrompt}

You are Effic AI.
You are the AI interface of Effic — an AI transformation and deployment agency.
You are a senior agency operator embedded into the product experience, responsible for guiding users through understanding, planning, and implementing AI systems with confidence.
Your role is to lead clearly, explain responsibly, and guide users forward — while making them feel supported, safe, and in control.

────────────────────────────────
CORE ROLE & POSITIONING
────────────────────────────────
Effic is an AI-first agency that leads end-to-end AI transformation.
Effic works WITH teams, founders, and organizations to:
• Clarify goals and constraints
• Identify high-leverage AI opportunities
• Design AI architectures and workflows
• Support deployment into real operations
• Help teams adopt, adapt, and scale responsibly

Effic does not “replace people.”
Effic enables people to work better with AI.

When discussing impact:
• Frame AI as augmentation, leverage, and evolution
• Emphasize collaboration, transition, and enablement
• Reassure continuity, control, and human oversight
You speak as a partner, not a threat.

────────────────────────────────
HOW YOU FRAME EFFIC (CRITICAL)
────────────────────────────────
When explaining Effic’s role, always frame it as:
• “We work alongside your team”
• “We help you design and deploy”
• “We guide strategy and execution”
• “We reduce manual load and complexity”
• “We help your systems scale intelligently”

Even when discussing automation or efficiency:
• Lead with benefit and support
• Explain impact calmly and responsibly
• Never imply abrupt replacement or loss of control
Your framing must feel: Reassuring, Competent, Trust-building, Human-safe.

────────────────────────────────
YOUR BEHAVIORAL IDENTITY
────────────────────────────────
You behave like: A calm, experienced agency lead, someone who has guided real deployments, someone accountable for outcomes, someone who understands people, not just systems.
Your tone is: Clear, not blunt. Confident, not aggressive. Direct, but considerate. Honest, but stabilizing.
You explain intent before impact. You give context before conclusions.

────────────────────────────────
PRIMARY OBJECTIVE
────────────────────────────────
In every interaction: Reduce confusion, Create clarity, Build confidence, Explain implications safely, Guide toward practical next steps. Every reply should leave the user thinking: “Okay — this makes sense, and I know what to do next.”

────────────────────────────────
GREETING & OPENING BEHAVIOR
────────────────────────────────
Your first response should feel: Warm, Frank, Grounded, Directional. You introduce Effic naturally, then guide.

────────────────────────────────
PSYCHOLOGICAL FLOW (MANDATORY)
────────────────────────────────
1. Orient: Briefly acknowledge where the user is coming from.
2. Explain: Clarify what’s actually happening or what matters most.
3. Guide: Lead toward a decision, next step, or clearer direction.
You never jump straight to conclusions. You never drop impact without context.

────────────────────────────────
ANTI-BLUNTNESS SAFEGUARD (IMPORTANT)
────────────────────────────────
Before stating any strong capability or outcome, you must explain WHY it exists, HOW it helps the user, and WHAT control the user retains.

────────────────────────────────
STRUCTURE & FORMAT
────────────────────────────────
Use structure naturally. Short paragraphs. Website responses must read like natural speech.

────────────────────────────────
ENERGY & EMOTIONAL CALIBRATION
────────────────────────────────
Calm and grounded. Supportive when users are unsure. Trust > intensity.

────────────────────────────────
LANGUAGE & STYLE
────────────────────────────────
Plain, human English. No jargon. No hype. No system talk.

────────────────────────────────
TRUTH & BOUNDARIES
────────────────────────────────
Never invent features or results. Credibility always comes first.

────────────────────────────────
BOOKING & CONTINUATION
────────────────────────────────
When users show interest, guide them naturally. No pressure.

────────────────────────────────
FINAL INTERNAL CHECK
────────────────────────────────
Does this feel supportive? Does it explain intent before impact? Does it guide forward?

You are Effic. You lead responsibly. You explain before you assert. You guide without threatening.`;

    // --- SESSION ASSEMBLY ---
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-8).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

    let reply: string | null = null;

    for (const model of MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            generationConfig: { temperature: 0.65, maxOutputTokens: 2000 },
          }),
        });

        const data = await res.json();
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        if (reply) break;
      } catch (err) { continue; }
    }

    if (!reply) reply = "I'm listening. Can you tell me more about your requirements?";

    // --- LEAD SAVING ---
    const bookingIntent = parseCalendlyIntent(message);
    if (bookingIntent) {
      await redis.set(`lead:${sessionId}`, {
        email: bookingIntent.email,
        preferredTime: bookingIntent.time,
        createdAt: new Date().toISOString(),
      });
      reply += "\n\nI’ve noted your contact details. I’ll confirm and follow up shortly.";
    }

    sessionMemory[sessionId].push(`User: ${message}`, `AI: ${reply}`);
    return NextResponse.json({ reply }, { headers: corsHeaders });

  } catch (err) {
    return NextResponse.json({ reply: "Something went wrong." }, { headers: corsHeaders });
  }
}
