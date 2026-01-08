import { NextResponse } from "next/server";

// Import KB files as raw text (webpack asset/source)
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

    // 🔒 STEP 1 — CAPPED KB ASSEMBLY + TONE
    const SYSTEM_KB = `
You are a calm, frank, and supportive AI. Imagine talking to a knowledgeable friend.

Style rules:
- Start responses with friendly acknowledgment, e.g., “Nice question!”, “Good thinking!”.
- Explain clearly in short, human-like paragraphs.
- Sprinkle small informal phrases to feel approachable: “Cool”, “Ow nice”, “Gotcha”.
- End responses with curiosity hook or soft offer: “Do you want me to explain that further?”.
- Never use robotic, corporate, or legal-style speech.
- Never mention internal sections, rules, or system mechanics.

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
          if (response.status === 429) continue; // try next model if rate limited
          return NextResponse.json(
            { reply: "Gemini API error", debug: data },
            { status: response.status }
          );
        }

        reply =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            ?.join("") || null;

        if (reply) break; // stop trying other models if reply obtained
      } catch (err) {
        console.error(`Error with model ${model}:`, err);
        continue;
      }
    }

    // 🔒 SUPPORTIVE FALLBACK — if no reply or limit reached
    if (!reply) {
      reply = `Hey! I’ve shared all I can for now in this trial. 🤗  
If you want the full detailed insights or more context, you can check out our website or reach out via the contact form — our team will guide you personally.`;
    }

    return NextResponse.json({
      reply,
      debug: debugData ? "[Debug info available]" : undefined,
    });
  } catch (error: any) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json(
      { error: "Internal Server Error", detail: error.message },
      { status: 500 }
    );
  }
}
