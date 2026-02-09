-- Calvin Institutes PDF chunks and full-text search
create table if not exists public.calvin_chunks (
  id uuid primary key default gen_random_uuid(),
  source_pdf text not null,
  page_from int not null,
  page_to int not null,
  chunk_index int not null,
  content text not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_pdf, page_from, page_to, chunk_index)
);

create index if not exists calvin_chunks_search_vector_idx
  on public.calvin_chunks using gin (search_vector);

create index if not exists calvin_chunks_page_idx
  on public.calvin_chunks (page_from, page_to);

create or replace function public.search_calvin_chunks(
  query_text text,
  match_count int default 5
)
returns table (
  id uuid,
  page_from int,
  page_to int,
  content text,
  rank real
)
language sql
stable
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(query_text, '')) as tsq
  )
  select
    c.id,
    c.page_from,
    c.page_to,
    c.content,
    ts_rank(c.search_vector, q.tsq) as rank
  from public.calvin_chunks c, q
  where c.search_vector @@ q.tsq
  order by rank desc, c.page_from asc
  limit greatest(1, least(match_count, 20));
$$;

alter table public.calvin_chunks enable row level security;

drop policy if exists "read calvin chunks" on public.calvin_chunks;
create policy "read calvin chunks"
on public.calvin_chunks
for select
to authenticated
using (true);

