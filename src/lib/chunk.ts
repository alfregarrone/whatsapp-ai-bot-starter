/**
 * Partido de documentos en fragmentos para recuperación.
 *
 * El objetivo no es "cortar cada N caracteres" sino cortar donde el texto ya
 * tiene una separación natural (párrafos, luego oraciones) y solo caer al corte
 * duro cuando no queda otra. Un fragmento que parte una oración al medio
 * recupera peor y se lee peor cuando el modelo lo cita.
 */

export interface ChunkOptions {
  /** Tamaño objetivo en caracteres. Por defecto 900. */
  size?: number;
  /** Solapamiento entre fragmentos consecutivos, en caracteres. Por defecto 150. */
  overlap?: number;
}

/** Normaliza saltos de línea y espacios repetidos sin destruir los párrafos. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoUnits(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 1500) {
      units.push(paragraph.trim());
      continue;
    }
    // Párrafo muy largo: bajamos a oraciones.
    const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [paragraph];
    for (const sentence of sentences) units.push(sentence.trim());
  }

  return units.filter(Boolean);
}

/**
 * Divide un texto en fragmentos de tamaño aproximado, con solapamiento.
 *
 * @example
 * chunkText(textoLargo, { size: 800, overlap: 100 })
 */
export function chunkText(input: string, options: ChunkOptions = {}): string[] {
  const { size = 900, overlap = 150 } = options;

  if (size <= 0) throw new Error('size debe ser mayor que 0');
  if (overlap < 0 || overlap >= size) throw new Error('overlap debe estar entre 0 y size-1');

  const text = normalizeText(input);
  if (!text) return [];
  if (text.length <= size) return [text];

  const units = splitIntoUnits(text);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    current = overlap > 0 ? current.slice(-overlap) : '';
  };

  for (const unit of units) {
    // Unidad más larga que el chunk: corte duro.
    if (unit.length > size) {
      flush();
      for (let i = 0; i < unit.length; i += size - overlap) {
        chunks.push(unit.slice(i, i + size).trim());
      }
      current = '';
      continue;
    }

    if (current.length + unit.length + 2 > size) flush();
    current = current ? `${current}\n\n${unit}` : unit;
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 0);
}
