import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();
    
    // 'message' is the new text, 'history' is an array of previous chats
    const { message, history = [] } = body;

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Format the history for Gemini (alternating 'user' and 'model' roles)
    const contents = [
      ...history,
      { role: "user", parts: [{ text: message }] }
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Gemini Error" }, { status: response.status });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    return NextResponse.json({ reply });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server crashed: " + err.message }, { status: 500 });
  }
}

