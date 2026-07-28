-- Atomically finalize one study session.
create or replace function public.complete_study_session(
  p_book text,
  p_book_progress jsonb,
  p_topic text,
  p_mode text,
  p_ai_model text,
  p_current_step text,
  p_passage_book text,
  p_chapter integer,
  p_start_verse integer,
  p_end_verse integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set progress = coalesce(progress, '{}'::jsonb) || jsonb_build_object(p_book, p_book_progress),
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  insert into public.completed_passages (user_id, book, chapter, start_verse, end_verse)
  values (v_user_id, p_passage_book, p_chapter, p_start_verse, p_end_verse)
  on conflict (user_id, book, chapter, start_verse, end_verse) do nothing;

  insert into public.study_sessions (
    user_id, book, topic, mode, ai_model, current_step, messages,
    bible_verse, score, quiz_data, current_question_index, is_complete, updated_at
  )
  values (
    v_user_id, p_book, p_topic, p_mode, p_ai_model, p_current_step, '[]'::jsonb,
    null, 0, null, 0, true, now()
  )
  on conflict (user_id, book) do update set
    topic = excluded.topic,
    mode = excluded.mode,
    ai_model = excluded.ai_model,
    current_step = excluded.current_step,
    messages = excluded.messages,
    bible_verse = excluded.bible_verse,
    score = excluded.score,
    quiz_data = excluded.quiz_data,
    current_question_index = excluded.current_question_index,
    is_complete = excluded.is_complete,
    updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'user_id', v_user_id, 'book', p_book);
end;
$$;

revoke all on function public.complete_study_session(text, jsonb, text, text, text, text, text, integer, integer, integer) from public;
grant execute on function public.complete_study_session(text, jsonb, text, text, text, text, text, integer, integer, integer) to authenticated;
