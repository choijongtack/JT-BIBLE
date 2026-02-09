import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const DEFAULT_PDF_PATH = path.join(projectRoot, 'assets', 'docs', 'calvin_institutes_en.pdf');
const PDF_PATH = process.env.CALVIN_PDF_PATH || DEFAULT_PDF_PATH;
const SOURCE_PDF = process.env.CALVIN_SOURCE_NAME || path.basename(PDF_PATH);
const CHUNK_SIZE = Number(process.env.CALVIN_CHUNK_SIZE || 1400);
const OVERLAP = Number(process.env.CALVIN_CHUNK_OVERLAP || 220);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeSpaces(text) {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkPageText(pageText, pageNo, chunkSize, overlap) {
  const clean = normalizeSpaces(pageText);
  if (!clean) return [];

  const chunks = [];
  let i = 0;
  let chunkIndex = 1;

  while (i < clean.length) {
    let end = Math.min(i + chunkSize, clean.length);
    if (end < clean.length) {
      const lastBoundary = Math.max(
        clean.lastIndexOf('\n', end),
        clean.lastIndexOf('. ', end),
        clean.lastIndexOf(' ', end),
      );
      if (lastBoundary > i + Math.floor(chunkSize * 0.6)) end = lastBoundary;
    }

    const content = clean.slice(i, end).trim();
    if (content.length > 30) {
      chunks.push({
        source_pdf: SOURCE_PDF,
        page_from: pageNo,
        page_to: pageNo,
        chunk_index: chunkIndex++,
        content,
      });
    }

    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }

  return chunks;
}

async function extractPages(pdfPath) {
  const data = await fs.readFile(pdfPath);
  const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push({ pageNo, text: normalizeSpaces(text) });
  }

  return pages;
}

async function upsertInBatches(rows, batchSize = 200) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('calvin_chunks')
      .upsert(batch, { onConflict: 'source_pdf,page_from,page_to,chunk_index' });

    if (error) {
      throw new Error(`Supabase upsert failed at batch ${i / batchSize + 1}: ${error.message}`);
    }

    console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)} (${batch.length} rows)`);
  }
}

async function main() {
  console.log(`Reading PDF: ${PDF_PATH}`);
  const pages = await extractPages(PDF_PATH);
  console.log(`Extracted pages: ${pages.length}`);

  const rows = pages.flatMap(({ pageNo, text }) => chunkPageText(text, pageNo, CHUNK_SIZE, OVERLAP));
  if (rows.length === 0) {
    throw new Error('No chunks extracted from PDF');
  }

  console.log(`Prepared chunks: ${rows.length}`);
  await upsertInBatches(rows);
  console.log('Calvin PDF ingestion completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

