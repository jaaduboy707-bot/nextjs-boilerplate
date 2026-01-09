import { NextResponse } from "next/server";

// ---------------------------
// POST HANDLER — CONNECTIVITY TEST
// ---------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { reply: "Invalid request body." },
        { status: 400 }
      );
    }

    const { message, sessionId } = body;

    if (!message || !sessionId) {
      return NextResponse.json(
        { reply: "Missing message or sessionId." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        reply: "Connection confirmed. Backend is live and responding.",
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("API ERROR:", err);

    return NextResponse.json(
      {
        reply: "Server reached but encountered an error.",
      },
      { status: 500 }
    );
  }
}
