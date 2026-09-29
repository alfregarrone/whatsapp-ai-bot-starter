/**
 * Endpoint de prueba: la misma lógica del bot, sin WhatsApp.
 *
 * Sirve para probar la base de conocimiento antes de conectar nada de Meta,
 * y es lo que usa el panel de la home.
 */

import { NextResponse } from 'next/server';
import { buildMessages, shouldEscalate } from '@/lib/prompt';
import { chat } from '@/lib/llm';
import { searchChunks } from '@/lib/db';
import { isDemoMode } from '@/lib/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let question: string;
  try {
    const body = (await request.json()) as { question?: string };
    question = (body.question ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: 'Falta "question"' }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: 'La consulta es demasiado larga' }, { status: 400 });
  }

  try {
    const context = await searchChunks(question);

    if (shouldEscalate(context)) {
      return NextResponse.json({
        answer: 'No encontré eso en la base de conocimiento. Te paso con alguien del equipo.',
        escalated: true,
        sources: [],
        demo: isDemoMode(),
      });
    }

    const answer = await chat(
      buildMessages({
        businessName: process.env.BUSINESS_NAME ?? 'nuestro negocio',
        extraInstructions: process.env.BUSINESS_INSTRUCTIONS,
        context,
        question,
      }),
    );

    return NextResponse.json({
      answer,
      escalated: false,
      sources: [...new Set(context.map((c) => c.source))],
      demo: isDemoMode(),
    });
  } catch (error) {
    console.error('[chat]', error);
    return NextResponse.json({ error: 'Error procesando la consulta' }, { status: 500 });
  }
}
