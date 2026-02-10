# Calvin PDF Setup

## 1) Apply SQL schema and RPC
Run `JT-BIBLE/supabase/sql/calvin_chunks.sql` in Supabase SQL Editor.

This creates:
- `public.calvin_chunks`
- `public.search_calvin_chunks(query_text, match_count)`
- RLS read policy for authenticated users

## 2) Ensure PDF path
Current default PDF path:
- `JT-BIBLE/assets/docs/calvin_institutes_en.pdf`

Override with env:
- `CALVIN_PDF_PATH`

## 3) Install deps
```powershell
cd JT-BIBLE
npm install
```

## 4) Ingest PDF chunks into Supabase
Set env and run:
```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
npm run ingest:calvin
```

Optional tuning:
```powershell
$env:CALVIN_CHUNK_SIZE="1400"
$env:CALVIN_CHUNK_OVERLAP="220"
$env:CALVIN_SOURCE_NAME="calvin_institutes_en.pdf"
```

## 5) Runtime behavior
When the user sends a normal message (not system control message), app now:
1. translates Korean query to English retrieval keywords (Gemini proxy)
2. calls `search_calvin_chunks`
2. injects top chunks into model prompt
3. enforces citation tags in final answer

## 6) Web interpretation search for Gemini/ChatGPT
Added Edge Function:
- `supabase/functions/web-search-proxy/index.ts`

Required secret:
- `SERPAPI_API_KEY`

Deploy:
```powershell
supabase functions deploy web-search-proxy
supabase secrets set SERPAPI_API_KEY=YOUR_SERPAPI_KEY
```

Main code:
- `services/calvinCitationService.ts`
- `hooks/useAIConversation.ts`
