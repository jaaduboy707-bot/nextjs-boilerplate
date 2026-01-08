import { NextResponse } from "next/server";

// KB imports as raw text
import section1 from "@/data/kb/section.1.md";
import section2 from "@/data/kb/section.2.md";
import section3 from "@/data/kb/section.3.md";
import section4 from "@/data/kb/section.4.md";
import section5 from "@/data/kb/section.5.md";

import { SYSTEM_PROMPT } from "@/app/ai/systemPrompt";

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

// Memory simulation: previous messages
let memory: string[] = [];

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

    // Combine system prompt + KB + memory + current message
    const SYSTEM_KB = `
${SYSTEM_PROMPT}

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

    // Append memory if exists
    const MEMORY_TEXT = memory.length ? `\n\n[MEMORY]\n${memory.join("\n\n")}` : "";

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
                      text: `${SYSTEM_KB}${MEMORY_TEXT}\n\nUser message:\n${message}`,
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

    // Save to memory for future requests (simulate session)
    if (reply) memory.push(`User: ${message}\nAI: ${reply}`);

    // Supportive fallback if limit is reached or no reply
    if (!reply) {
      reply = "Hey! Looks like we reached the trial limit for now. You can explore more info on our website or chat with our team directly!";
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
