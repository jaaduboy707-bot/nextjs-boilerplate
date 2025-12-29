import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    let userMessage = "Hello";

    try {
      const body = await req.json();
      userMessage = body.message || body.prompt || "Hello";
    } catch {
      // ignore bad json
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key missing" },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userMessage }],
            },
          ],
        }),
      }
    );

    const data = await res.json();

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI";

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("CHAT API ERROR:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
        }
