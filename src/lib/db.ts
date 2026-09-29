/**
 * Acceso a Supabase.
 *
 * Toda la escritura pasa por el service role y corre en el servidor: el bot no
 * expone datos al cliente. Las políticas RLS del schema están pensadas para que,
 * si mañana agregás un panel con login, ya esté cerrado por defecto.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embed } from './llm';
import { isDemoMode, searchDemoChunks } from './demo';
import type { RetrievedChunk } from './prompt';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Busca los fragmentos más parecidos a la consulta.
 *
 * En modo demo (`DEMO_MODE=true`) no toca Supabase: usa el FAQ embebido y
 * coincidencia léxica, para que el bot se pueda probar sin montar nada.
 */
export async function searchChunks(question: string, limit = 5): Promise<RetrievedChunk[]> {
  if (isDemoMode()) return searchDemoChunks(question, limit);

  const embedding = await embed(question);

  const { data, error } = await db().rpc('match_chunks', {
    query_embedding: embedding,
    match_count: limit,
  });

  if (error) throw new Error(`match_chunks: ${error.message}`);

  return (data ?? []).map((row: { content: string; source: string; similarity: number }) => ({
    content: row.content,
    source: row.source,
    similarity: row.similarity,
  }));
}

/**
 * Devuelve (o crea) la conversación de un número de teléfono.
 *
 * En modo demo no hay base: se devuelve un id sintético y nada se persiste.
 */
export async function getOrCreateConversation(phone: string): Promise<string> {
  if (isDemoMode()) return `demo:${phone}`;

  const existing = await db()
    .from('conversations')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing.data?.id) return existing.data.id as string;

  const created = await db()
    .from('conversations')
    .insert({ phone })
    .select('id')
    .single();

  if (created.error) throw new Error(`conversations.insert: ${created.error.message}`);
  return created.data.id as string;
}

export async function getHistory(
  conversationId: string,
  limit = 10,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (isDemoMode()) return [];

  const { data, error } = await db()
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`messages.select: ${error.message}`);

  return (data ?? []).reverse() as Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  externalId?: string,
): Promise<void> {
  if (isDemoMode()) return;

  const { error } = await db()
    .from('messages')
    .insert({ conversation_id: conversationId, role, content, external_id: externalId ?? null });

  // Un mensaje repetido (Meta reintenta el webhook) no es un error: es idempotencia.
  if (error && !error.message.includes('duplicate key')) {
    throw new Error(`messages.insert: ${error.message}`);
  }
}

/** `true` si ese messageId de WhatsApp ya fue procesado. */
export async function alreadyProcessed(externalId: string): Promise<boolean> {
  if (isDemoMode()) return false;

  const { data } = await db()
    .from('messages')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();

  return Boolean(data?.id);
}
