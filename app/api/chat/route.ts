import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// ---------------------------
// Models priority
// ---------------------------
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

// ---------------------------
// KB HARD CAPPING FUNCTION
// ---------------------------
function limitText(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars
    ? text.slice(0, maxChars) + "\n\n[TRUNCATED — SYSTEM SAFETY LIMIT]"
    : text;
}

// ---------------------------
// MEMORY SIMULATION
// ---------------------------
const sessionMemory: Record<string, string[]> = {};

// ---------------------------
// MOCK FUNCTION TO EXTRACT EMAIL + TIME
// ---------------------------
function parseCalendlyRequest(message: string) {
  const emailMatch = message.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  const timeMatch = message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (!emailMatch || !timeMatch) return null;
  const startTime = new Date(timeMatch[0]);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min meeting
  return { clientEmail: emailMatch[0], startTime: startTime.toISOString(), endTime: endTime.toISOString() };
}

// ---------------------------
// POST ROUTE
// ---------------------------
export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json();

    if (!message) return NextResponse.json({ error: "No message provided" }, { status: 400 });
    if (!sessionId) return NextResponse.json({ error: "Session ID required" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });

    const calendlyKey = process.env.CALENDLY_API_TOKEN;
    if (!calendlyKey) return NextResponse.json({ error: "Calendly API key missing" }, { status: 500 });

    // ---------------------------
    // READ KB FILES
    // ---------------------------
    const kbDir = path.join(process.cwd(), "data/kb");
    const [section1, section2, section3, section4, section5] = await Promise.all([
      readFile(path.join(kbDir, "section.1.md"), "utf-8"),
      readFile(path.join(kbDir, "section.2.md"), "utf-8"),
      readFile(path.join(kbDir, "section.3.md"), "utf-8"),
      readFile(path.join(kbDir, "section.4.md"), "utf-8"),
      readFile(path.join(kbDir, "section.5.md"), "utf-8"),
    ]);

    const SYSTEM_KB = `
You are a calm, frank, and supportive AI. Imagine talking to a knowledgeable friend.

Style rules:
- Start responses with friendly acknowledgment, e.g., “Nice question!”, “Good thinking!”.
- Explain clearly in short, human-like paragraphs.
- Sprinkle small informal phrases to feel approachable: “Cool”, “Ow nice”, “Gotcha”.
- End responses with curiosity hook or soft offer: “Do you want me to explain that further?”.
- Never use robotic, corporate, or legal-style speech.
- Never mention internal sections, rules, or system mechanics.

[SECTION 1 — CORE AUTHORITY]
${limitText(section1, 3000)}

[SECTION 2 — INTERPRETATION LAYER]
${limitText(section2, 2000)}

[SECTION 3 — PSYCHOLOGICAL & COGNITIVE STEERING]
${limitText(section3, 1500)}

[SECTION 4 — RULES & ADAPTIVE BEHAVIOR]
${limitText(section4, 1500)}

[SECTION 5 — EFFIC CONTEXT / TRUTH ANCHOR]
${limitText(section5, 3000)}
`;

    // ---------------------------
    // MEMORY SIMULATION
    // ---------------------------
    if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
    const pastMessages = sessionMemory[sessionId];
    const memoryText = pastMessages.length ? "\n\nPREVIOUS CONVERSATION:\n" + pastMessages.join("\n") : "";

    const finalPrompt = `${SYSTEM_KB}\n\nUser message:\n${message}${memoryText}`;

    let reply: string | null = null;

    // ---------------------------
    // CALL GEMINI AI
    // ---------------------------
    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 450 },
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 429) continue;
          return NextResponse.json({ reply: "Gemini API error", debug: data }, { status: response.status });
        }
        reply = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text)?.join("") || null;
        if (reply) break;
      } catch (err) {
        console.error(`Error with model ${model}:`, err);
        continue;
      }
    }

    // ---------------------------
    // CALENDLY SCHEDULING
    // ---------------------------
    const calendlyData = parseCalendlyRequest(message);
    if (calendlyData) {
      const { clientEmail, startTime, endTime } = calendlyData;
      try {
        const calendlyRes = await fetch("https://api.calendly.com/scheduled_events", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${calendlyKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invitee: { email: clientEmail },
            event_type: "https://api.calendly.com/event_types/<YOUR_EVENT_TYPE_UUID>", // replace with your event type
            start_time: startTime,
            end_time: endTime,
          }),
        });
        const calendlyResp = await calendlyRes.json();
        if (calendlyRes.ok) {
          reply += `\n\n✅ Scheduled successfully for ${startTime}. Check your email for confirmation.`;
          sessionMemory[sessionId].push(`Scheduled via Calendly: ${clientEmail} at ${startTime}`);
        } else {
          reply += `\n\n⚠️ Could not schedule: ${calendlyResp.message || "Unknown error"}`;
        }
      } catch (err) {
        console.error("Calendly API error:", err);
        reply += `\n\n⚠️ Error while scheduling the meeting.`;
      }
    }

    // ---------------------------
    // UPDATE SESSION MEMORY
    // ---------------------------
    sessionMemory[sessionId].push(`User: ${message}`);
    if (reply) sessionMemory[sessionId].push(`AI: ${reply}`);

    // ---------------------------
    // FALLBACK
    // ---------------------------
    if (!reply) {
      reply = "Hey! Looks like we've reached the trial limit for this conversation. You can explore more on our website or reach out to our team directly to get detailed guidance. ✨";
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json({ error: "Internal Server Error", detail: error.message }, { status: 500 });
  }
}
