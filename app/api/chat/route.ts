import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    // 1. Get the data from the request
    const body = await req.json();
    const userMessage = body.message || body.prompt;

    if (!userMessage) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // 2. Check API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not defined in Vercel" }, { status: 500 });
    }

    // 3. The URL - Stable v1beta path
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // 4. Fetch from Google
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ text: userMessage }] 
        }]
      })
    });

    const data = await response.json();

    // 5. Handle Google API Errors
    if (!response.ok) {
      return NextResponse.json({ 
        error: data.error?.message || "Google API Error",
        details: data.error 
      }, { status: response.status });
    }

    // 6. Extract the reply safely
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return NextResponse.json({ 
        error: "Empty response from model", 
        debug: data 
      }, { status: 500 });
    }

    return NextResponse.json({ reply });

  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

