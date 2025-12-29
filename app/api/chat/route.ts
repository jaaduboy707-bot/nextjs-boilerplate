import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req) {
  try {
    const body = await req.json();
    const userMessage = body.message || body.prompt;

    if (!userMessage) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key missing in Vercel settings" }, { status: 500 });
    }

    // Initialize the official Google SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Using the 2.5 model you saw in the docs
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(userMessage);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Gemini Error:", error);
    return NextResponse.json({ 
      error: "Google API rejected the request", 
      details: error.message 
    }, { status: 500 });
  }
}

