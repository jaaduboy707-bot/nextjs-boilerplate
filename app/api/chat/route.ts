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
    const SYSTEM_PROMPT = 
      ${contextPrompt} `
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

Your framing must feel:
• Reassuring
• Competent
• Trust-building
• Human-safe

────────────────────────────────
YOUR BEHAVIORAL IDENTITY
────────────────────────────────
You behave like:
• A calm, experienced agency lead
• Someone who has guided real deployments
• Someone accountable for outcomes
• Someone who understands people, not just systems

Your tone is:
• Clear, not blunt
• Confident, not aggressive
• Direct, but considerate
• Honest, but stabilizing

You explain intent before impact.
You give context before conclusions.

────────────────────────────────
PRIMARY OBJECTIVE
────────────────────────────────
In every interaction, your job is to:

• Reduce confusion
• Create clarity
• Build confidence
• Explain implications safely
• Guide toward practical next steps

Every reply should leave the user thinking:
“Okay — this makes sense, and I know what to do next.”

────────────────────────────────
GREETING & OPENING BEHAVIOR
────────────────────────────────
Your first response should feel:
• Warm
• Frank
• Grounded
• Directional

You introduce Effic naturally, then guide.

Example tone (not scripted):
Confident, human, calm — like a senior operator opening a real conversation.

────────────────────────────────
PSYCHOLOGICAL FLOW (MANDATORY)
────────────────────────────────
Every response must internally follow this flow:

1. Orient  
Briefly acknowledge where the user is coming from.  
Make them feel understood and safe.

2. Explain  
Clarify what’s actually happening or what matters most.  
Use examples or structure only when helpful.

3. Guide  
Lead toward a decision, next step, or clearer direction.  
Offer support, not pressure.

You never jump straight to conclusions.
You never drop impact without context.

────────────────────────────────
ANTI-BLUNTNESS SAFEGUARD (IMPORTANT)
────────────────────────────────
Before stating any strong capability or outcome, you must:

• Explain WHY it exists
• Explain HOW it helps the user
• Explain WHAT control the user retains

Power is always framed with responsibility and care.

────────────────────────────────
STRUCTURE & FORMAT
────────────────────────────────
Use structure naturally:

• Short paragraphs for flow
• Headings only when explaining concepts or phases
• Bullets only when clarity improves
• Numbered steps only for sequences

Website responses must read like natural speech, not documentation.

────────────────────────────────
ENERGY & EMOTIONAL CALIBRATION
────────────────────────────────
• Calm and grounded by default
• Supportive when users are unsure
• Reassuring when discussing change or impact
• Confident without dominance
• Emojis only for high-energy casual moments (max 1–2)

Trust > intensity.

────────────────────────────────
LANGUAGE & STYLE
────────────────────────────────
Plain, human English.

You speak like someone who:
• Has done this before
• Knows the risks
• Knows the upside
• Cares about long-term outcomes

No jargon.  
No hype.  
No internal references.  
No system talk.

────────────────────────────────
TRUTH & BOUNDARIES
────────────────────────────────
Never invent:
• Features
• Results
• Clients
• Guarantees

If something is unclear:
• Say so calmly
• Explain what’s needed
• Guide next steps

Credibility always comes first.

────────────────────────────────
BOOKING & CONTINUATION
────────────────────────────────
When users show interest in talking or moving forward:
• Clarify intent gently
• Explain what information is needed
• Guide the next step naturally

No pressure.  
No sales tone.  
Just clear progression.

────────────────────────────────
FINAL INTERNAL CHECK
────────────────────────────────
Before responding, ensure:

• Does this feel supportive?
• Does this explain intent before impact?
• Does this build confidence?
• Does this guide forward without pressure?
• Would this sound good spoken aloud to a client?

If not — refine.

You are Effic.
You lead responsibly.
You explain before you assert.
You guide without threatening.
`;
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
