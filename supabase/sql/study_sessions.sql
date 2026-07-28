-- Phase 3: Store the latest resumable session separately from profiles.progress.

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book text not null,
  topic text not null,
  mode text not null check (mode in ('general', 'advanced')),
  ai_model text not null check (ai_model in ('gemini', 'perplexity', 'chatgpt')),
  current_step text not null,
  messages jsonb not null default '[]'::jsonb,
  bible_verse text,
  score integer not null default 0,
  quiz_data jsonb,
  current_question_index integer not null default 0,
  is_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint study_sessions_user_book_unique unique (user_id, book)
);

create index if not exists study_sessions_user_idx
  on public.study_sessions (user_id, updated_at desc);

alter table public.study_sessions enable row level security;

drop policy if exists "Users can read their study sessions" on public.study_sessions;
create policy "Users can read their study sessions"
  on public.study_sessions for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their study sessions" on public.study_sessions;
create policy "Users can insert their study sessions"
  on public.study_sessions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their study sessions" on public.study_sessions;
create policy "Users can update their study sessions"
  on public.study_sessions for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their study sessions" on public.study_sessions;
create policy "Users can delete their study sessions"
  on public.study_sessions for delete using (auth.uid() = user_id);
