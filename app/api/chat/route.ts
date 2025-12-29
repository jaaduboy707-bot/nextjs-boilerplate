import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage = body.message;

    if (!userMessage) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const systemPrompt = `
You are a helpful AI assistant.
Follow rules strictly.
Use provided knowledge only as reference.
Do not take actions unless explicitly asked.
`;

    const result = await model.generateContent([
      systemPrompt,
      userMessage,
    ]);

    const text = result.response.text();

    return NextResponse.json({ reply: text });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
