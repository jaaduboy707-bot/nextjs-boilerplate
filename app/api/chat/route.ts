import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const result = await streamText({
    model: google('gemini-2.5-flash'),
    prompt,
  });
  return result.toAIStreamResponse();
}
