-- Phase 4: Copy existing profiles.progress data into the normalized tables.
-- This is additive and does not modify or delete profiles.progress.

with source_sessions as (
  select
    p.id as user_id,
    entry.key as book,
    entry.value->'lastSession' as session_data
  from public.profiles p
  cross join lateral jsonb_each(coalesce(p.progress, '{}'::jsonb)) as entry
  where entry.value ? 'lastSession'
), parsed_sessions as (
  select
    user_id,
    book,
    session_data,
    regexp_match(
      session_data->>'topic',
      '^[^ ]+ ([0-9]+):([0-9]+)(?:-([0-9]+))?'
    ) as reference
  from source_sessions
  where jsonb_typeof(session_data) = 'object'
    and coalesce(session_data->>'topic', '') <> ''
)
insert into public.study_sessions (
  user_id, book, topic, mode, ai_model, current_step, messages,
  bible_verse, score, quiz_data, current_question_index, is_complete
)
select
  user_id,
  book,
  session_data->>'topic',
  coalesce(session_data->>'mode', 'general'),
  coalesce(session_data->>'aiModel', 'gemini'),
  coalesce(session_data->>'currentStep', 'OBSERVATION'),
  coalesce(session_data->'messages', '[]'::jsonb),
  session_data->>'bibleVerse',
  coalesce((session_data->>'score')::integer, 0),
  session_data->'quizData',
  coalesce((session_data->>'currentQuestionIndex')::integer, 0),
  coalesce((session_data->>'isComplete')::boolean, false)
from parsed_sessions
on conflict (user_id, book) do nothing;

with source_sessions as (
  select
    p.id as user_id,
    entry.key as book,
    entry.value->'lastSession' as session_data
  from public.profiles p
  cross join lateral jsonb_each(coalesce(p.progress, '{}'::jsonb)) as entry
  where entry.value ? 'lastSession'
), parsed_sessions as (
  select
    user_id,
    book,
    session_data,
    regexp_match(
      session_data->>'topic',
      '^[^ ]+ ([0-9]+):([0-9]+)(?:-([0-9]+))?'
    ) as reference
  from source_sessions
  where coalesce((session_data->>'isComplete')::boolean, false)
)
insert into public.completed_passages (
  user_id, book, chapter, start_verse, end_verse
)
select
  user_id,
  book,
  (reference)[1]::integer,
  (reference)[2]::integer,
  coalesce((reference)[3]::integer, (reference)[2]::integer)
from parsed_sessions
where reference is not null
on conflict (user_id, book, chapter, start_verse, end_verse) do nothing;
