import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchHelp, HELP_CATEGORIES, type HelpEntry } from '@/lib/helpCenter';

/**
 * VybeHelp backend -- retrieval-augmented, never open-ended.
 *
 * Primary mode (always on, no API key, no external network call):
 * `searchHelp()` finds the best-matching Help Center entries for the
 * user's question and we hand those back as a direct answer. This is
 * deterministic and can never hallucinate a feature that doesn't exist,
 * because every word comes straight from lib/helpCenter.ts.
 *
 * Optional enhancement: if ANTHROPIC_API_KEY is set in the environment,
 * we also ask Claude to phrase a natural-language answer -- but we
 * constrain it with a system prompt to use ONLY the retrieved entries as
 * source material, and we still fall back to the plain retrieval answer
 * if the call fails or the key isn't set. No new npm dependency: this is
 * a plain fetch to the Messages API.
 */

const bodySchema = z.object({
  query: z.string().trim().min(1).max(500),
});

const NO_MATCH_ANSWER =
  "I couldn't find anything in the findmyVybe Help Center that matches that -- could you try rephrasing, or browse a category below? If you still can't find it, use \"Still stuck? Contact us\" in the Help Center.";

function formatRetrievalAnswer(results: { entry: HelpEntry }[]): string {
  const [top, ...rest] = results;
  if (!top) return NO_MATCH_ANSWER;
  let answer = top.entry.answer;
  if (rest.length > 0) {
    answer +=
      '\n\nRelated:\n' + rest.map((r) => `• ${r.entry.question}`).join('\n');
  }
  return answer;
}

async function tryLlmAnswer(query: string, results: { entry: HelpEntry }[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || results.length === 0) return null;

  const context = results
    .map((r, i) => `[${i + 1}] Q: ${r.entry.question}\nA: ${r.entry.answer}`)
    .join('\n\n');

  const system =
    'You are VybeHelp, the in-app support assistant for the dating/matrimony app findmyVybe. ' +
    'Answer the user\'s question using ONLY the numbered Help Center entries given as context. ' +
    'Do not invent features, prices, or behavior that is not stated in the context. ' +
    'If the context does not answer the question, say you\'re not sure and suggest they browse the Help Center or contact support. ' +
    'Keep answers short (2-5 sentences), warm, and direct. Do not mention "context" or "entries" -- just answer naturally.';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 400,
        system,
        messages: [
          { role: 'user', content: `Help Center context:\n\n${context}\n\nUser question: ${query}` },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const { query } = parsed.data;

  const results = searchHelp(query, 5);
  const llmAnswer = await tryLlmAnswer(query, results);
  const answer = llmAnswer ?? formatRetrievalAnswer(results);

  return NextResponse.json({
    answer,
    mode: llmAnswer ? 'llm' : 'retrieval',
    sources: results.map((r) => ({ id: r.entry.id, question: r.entry.question, category: r.entry.category })),
    categories: results.length === 0 ? HELP_CATEGORIES : undefined,
  });
}
