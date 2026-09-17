-- Esquema del bot. Pegalo en el SQL Editor de Supabase (o corré `supabase db push`).
-- Dimensión 1536 = text-embedding-3-small. Si cambiás de modelo, cambiá el número.

create extension if not exists vector;

-- ── Base de conocimiento ────────────────────────────────────────────────────

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,                       -- nombre de archivo o URL
  title       text,
  checksum    text not null,                       -- evita reingestar lo mismo
  created_at  timestamptz not null default now(),
  unique (source, checksum)
);

create table if not exists chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  content      text not null,
  embedding    vector(1536) not null,
  position     int not null,
  created_at   timestamptz not null default now()
);

-- Índice aproximado: rápido y suficiente para bases de FAQ.
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists chunks_document_idx on chunks(document_id);

-- ── Conversaciones ──────────────────────────────────────────────────────────

create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,
  escalated   boolean not null default false,      -- derivada a una persona
  created_at  timestamptz not null default now()
);

create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  external_id      text unique,                    -- id del mensaje en WhatsApp
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on messages(conversation_id, created_at desc);

-- ── Búsqueda por similitud ──────────────────────────────────────────────────

create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (content text, source text, similarity float)
language sql stable
as $$
  select
    c.content,
    d.source,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Todo cerrado por defecto. El bot escribe con el service role, que ignora RLS.
-- Cuando agregues un panel con login, sumá políticas explícitas acá y nada más.

alter table documents     enable row level security;
alter table chunks        enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;

-- Sin políticas = ningún cliente anónimo o autenticado puede leer ni escribir.
