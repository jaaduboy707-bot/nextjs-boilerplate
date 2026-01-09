import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

const MODELS = [
  "gemini-1.5-flash",
  "gemini-2.0-flash",
]

const SYSTEM_PROMPT = `
You are Effic AI.

Tone:
- Calm
- Professional
- Direct
- Human, not robotic

Rules:
- No emojis
- No hype
- No technical jargon unless asked
- Be concise but thoughtful
- Guide the user forward naturally
`

const sessionMemory: Record<string, string[]> = {}

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json()

    if (!message || !sessionId) {
      return NextResponse.json({
        reply: "Please send a valid message.",
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        reply: "AI is temporarily unavailable.",
      })
    }

    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = []
    const history = sessionMemory[sessionId].slice(-6).join("\n")

    const finalPrompt = `
${SYSTEM_PROMPT}

Conversation so far:
${history}

User:
${message}
`

    let reply: string | null = null

    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 400,
              },
            }),
          }
        )

        if (!res.ok) continue

        const data = await res.json()
        reply =
          data?.candidates?.[0]?.content?.parts?.[0]?.text || null

        if (reply) break
      } catch {
        continue
      }
    }

    if (!reply) {
      reply = "I’m here. What would you like to explore?"
    }

    sessionMemory[sessionId].push(`User: ${message}`)
    sessionMemory[sessionId].push(`AI: ${reply}`)

    return NextResponse.json({ reply })
  } catch (err) {
    console.error("CHAT API ERROR:", err)
    return NextResponse.json({
      reply: "Something went wrong on the server. Please try again shortly.",
    })
  }
}
