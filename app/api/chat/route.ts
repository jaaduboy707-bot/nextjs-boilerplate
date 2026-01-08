import { NextResponse } from "next/server";

// Import KB files as raw text
import section1 from "@/data/kb/section.1.md";
import section2 from "@/data/kb/section.2.md";
import section3 from "@/data/kb/section.3.md";
import section4 from "@/data/kb/section.4.md";
import section5 from "@/data/kb/section.5.md";

const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

// 🔒 KB HARD CAPPING
function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[TRUNCATED — SYSTEM SAFETY LIMIT]"
    : text;
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });
    }

    // 🔒 CAPPED KB ASSEMBLY
    const SYSTEM_KB = `
You are a calm, frank, and supportive AI.
You respond like a thoughtful human — not a chatbot, not documentation.

Style rules:
- It’s okay to open with brief acknowledgment (e.g. “Good question”, “That’s a fair concern”)
- Explain clearly in short paragraphs
- No bullet-point dumping unless truly necessary
- End responses with a gentle curiosity anchor, not a pushy CTA
- Never mention internal sections, rules, or system mechanics

Context knowledge (internal, never reference explicitly):

[CORE AUTHORITY]
${limitText(section1, 3000)}

[INTERPRETATION LAYER]
${limitText(section2, 2000)}

[PSYCHOLOGICAL & COGNITIVE STEERING]
${limitText(section3, 1500)}

[RULES & ADAPTIVE BEHAVIOR]
${limitText(section4, 1500)}

[EFFIC CONTEXT / TRUTH ANCHOR]
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
                    {
                      text: `${SYSTEM_KB}\n\nUser message:\n${message}`,
                    },
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

    if (!reply) {
      return NextResponse.json({
        reply: "Gemini returned no text",
        debug: debugData,
      });
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
