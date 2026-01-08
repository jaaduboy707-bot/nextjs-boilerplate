import { NextResponse } from "next/server";

// ✅ KB imports as raw text
import section1 from "@/data/kb/section.1.md";
import section2 from "@/data/kb/section.2.md";
import section3 from "@/data/kb/section.3.md";
import section4 from "@/data/kb/section.4.md";
import section5 from "@/data/kb/section.5.md";

// Models to try
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

// 🔒 KB Hard capping
function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[TRUNCATED — SYSTEM SAFETY LIMIT]"
    : text;
}

// 🔄 Memory simulation (store last 3 messages per session)
const MEMORY: Record<string, string[]> = {};

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });
    }

    // Append user message to memory
    if (!MEMORY[sessionId]) MEMORY[sessionId] = [];
    MEMORY[sessionId].push(`User: ${message}`);
    if (MEMORY[sessionId].length > 3) MEMORY[sessionId].shift(); // keep last 3

    // 🔒 SYSTEM PROMPT — KB + tone + memory
    const SYSTEM_KB = `
You are a calm, frank, supportive AI, like a knowledgeable friend.

Style rules:
- Start responses with friendly acknowledgment: “Nice question!”, “Good thinking!”.
- Explain clearly in short, human-like paragraphs.
- Sprinkle small informal phrases: “Cool”, “Ow nice”, “Gotcha”.
- End responses with curiosity hook: “Do you want me to explore that further?”.
- Never use robotic, corporate, or legal-style speech.

Memory from this session (last 3 messages):
${MEMORY[sessionId].join("\n")}

[SECTION 1 — CORE AUTHORITY]
${limitText(section1, 3000)}

[SECTION 2 — INTERPRETATION LAYER]
${limitText(section2, 2000)}

[SECTION 3 — PSYCHOLOGICAL & COGNITIVE STEERING]
${limitText(section3, 1500)}

[SECTION 4 — RULES & ADAPTIVE BEHAVIOR]
${limitText(section4, 1500)}

[SECTION 5 — EFFIC CONTEXT / TRUTH ANCHOR]
${limitText(section5, 3000)}
`;

    let reply: string | null = null;
    let debugData: any = null;

    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: `${SYSTEM_KB}\n\nUser message:\n${message}` },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 400,
              },
            }),
          }
        );

        const data = await response.json();
        debugData = data;

        if (!response.ok) {
          if (response.status === 429) continue;
          return NextResponse.json(
            { reply: "Gemini API error", debug: data },
            { status: response.status }
          );
        }

        reply =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            ?.join("") || null;

        if (reply) break;
      } catch (err) {
        console.error(`Error with model ${model}:`, err);
        continue;
      }
    }

    // 💡 Supportive fallback if no reply or hit token cap
    if (!reply) {
      reply = `Hey! Looks like we've hit the trial response limit. 
You can explore full details on our website or reach out to our team directly through the contact form — they'll guide you personally!`;
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json(
      { error: "Internal Server Error", detail: error.message },
      { status: 500 }
    );
  }
  }
