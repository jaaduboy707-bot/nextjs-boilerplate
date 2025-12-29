import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req) {
  try {
    // 1. Parse the request body safely
    const body = await req.json();
    const userMessage = body.message || body.prompt;

    if (!userMessage) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // 2. Access the API Key from Vercel Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not defined in Vercel" }, { status: 500 });
    }

    // 3. Initialize the Google AI SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 4. Use the 2.5 Flash model as per your documentation
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 5. Generate content
    const result = await model.generateContent(userMessage);
    const response = await result.response;
    const text = response.text();

    // 6. Return the clean JSON response
    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("Deployment/Runtime Error:", error.message);
    return NextResponse.json({ 
      error: "Gemini API Error", 
      details: error.message 
    }, { status: 500 });
  }
                  }

