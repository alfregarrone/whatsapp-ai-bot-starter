/**
 * Ingesta de la base de conocimiento.
 *
 *   npm run ingest            → lee todo ./knowledge
 *   npm run ingest -- ruta.md → lee un archivo puntual
 *
 * Soporta .md, .txt y .csv. Cada archivo se parte en fragmentos, se embebe y se
 * guarda. Si el contenido no cambió (mismo checksum), se saltea.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chunkText } from '../src/lib/chunk';

const SUPPORTED = new Set(['.md', '.txt', '.csv']);
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR ?? 'knowledge';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

async function embed(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small',
      input: text.replace(/\n/g, ' '),
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

async function listFiles(target: string): Promise<string[]> {
  const info = await stat(target);
  if (info.isFile()) return [target];

  const entries = await readdir(target, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (SUPPORTED.has(extname(entry.name).toLowerCase())) files.push(full);
  }

  return files;
}

async function ingestFile(path: string): Promise<void> {
  const raw = await readFile(path, 'utf8');
  const checksum = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const source = basename(path);

  const existing = await supabase
    .from('documents')
    .select('id')
    .eq('source', source)
    .eq('checksum', checksum)
    .maybeSingle();

  if (existing.data?.id) {
    console.log(`= ${source} sin cambios`);
    return;
  }

  // Reemplazamos la versión anterior del mismo archivo.
  await supabase.from('documents').delete().eq('source', source);

  const document = await supabase
    .from('documents')
    .insert({ source, title: source, checksum })
    .select('id')
    .single();

  if (document.error) throw new Error(document.error.message);

  const chunks = chunkText(raw);
  console.log(`+ ${source}: ${chunks.length} fragmentos`);

  for (const [position, content] of chunks.entries()) {
    const embedding = await embed(content);
    const { error } = await supabase
      .from('chunks')
      .insert({ document_id: document.data.id, content, embedding, position });

    if (error) throw new Error(`chunk ${position}: ${error.message}`);
  }
}

async function main() {
  const target = process.argv[2] ?? KNOWLEDGE_DIR;

  let files: string[];
  try {
    files = await listFiles(target);
  } catch {
    console.error(`No pude leer "${target}". Creá la carpeta ${KNOWLEDGE_DIR}/ con tus .md`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`No hay archivos .md, .txt ni .csv en "${target}"`);
    process.exit(1);
  }

  for (const file of files) await ingestFile(file);
  console.log('Listo.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
