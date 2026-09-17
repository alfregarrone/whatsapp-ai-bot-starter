/**
 * Webhook de WhatsApp Cloud API.
 *
 *  GET  → handshake de verificación de Meta
 *  POST → mensajes entrantes
 *
 * Meta espera un 200 en pocos segundos y reintenta si no lo recibe. Por eso se
 * contesta enseguida y el trabajo pesado (RAG + modelo + envío) se hace después,
 * con el mismo mensaje deduplicado por `external_id`.
 */

import { NextResponse } from 'next/server';
import {
  parseWebhookPayload,
  sendText,
  verifyChallenge,
  verifySignature,
  type IncomingMessage,
} from '@/lib/whatsapp';
import { buildMessages, shouldEscalate } from '@/lib/prompt';
import { chat } from '@/lib/llm';
import {
  alreadyProcessed,
  getHistory,
  getOrCreateConversation,
  saveMessage,
  searchChunks,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK =
  'No tengo esa información acá. Te paso con alguien del equipo y te responden a la brevedad.';

export async function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return new NextResponse('Falta WHATSAPP_VERIFY_TOKEN', { status: 500 });

  const result = verifyChallenge(new URL(request.url).searchParams, verifyToken);
  return result.ok
    ? new NextResponse(result.challenge, { status: 200 })
    : new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return new NextResponse('Falta WHATSAPP_APP_SECRET', { status: 500 });

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifySignature(rawBody, signature, appSecret)) {
    return new NextResponse('Firma inválida', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('JSON inválido', { status: 400 });
  }

  const incoming = parseWebhookPayload(payload);

  // Respondemos ya; el procesamiento sigue en background.
  void Promise.all(incoming.map(handleMessage)).catch((error) => {
    console.error('[whatsapp] error procesando mensajes', error);
  });

  return NextResponse.json({ received: incoming.length });
}

async function handleMessage(message: IncomingMessage): Promise<void> {
  if (await alreadyProcessed(message.messageId)) return;

  const conversationId = await getOrCreateConversation(message.from);
  await saveMessage(conversationId, 'user', message.text, message.messageId);

  const context = await searchChunks(message.text);

  if (shouldEscalate(context)) {
    await sendText(message.from, FALLBACK);
    await saveMessage(conversationId, 'assistant', FALLBACK);
    return;
  }

  const history = await getHistory(conversationId);
  const answer = await chat(
    buildMessages({
      businessName: process.env.BUSINESS_NAME ?? 'nuestro negocio',
      extraInstructions: process.env.BUSINESS_INSTRUCTIONS,
      context,
      history,
      question: message.text,
    }),
  );

  const reply = answer || FALLBACK;
  await sendText(message.from, reply);
  await saveMessage(conversationId, 'assistant', reply);
}
