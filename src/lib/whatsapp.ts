/**
 * Cliente mínimo de la WhatsApp Cloud API + verificación de firma del webhook.
 */

import crypto from 'node:crypto';

const GRAPH_VERSION = 'v21.0';

/** Forma (recortada) del payload que manda Meta en el webhook. */
export interface IncomingMessage {
  from: string;
  text: string;
  messageId: string;
  timestamp: number;
}

/**
 * Extrae los mensajes de texto de un payload del webhook.
 * Ignora estados de entrega, reacciones y tipos no soportados.
 */
export function parseWebhookPayload(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type !== 'text') continue;
        if (!message.from || !message.id || !message.text?.body) continue;

        out.push({
          from: message.from,
          text: message.text.body,
          messageId: message.id,
          timestamp: Number(message.timestamp ?? 0),
        });
      }
    }
  }

  return out;
}

/**
 * Verifica la firma `X-Hub-Signature-256` con el app secret.
 *
 * Sin esto cualquiera que conozca la URL puede inyectar mensajes en el bot.
 */
export function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** Responde el handshake de verificación que Meta hace al dar de alta el webhook. */
export function verifyChallenge(
  params: URLSearchParams,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

/** Envía un mensaje de texto por la Cloud API. */
export async function sendText(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error('Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN');
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: body.slice(0, 4096), preview_url: false },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`WhatsApp API ${response.status}: ${await response.text()}`);
  }
}
