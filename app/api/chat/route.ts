import { NextResponse } from "next/server";

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

    // Use Gemini 2.0 Flash (free-tier friendly)
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent",
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
              parts: [{ text: message }],
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

    // Check for errors returned by Gemini
    if (!response.ok) {
      return NextResponse.json({
        reply: "Gemini API error",
        debug: data,
      }, { status: response.status });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        ?.join("") || null;

    if (!reply) {
      return NextResponse.json({
        reply: "Gemini returned no text",
        debug: data,
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
