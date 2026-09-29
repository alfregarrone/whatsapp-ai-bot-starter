/**
 * Modo demo: el bot funciona sin Supabase ni claves de embeddings.
 *
 * Con `DEMO_MODE=true` la base de conocimiento es el FAQ de ejemplo embebido acá,
 * y la recuperación usa coincidencia léxica en lugar de vectores. Alcanza para que
 * cualquiera pruebe el bot en 30 segundos sin montar nada, y para tener una demo
 * pública andando.
 *
 * No es lo que se usa en producción: el modo normal indexa tus documentos con
 * embeddings en pgvector, que entiende sinónimos y reformulaciones. Este modo no.
 */

import type { RetrievedChunk } from './prompt';

/** FAQ de ejemplo, embebido para no depender del sistema de archivos en el deploy. */
const DEMO_KNOWLEDGE = `
# Preguntas frecuentes — Negocio de ejemplo

## Horarios de atención

Atendemos de lunes a viernes de 9 a 18, y los sábados de 9 a 13.
Los feriados nacionales permanecemos cerrados.

## Dónde estamos

Av. Siempreviva 742, Córdoba Capital. Hay estacionamiento sobre la calle lateral.

## Formas de pago

Aceptamos efectivo, transferencia bancaria y tarjeta de débito o crédito, hasta 3 cuotas
sin interés. No aceptamos cheques.
Para transferencias, el alias es negocio.ejemplo.ar.

## Envíos

Hacemos envíos a todo el país por correo. El costo se calcula al momento de la compra
y depende del código postal. Dentro de Córdoba Capital el envío tarda entre 24 y 48 horas
hábiles; al interior del país, entre 3 y 7 días hábiles.

## Cambios y devoluciones

Tenés 30 días corridos desde la compra para cambiar un producto sin uso y con su empaque
original. Para devoluciones con reintegro, el plazo es de 10 días corridos.

## Garantía

Todos los productos tienen 12 meses de garantía del fabricante. La garantía no cubre
daños por mal uso ni por golpes.
`.trim();

/**
 * Palabras que aparecen en casi toda consulta y no aportan señal.
 *
 * Incluye los verbos de relleno con los que arranca casi toda pregunta por WhatsApp
 * ("puedo", "quiero", "hacen"): sin sacarlos, diluyen el puntaje de los términos que
 * sí importan y la consulta cae por debajo del umbral.
 */
const STOPWORDS = new Set([
  'a', 'al', 'con', 'como', 'cual', 'cuales', 'de', 'del', 'el', 'en', 'es', 'esta',
  'este', 'hay', 'la', 'las', 'lo', 'los', 'me', 'mi', 'para', 'pero', 'por', 'que',
  'se', 'si', 'sobre', 'su', 'tiene', 'tienen', 'un', 'una', 'y',
  'aceptan', 'dan', 'hacen', 'hacer', 'necesito', 'puedo', 'pueden', 'queda', 'quedan',
  'quiero', 'sale', 'son', 'tengo', 'ustedes',
]);

/** Normaliza: minúsculas, sin tildes, sin puntuación. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

let cachedChunks: Array<{ content: string; tokens: Set<string> }> | null = null;

/**
 * Parte el FAQ por secciones `##`, no por tamaño.
 *
 * En modo normal el chunking por tamaño es lo correcto porque los documentos del
 * negocio son arbitrarios. Acá el documento es un FAQ con una pregunta por sección,
 * y cortar por encabezado da fragmentos que se corresponden uno a uno con las
 * consultas reales.
 */
function getChunks() {
  if (cachedChunks) return cachedChunks;

  cachedChunks = DEMO_KNOWLEDGE.split(/\n(?=## )/)
    .map((section) => section.trim())
    .filter((section) => section.startsWith('## '))
    .map((content) => ({
      content,
      tokens: new Set(tokenize(content)),
    }));

  return cachedChunks;
}

/**
 * Recupera los fragmentos más parecidos a la consulta por coincidencia léxica.
 *
 * El puntaje es la proporción de términos de la consulta presentes en el fragmento,
 * escalada para caer en el mismo rango 0..1 que la similitud coseno, de modo que el
 * umbral de `prompt.ts` sirva igual en los dos modos.
 */
export function searchDemoChunks(question: string, limit = 3): RetrievedChunk[] {
  const queryTokens = tokenize(question);
  if (queryTokens.length === 0) return [];

  const scored = getChunks().map((chunk) => {
    const hits = queryTokens.filter((token) => {
      if (chunk.tokens.has(token)) return true;
      // Coincidencia por prefijo: "envio" contra "envios", "pago" contra "pagos".
      for (const candidate of chunk.tokens) {
        if (candidate.startsWith(token) || token.startsWith(candidate)) return true;
      }
      return false;
    }).length;

    return {
      content: chunk.content,
      source: 'faq-ejemplo.md (modo demo)',
      similarity: hits / queryTokens.length,
    };
  });

  return scored
    .filter((chunk) => chunk.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** `true` si el bot está corriendo sin Supabase, con el FAQ de ejemplo. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}
