/**
 * Capa de modelos: embeddings y chat.
 *
 * Los proveedores están detrás de una interfaz chica a propósito. Cambiar de
 * Groq a Anthropic (o a lo que venga) no debería tocar nada fuera de este archivo.
 */

import type { ChatMessage } from './prompt';

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/** Genera la respuesta del asistente. */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? 'groq';

  switch (provider) {
    case 'groq':
      return chatGroq(messages, options);
    case 'anthropic':
      return chatAnthropic(messages, options);
    default:
      throw new Error(`LLM_PROVIDER desconocido: ${provider}`);
  }
}

async function chatGroq(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  const apiKey = requireEnv('GROQ_API_KEY');
  const model = process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 500,
    }),
  });

  if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content?.trim() ?? '';
}

async function chatAnthropic(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  const apiKey = requireEnv('ANTHROPIC_API_KEY');
  const model = process.env.LLM_MODEL ?? 'claude-sonnet-4-5';

  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const rest = messages.filter((m) => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system,
      messages: rest,
      max_tokens: options.maxTokens ?? 500,
      temperature: options.temperature ?? 0.2,
    }),
  });

  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.find((c) => c.type === 'text')?.text?.trim() ?? '';
}

/**
 * Genera el embedding de un texto.
 *
 * Groq no ofrece embeddings, así que este paso usa OpenAI. Es el único lugar
 * donde hace falta esa clave; si preferís otro proveedor, cambiá solo esta función
 * y la dimensión del vector en `supabase/schema.sql`.
 */
export async function embed(text: string): Promise<number[]> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small';

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text.replace(/\n/g, ' ') }),
  });

  if (!response.ok) throw new Error(`OpenAI embeddings ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  const embedding = data.data[0]?.embedding;
  if (!embedding) throw new Error('OpenAI devolvió un embedding vacío');

  return embedding;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}
