import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { Redis } from "@upstash/redis";

// Initialize Upstash
const redis = Redis.fromEnv(); 

// 1. THE CORS HANDSHAKE (Crucial for Framer)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
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
  return text.length > maxChars ? text.slice(0, maxChars) + "..." : text;
}

const sessionMemory: Record<string, string[]> = {};

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return NextResponse.json({ reply: "API Key Missing" }, { headers: corsHeaders });

    // 2. THE KNOWLEDGE BASE LOAD (Enhanced)
    const kbDir = path.join(process.cwd(), "data", "kb");
    let context = "";
    
    // We try to load all 5 sections. If a section is missing, we skip it instead of crashing.
    for (let i = 1; i <= 5; i++) {
        try {
            const content = await readFile(path.join(kbDir, `section.${i}.md`), "utf-8");
            context += `\n[Section ${i}]\n${content}`;
        } catch (e) {
            console.log(`Skipping section ${i}: File not found`);
        }
    }

    const SYSTEM_PROMPT = `
You are Effic AI, a calm and grounded assistant. 
Use the following context to answer the user. If the answer isn't in the context, be honest.

[KNOWLEDGE BASE]
${limitText(context, 8000)}

Rules:
- Short paragraphs.
- No emojis.
- Never mention you are an AI or use bot-language.
`;

    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const history = sessionMemory[sessionId].slice(-4).join("\n");
    const finalPrompt = `${SYSTEM_PROMPT}\n\nHistory:\n${history}\n\nUser: ${message}`;

    let reply = "";

    // 3. AI GENERATION LOOP
    for (const model of MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
          }),
        });

        const data = await res.json();
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (reply) break;
      } catch (err) { continue; }
    }

    // Fallback if the AI is still "silent"
    if (!reply) reply = "I've processed your query, but I need more specific details to provide an accurate summary of Effic.";

    sessionMemory[sessionId].push(`User: ${message}`, `AI: ${reply}`);

    return NextResponse.json({ reply }, { headers: corsHeaders });

  } catch (err) {
    return NextResponse.json({ reply: "System error occurred." }, { headers: corsHeaders });
  }
            }
