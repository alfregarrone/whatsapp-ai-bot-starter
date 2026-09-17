import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { parseWebhookPayload, verifySignature, verifyChallenge } from '../src/lib/whatsapp';

const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              { from: '5491134567890', id: 'wamid.1', timestamp: '1758000000', type: 'text', text: { body: 'hola' } },
              { from: '5491134567890', id: 'wamid.2', timestamp: '1758000001', type: 'image' },
            ],
          },
        },
      ],
    },
  ],
};

describe('parseWebhookPayload', () => {
  it('extrae solo los mensajes de texto', () => {
    const messages = parseWebhookPayload(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      from: '5491134567890',
      text: 'hola',
      messageId: 'wamid.1',
      timestamp: 1758000000,
    });
  });

  it('tolera payloads vacíos o de otros eventos', () => {
    expect(parseWebhookPayload({})).toEqual([]);
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload({ entry: [{ changes: [{ value: { statuses: [] } }] }] })).toEqual([]);
  });
});

describe('verifySignature', () => {
  const secret = 'app-secret-de-prueba';
  const body = JSON.stringify(payload);
  const valid = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

  it('acepta una firma correcta', () => {
    expect(verifySignature(body, valid, secret)).toBe(true);
  });

  it('rechaza firma ausente, mal formada, de otro secreto o de otro body', () => {
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, 'sha1=abc', secret)).toBe(false);
    expect(verifySignature(body, valid, 'otro-secreto')).toBe(false);
    expect(verifySignature('{"otro":1}', valid, secret)).toBe(false);
  });
});

describe('verifyChallenge', () => {
  it('devuelve el challenge con el token correcto', () => {
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'secreto',
      'hub.challenge': '12345',
    });

    expect(verifyChallenge(params, 'secreto')).toEqual({ ok: true, challenge: '12345' });
  });

  it('rechaza token incorrecto o modo distinto', () => {
    const base = { 'hub.mode': 'subscribe', 'hub.challenge': '1' };
    expect(verifyChallenge(new URLSearchParams({ ...base, 'hub.verify_token': 'x' }), 'secreto')).toEqual({ ok: false });
    expect(verifyChallenge(new URLSearchParams({ ...base, 'hub.mode': 'unsubscribe', 'hub.verify_token': 'secreto' }), 'secreto')).toEqual({ ok: false });
  });
});
