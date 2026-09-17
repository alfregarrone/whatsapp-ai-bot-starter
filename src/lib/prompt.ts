/**
 * Armado del prompt del asistente.
 *
 * Separado de la llamada al modelo a propósito: así se puede testear qué se le
 * manda sin pegarle a ninguna API.
 */

export interface RetrievedChunk {
  content: string;
  source: string;
  similarity: number;
}

export interface BuildPromptInput {
  /** Nombre del negocio, para que el bot se presente. */
  businessName: string;
  /** Fragmentos recuperados de la base de conocimiento. */
  context: RetrievedChunk[];
  /** Últimos mensajes de la conversación, del más viejo al más nuevo. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Mensaje actual del usuario. */
  question: string;
  /** Instrucciones extra del negocio (horarios, tono, qué no responder). */
  extraInstructions?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Cuántos mensajes de historia se mandan como máximo. */
export const MAX_HISTORY_MESSAGES = 10;

/** Umbral de similitud por debajo del cual un fragmento se descarta. */
export const MIN_SIMILARITY = 0.35;

export function buildSystemPrompt(input: BuildPromptInput): string {
  const usable = input.context.filter((c) => c.similarity >= MIN_SIMILARITY);

  const contextBlock = usable.length
    ? usable
        .map((c, i) => `[${i + 1}] (fuente: ${c.source})\n${c.content}`)
        .join('\n\n---\n\n')
    : '(no se encontró información relevante en la base de conocimiento)';

  return [
    `Sos el asistente de atención al cliente de ${input.businessName}, respondiendo por WhatsApp.`,
    '',
    'Reglas:',
    '- Respondé solamente con información que esté en el CONTEXTO. Si no está, decí que no lo tenés y ofrecé pasar la consulta a una persona.',
    '- Nunca inventes precios, plazos, direcciones ni políticas.',
    '- Escribí en español rioplatense, en tono cordial y directo. Tuteá.',
    '- Respuestas cortas: WhatsApp, no un email. Máximo 4 oraciones salvo que pidan un detalle largo.',
    '- No uses markdown de encabezados ni tablas: WhatsApp no los renderiza.',
    input.extraInstructions ? `\nInstrucciones del negocio:\n${input.extraInstructions}` : '',
    '',
    'CONTEXTO:',
    contextBlock,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');
}

/** Arma la lista de mensajes final que se manda al modelo. */
export function buildMessages(input: BuildPromptInput): ChatMessage[] {
  const history = (input.history ?? []).slice(-MAX_HISTORY_MESSAGES);

  return [
    { role: 'system', content: buildSystemPrompt(input) },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: 'user', content: input.question },
  ];
}

/**
 * `true` si no hay contexto utilizable: el caller decide si deriva a un humano
 * antes de gastar una llamada al modelo.
 */
export function shouldEscalate(context: RetrievedChunk[]): boolean {
  return !context.some((c) => c.similarity >= MIN_SIMILARITY);
}
