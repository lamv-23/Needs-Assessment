import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { prompt, system } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  try {
    const ollamaRes = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt,
        system: system ?? 'You are a transport planning analyst. Write 2–3 sentences of formal but clear planning narrative for an Australian local government needs assessment. Use the exact numbers provided. Do not use bullet points or headings.',
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json({ error: 'Ollama returned an error' }, { status: 502 });
    }

    const data = await ollamaRes.json();
    return NextResponse.json({ text: data.response });
  } catch {
    return NextResponse.json(
      { error: 'Ollama is not running. Start it with: ollama serve' },
      { status: 503 }
    );
  }
}
