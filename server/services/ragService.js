// ============================================================
// AURA AI — Vector RAG Pipeline Service
// Handles Page-Aware Semantic Chunking, Gemini Embeddings,
// Database Indexing, and Semantic Similarity Retrieval
// ============================================================

const { GoogleGenAI } = require('@google/genai');
const pool = require('../db');

// Helper to normalize integer or UUID identifiers
const normalizeId = (id) => {
  if (id === null || id === undefined) return null;
  const raw = String(id).trim();
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return raw;
};

// Cache pgvector availability check
let isPgVectorAvailable = null;

async function checkPgVectorSupport() {
  if (isPgVectorAvailable !== null) return isPgVectorAvailable;
  try {
    const res = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'embedding_vec'"
    );
    isPgVectorAvailable = (res.rows && res.rows.length > 0);
  } catch {
    isPgVectorAvailable = false;
  }
  return isPgVectorAvailable;
}

// Helper to get active Gemini client dynamically
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'your_actual_gemini_api_key_here' && apiKey.trim().length > 10) {
    try {
      return new GoogleGenAI({ apiKey: apiKey.trim() });
    } catch (e) {
      console.warn('⚠️  Gemini Client Init Warning in RAG Service:', e.message);
    }
  }
  return null;
}

// ── 1. Page-Aware Semantic Chunking ──────────────────────────────────────────
// Splits extracted document text into overlapping chunks (~800 chars, ~150 overlap)
// while preserving page_number metadata from "--- Page X ---" or "--- Slide X ---" markers.
function chunkDocumentText(text, targetChunkSize = 800, overlap = 150) {
  if (!text || typeof text !== 'string' || !text.trim()) return [];

  const chunks = [];
  const pageRegex = /---\s*(?:Page|Slide|Sheet:?)\s*([^-\n]+)\s*---/gi;
  let match;
  const sections = [];
  let lastIndex = 0;
  let currentPage = 1;

  while ((match = pageRegex.exec(text)) !== null) {
    const rawPageNum = match[1].trim();
    const parsedNum = parseInt(rawPageNum, 10);
    const pageNum = isNaN(parsedNum) ? 1 : Math.max(1, parsedNum);

    if (match.index > lastIndex) {
      const sectionText = text.substring(lastIndex, match.index).trim();
      if (sectionText) {
        sections.push({ page: currentPage, text: sectionText });
      }
    }
    currentPage = pageNum;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const trailingText = text.substring(lastIndex).trim();
    if (trailingText) {
      sections.push({ page: currentPage, text: trailingText });
    }
  }

  // If no markers were found, treat the whole document as Page 1
  if (sections.length === 0) {
    sections.push({ page: 1, text: text.trim() });
  }

  let globalChunkIndex = 0;

  for (const section of sections) {
    const pageNum = section.page;
    const secText = section.text.replace(/\0/g, '').trim();
    if (!secText) continue;

    if (secText.length <= targetChunkSize) {
      chunks.push({
        chunk_text: secText,
        page_number: pageNum,
        chunk_index: globalChunkIndex++,
      });
      continue;
    }

    // Split large section with sliding window overlap
    let start = 0;
    while (start < secText.length) {
      let end = start + targetChunkSize;

      if (end >= secText.length) {
        end = secText.length;
      } else {
        // Find natural semantic break point (paragraph, newline, sentence, or space)
        const windowStart = Math.max(start, end - 120);
        const windowEnd = Math.min(secText.length, end + 40);
        const slice = secText.substring(windowStart, windowEnd);

        const relParagraph = slice.lastIndexOf('\n\n');
        const relSentence = slice.search(/[.!?]\s+[A-Z0-9]/);
        const relNewline = slice.lastIndexOf('\n');
        const relSpace = slice.lastIndexOf(' ');

        if (relParagraph !== -1 && relParagraph > 20) {
          end = windowStart + relParagraph + 2;
        } else if (relSentence !== -1 && relSentence > 20) {
          end = windowStart + relSentence + 2;
        } else if (relNewline !== -1 && relNewline > 20) {
          end = windowStart + relNewline + 1;
        } else if (relSpace !== -1 && relSpace > 20) {
          end = windowStart + relSpace + 1;
        }
      }

      const chunkContent = secText.substring(start, end).trim();
      if (chunkContent.length >= 15) {
        chunks.push({
          chunk_text: chunkContent,
          page_number: pageNum,
          chunk_index: globalChunkIndex++,
        });
      }

      if (end >= secText.length) break;
      start = Math.max(start + 1, end - overlap);
    }
  }

  return chunks;
}

// ── In-Memory Query Embedding LRU Cache (Fast < 1ms retrieval for repeated/similar queries) ──
const queryEmbeddingCache = new Map();

function getCachedQueryEmbedding(query) {
  if (!query) return null;
  const key = query.trim().toLowerCase();
  if (queryEmbeddingCache.has(key)) {
    const val = queryEmbeddingCache.get(key);
    queryEmbeddingCache.delete(key);
    queryEmbeddingCache.set(key, val);
    return val;
  }
  return null;
}

function setCachedQueryEmbedding(query, embedding) {
  if (!query || !embedding) return;
  const key = query.trim().toLowerCase();
  if (queryEmbeddingCache.size >= 500) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    queryEmbeddingCache.delete(oldestKey);
  }
  queryEmbeddingCache.set(key, embedding);
}

// ── 2. Embedding Generation (Parallelized & High-Throughput) ───────────────────
// Uses gemini-embedding-001 (768 dimensions) with text-embedding-004 fallback
async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const client = getAiClient();
  if (!client) {
    throw new Error('Gemini API client not initialized. Check GEMINI_API_KEY.');
  }

  const candidateModels = ['gemini-embedding-001', 'text-embedding-004'];

  const embedSingleBatch = async (batch) => {
    let batchResult = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const response = await client.models.embedContent({
          model: modelName,
          contents: batch,
          config: { outputDimensionality: 768 },
        });

        if (response?.embeddings && response.embeddings.length > 0) {
          batchResult = response.embeddings.map((e) => e.values);
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!batchResult || batchResult.length !== batch.length) {
      console.warn('⚠️ Embedding generation fallback (zeros):', lastError?.message || 'Empty response');
      return batch.map(() => new Array(768).fill(0));
    }
    return batchResult;
  };

  const batchSize = 25;
  const batches = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }

  // Execute batches concurrently in parallel Promise pools of 4 without artificial sleep delays
  const CONCURRENCY = 4;
  const allEmbeddings = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    const groupResults = await Promise.all(group.map((b) => embedSingleBatch(b)));
    for (const res of groupResults) {
      allEmbeddings.push(...res);
    }
  }

  return allEmbeddings;
}

// ── 3. Index Document Chunks into Database ───────────────────────────────────
async function indexDocumentChunks(documentId, workspaceId, contentText) {
  if (!documentId || !workspaceId || !contentText || !contentText.trim()) {
    return 0;
  }

  const parsedDocId = normalizeId(documentId);
  const parsedWsId = normalizeId(workspaceId);

  // Remove any preexisting chunks for this document
  await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [parsedDocId]);

  const chunks = chunkDocumentText(contentText);
  if (chunks.length === 0) return 0;

  const chunkTexts = chunks.map((c) => c.chunk_text);
  let embeddings = [];
  try {
    embeddings = await generateEmbeddings(chunkTexts);
  } catch (embedErr) {
    console.warn(`⚠️ Embedding generation failed for document ${parsedDocId}:`, embedErr.message);
    embeddings = chunkTexts.map(() => new Array(768).fill(0));
  }

  const hasPgVector = await checkPgVectorSupport();

  // Fast parallel batch insert into document_chunks table
  const insertBatchSize = 25;
  for (let i = 0; i < chunks.length; i += insertBatchSize) {
    const chunkBatch = chunks.slice(i, i + insertBatchSize);
    await Promise.all(
      chunkBatch.map(async (chunk, batchIdx) => {
        const overallIdx = i + batchIdx;
        const emb = embeddings[overallIdx] || new Array(768).fill(0);
        const embJson = JSON.stringify(emb);

        if (hasPgVector) {
          const vecString = `[${emb.join(',')}]`;
          return pool.query(
            `INSERT INTO document_chunks (document_id, workspace_id, page_number, chunk_index, chunk_text, embedding, embedding_vec)
             VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
            [parsedDocId, parsedWsId, chunk.page_number, chunk.chunk_index, chunk.chunk_text, embJson, vecString]
          );
        } else {
          return pool.query(
            `INSERT INTO document_chunks (document_id, workspace_id, page_number, chunk_index, chunk_text, embedding)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [parsedDocId, parsedWsId, chunk.page_number, chunk.chunk_index, chunk.chunk_text, embJson]
          );
        }
      })
    );
  }

  console.log(`✅ Indexed ${chunks.length} chunks for document ID ${parsedDocId} (Workspace ${parsedWsId})`);
  return chunks.length;
}

// ── 4. Backfill Helper: Ensure All Workspace Documents are Indexed ───────────
async function ensureWorkspaceIndexed(workspaceId) {
  try {
    const parsedWsId = normalizeId(workspaceId);
    const unindexed = await pool.query(
      `SELECT d.id, d.title, d.content_text
       FROM documents d
       WHERE d.workspace_id = $1
         AND length(trim(d.content_text)) > 0
         AND NOT EXISTS (
           SELECT 1 FROM document_chunks c WHERE c.document_id = d.id
         )`,
      [parsedWsId]
    );

    if (unindexed.rows && unindexed.rows.length > 0) {
      console.log(`🔄 Backfilling ${unindexed.rows.length} unindexed document(s) in workspace ${parsedWsId}...`);
      for (const doc of unindexed.rows) {
        await indexDocumentChunks(doc.id, parsedWsId, doc.content_text);
      }
    }
  } catch (err) {
    console.warn('⚠️ Backfill indexing check failed:', err.message);
  }
}

// ── 5. Mathematical Cosine Similarity (In-Memory Fallback) ───────────────────
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── 6. Query Intent Detection for Broad Summaries ────────────────────────────
function isBroadSummaryOrCompareQuery(text) {
  const lower = String(text || '').toLowerCase().trim();
  return (
    lower.includes('all document') ||
    lower.includes('all file') ||
    lower.includes('all files') ||
    lower.includes('all documents') ||
    lower.includes('summarize all') ||
    lower.includes('summary of all') ||
    lower.includes('all cv') ||
    lower.includes('all resumes') ||
    lower.includes('rank') ||
    lower.includes('compare') ||
    lower.includes('list files') ||
    lower.includes('overview') ||
    lower.includes('har file') ||
    lower.includes('saari file') ||
    lower.includes('tamam file')
  );
}

// ── 7. Semantic Retrieval (retrieveRelevantChunks) ───────────────────────────
// Embeds user query, retrieves top K chunks, and enriches with multi-doc context if needed
async function retrieveRelevantChunks(workspaceId, question, topK = 8) {
  const parsedWsId = normalizeId(workspaceId);
  if (!parsedWsId) return { relevantChunks: [], allDocuments: [] };

  // 1. Ensure all documents in this workspace are chunked and indexed
  await ensureWorkspaceIndexed(parsedWsId);

  // 2. Fetch list of all active documents in this workspace
  const docsRes = await pool.query(
    'SELECT id, title FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC',
    [parsedWsId]
  );
  const allDocuments = docsRes.rows || [];
  if (allDocuments.length === 0) {
    return { relevantChunks: [], allDocuments: [] };
  }

  // 3. Generate query embedding (with fast LRU Cache lookup first)
  let queryEmbedding = getCachedQueryEmbedding(question);
  if (!queryEmbedding) {
    try {
      const qEmbeddings = await generateEmbeddings([question.trim()]);
      if (qEmbeddings && qEmbeddings.length > 0 && qEmbeddings[0].some((v) => v !== 0)) {
        queryEmbedding = qEmbeddings[0];
        setCachedQueryEmbedding(question, queryEmbedding);
      }
    } catch (err) {
      console.warn('⚠️ Query embedding failed:', err.message);
    }
  }

  const hasPgVector = await checkPgVectorSupport();
  let rankedChunks = [];

  // 4A. PgVector Retrieval Path (if extension is installed)
  if (hasPgVector && queryEmbedding) {
    try {
      const vecString = `[${queryEmbedding.join(',')}]`;
      const vecRes = await pool.query(
        `SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.chunk_text,
                d.title as document_title,
                1 - (c.embedding_vec <=> $2::vector) as similarity_score
         FROM document_chunks c
         JOIN documents d ON c.document_id = d.id
         WHERE c.workspace_id = $1
         ORDER BY c.embedding_vec <=> $2::vector ASC
         LIMIT $3`,
        [parsedWsId, vecString, topK]
      );
      rankedChunks = (vecRes.rows || []).map((row) => ({
        ...row,
        similarity_score: Math.max(0, parseFloat(row.similarity_score) || 0),
      }));
    } catch (pgVecErr) {
      console.warn('⚠️ pgvector <=> query error, falling back to JSONB:', pgVecErr.message);
      rankedChunks = [];
    }
  }

  // 4B. JSONB In-Memory Cosine Similarity Path (Fast & 100% Reliable across all systems)
  if (rankedChunks.length === 0) {
    const chunksRes = await pool.query(
      `SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.chunk_text, c.embedding,
              d.title as document_title
       FROM document_chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.workspace_id = $1`,
      [parsedWsId]
    );

    const rawChunks = chunksRes.rows || [];

    if (queryEmbedding) {
      const scored = rawChunks.map((chunk) => {
        let emb = chunk.embedding;
        if (typeof emb === 'string') {
          try { emb = JSON.parse(emb); } catch { emb = null; }
        }
        const score = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
        return {
          id: chunk.id,
          document_id: chunk.document_id,
          document_title: chunk.document_title,
          page_number: chunk.page_number,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.chunk_text,
          similarity_score: score,
        };
      });

      scored.sort((a, b) => b.similarity_score - a.similarity_score);
      rankedChunks = scored.slice(0, topK);
    } else {
      // Lexical fallback if query embedding failed
      const queryLower = question.toLowerCase();
      const terms = queryLower.split(/\s+/).filter((w) => w.length > 3);
      const scored = rawChunks.map((chunk) => {
        const textLower = chunk.chunk_text.toLowerCase();
        let matches = 0;
        for (const t of terms) {
          if (textLower.includes(t)) matches++;
        }
        return {
          id: chunk.id,
          document_id: chunk.document_id,
          document_title: chunk.document_title,
          page_number: chunk.page_number,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.chunk_text,
          similarity_score: matches > 0 ? (matches / terms.length) : 0.05,
        };
      });
      scored.sort((a, b) => b.similarity_score - a.similarity_score);
      rankedChunks = scored.slice(0, topK);
    }
  }

  // 5. Multi-Document Coverage for Broad Summaries & Comparisons
  // If the query asks about "all files" or "all documents", include representative
  // intro chunks (chunk_index = 0) from any document not present in rankedChunks
  const isBroad = isBroadSummaryOrCompareQuery(question);
  if (isBroad && allDocuments.length > 1) {
    const includedDocIds = new Set(rankedChunks.map((c) => c.document_id));
    const missingDocIds = allDocuments
      .map((d) => d.id)
      .filter((id) => !includedDocIds.has(id));

    if (missingDocIds.length > 0) {
      try {
        const introRes = await pool.query(
          `SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.chunk_text,
                  d.title as document_title
           FROM document_chunks c
           JOIN documents d ON c.document_id = d.id
           WHERE c.workspace_id = $1
             AND c.document_id = ANY($2)
             AND c.chunk_index = 0
           LIMIT 10`,
          [parsedWsId, missingDocIds]
        );

        const introChunks = (introRes.rows || []).map((row) => ({
          ...row,
          similarity_score: 0.50,
          is_representative: true,
        }));

        rankedChunks.push(...introChunks);
      } catch (introErr) {
        console.warn('⚠️ Could not load representative document chunks:', introErr.message);
      }
    }
  }

  return {
    relevantChunks: rankedChunks,
    allDocuments,
  };
}

module.exports = {
  chunkDocumentText,
  generateEmbeddings,
  indexDocumentChunks,
  ensureWorkspaceIndexed,
  cosineSimilarity,
  retrieveRelevantChunks,
};
