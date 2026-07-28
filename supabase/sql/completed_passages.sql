-- Phase 1: Store completed study ranges separately from profiles.progress.
-- Apply this migration in the Supabase SQL editor after reviewing it.

create table if not exists public.completed_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book text not null,
  chapter integer not null check (chapter > 0),
  start_verse integer not null check (start_verse > 0),
  end_verse integer not null check (end_verse >= start_verse),
  completed_at timestamptz not null default now(),
  constraint completed_passages_unique_range
    unique (user_id, book, chapter, start_verse, end_verse)
);

create index if not exists completed_passages_user_book_idx
  on public.completed_passages (user_id, book, chapter, start_verse);

alter table public.completed_passages enable row level security;

drop policy if exists "Users can read their completed passages"
  on public.completed_passages;
create policy "Users can read their completed passages"
  on public.completed_passages
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their completed passages"
  on public.completed_passages;
create policy "Users can insert their completed passages"
  on public.completed_passages
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their completed passages"
  on public.completed_passages;
create policy "Users can delete their completed passages"
  on public.completed_passages
  for delete
  using (auth.uid() = user_id);
