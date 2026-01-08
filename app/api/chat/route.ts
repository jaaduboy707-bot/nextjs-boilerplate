import { NextResponse } from "next/server";

// 🔹 System prompt
import { SYSTEM_PROMPT } from "@/app/ai/systemPrompt";

// 🔹 Knowledge Base (raw markdown, bundled by webpack)
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
  "gemini-1.5-flash"
];

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY missing" },
        { status: 500 }
      );
    }

    // 🔹 Combine full knowledge base (silent, internal)
    const KNOWLEDGE_BASE = `
${section1}

${section2}

${section3}

${section4}

${section5}
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
                      text: `
${SYSTEM_PROMPT}

--- INTERNAL KNOWLEDGE BASE (SILENT) ---
${KNOWLEDGE_BASE}

--- USER MESSAGE ---
${message}
                      `,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 512,
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
