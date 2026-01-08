import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash"
];

/**
 * Loads all KB markdown files as raw text.
 * Server-only, Vercel-safe, App Router compliant.
 */
function loadKnowledgeBase() {
  const kbPath = path.join(process.cwd(), "data", "kb");

  const files = [
    "section.1.md",
    "section.2.md",
    "section.3.md",
    "section.4.md",
    "section.5.md",
  ];

  return files
    .map((file) =>
      fs.readFileSync(path.join(kbPath, file), "utf-8")
    )
    .join("\n\n");
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

    // ✅ Load KB at runtime
    const KNOWLEDGE_BASE = loadKnowledgeBase();

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
                      text: `${KNOWLEDGE_BASE}\n\nUSER MESSAGE:\n${message}`,
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
