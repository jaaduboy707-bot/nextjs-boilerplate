import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userMessage = body.message || body.prompt;

    if (!userMessage || typeof userMessage !== "string") {
      return NextResponse.json(
        { error: "No valid message provided" },
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (data?.error) {
      return NextResponse.json({
        reply: "Gemini API error",
        error: data.error,
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        ?.join("");

    if (!reply) {
      return NextResponse.json({
        reply: "Gemini responded but returned no text.",
        debug: data,
      });
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal Server Error", detail: error.message },
      { status: 500 }
    );
  }
}
