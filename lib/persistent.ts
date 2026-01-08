import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

type LeadData = {
  email: string;
  intent: string;
  sessionId: string;
};

/**
 * Persist AI-captured leads into Upstash Redis
 */
export async function saveLead(data: LeadData) {
  if (!data.email || !data.sessionId) {
    throw new Error("Invalid lead payload");
  }

  const id = `lead:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  await redis.hset(id, {
    email: data.email,
    intent: data.intent || "unspecified",
    sessionId: data.sessionId,
    createdAt: new Date().toISOString(),
  });

  return id;
}
