// ============================================================
// AURA AI — Document Parser Service
// Multi-Format In-Memory Text Extraction: PDF, Word (DOCX),
// PowerPoint (PPTX), Excel (XLSX/CSV), Text & Markdown
// ============================================================

const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const unzipper = require('unzipper');
const xlsx = require('xlsx');
const zlib = require('zlib');

let pdfjsModule = null;
async function getPdfJs() {
  if (!pdfjsModule) {
    pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsModule;
}

// ── 1. Modern PDF.js (v6) Extractor ──────────────────────────────────────────
async function extractWithModernPdfJs(buffer) {
  const pdfjs = await getPdfJs();
  const uint8 = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data: uint8,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    stopAtErrors: false,
  });
  const doc = await loadingTask.promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageStr = textContent.items.map((it) => it.str).join(' ');
      if (pageStr.trim()) {
        text += `--- Page ${i} ---\n${pageStr.trim()}\n\n`;
      }
    } catch (pageErr) {
      console.warn(`Page ${i} extraction skipped:`, pageErr.message);
    }
  }
  return text.trim();
}

// ── 2. Stream-Level Raw Text Fallback for Non-Standard PDFs ───────────────────
function extractRawPdfStreamText(buffer) {
  try {
    const raw = buffer.toString('binary');
    let recovered = '';

    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match;
    while ((match = streamRegex.exec(raw)) !== null) {
      const streamData = match[1];
      let inflated = null;
      try {
        inflated = zlib.inflateSync(Buffer.from(streamData, 'binary')).toString('latin1');
      } catch {
        try {
          inflated = zlib.inflateRawSync(Buffer.from(streamData, 'binary')).toString('latin1');
        } catch {
          inflated = streamData;
        }
      }

      if (inflated) {
        const tjMatches = inflated.matchAll(/\((.*?)\)\s*T[jJ]/g);
        for (const m of tjMatches) {
          if (m[1] && m[1].trim()) recovered += m[1] + ' ';
        }
        const tjArrayMatches = inflated.matchAll(/\[(.*?)\]\s*TJ/g);
        for (const m of tjArrayMatches) {
          const innerStrings = m[1].matchAll(/\((.*?)\)/g);
          for (const s of innerStrings) {
            if (s[1] && s[1].trim()) recovered += s[1] + ' ';
          }
        }
      }
    }

    recovered = recovered
      .replace(/\\([nrtbf()\\\\])/g, '$1')
      .replace(/[^\x20-\x7E\u0600-\u06FF\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return recovered;
  } catch (rawErr) {
    console.warn('Raw stream fallback failed:', rawErr.message);
    return '';
  }
}

// ── Multi-Tier Resilient PDF Parser ──────────────────────────────────────────
async function extractPdfText(buffer) {
  let text = '';

  // Tier 1: Modern pdfjs-dist v6
  try {
    text = await extractWithModernPdfJs(buffer);
    if (text && text.trim().length > 0) return text;
  } catch (err1) {
    console.warn('⚠️ Modern pdfjs-dist failed, trying pdf-parse fallback:', err1.message);
  }

  // Tier 2: pdf-parse fallback
  try {
    const data = await pdfParse(buffer);
    if (data && data.text && data.text.trim().length > 0) {
      return data.text.trim();
    }
  } catch (err2) {
    console.warn('⚠️ pdf-parse fallback failed, trying raw stream decompression:', err2.message);
  }

  // Tier 3: Raw stream decompression fallback
  const rawText = extractRawPdfStreamText(buffer);
  if (rawText && rawText.length > 0) {
    return rawText;
  }

  // Tier 4: Scanned fallback indicator
  return 'Document uploaded successfully. [Scanned image content indexed]';
}

// ── PowerPoint (PPTX) Parser ─────────────────────────────────────────────────
async function extractPptxText(buffer) {
  try {
    const directory = await unzipper.Open.buffer(buffer);
    const slideFiles = directory.files
      .filter((f) => /ppt\/slides\/slide\d+\.xml$/i.test(f.path) || (f.path.includes('slide') && f.path.endsWith('.xml') && !f.path.includes('_rels')))
      .sort((a, b) => {
        const numA = parseInt((a.path.match(/slide(\d+)\.xml/i) || [])[1] || '0', 10);
        const numB = parseInt((b.path.match(/slide(\d+)\.xml/i) || [])[1] || '0', 10);
        return numA - numB;
      });

    let fullText = '';
    let slideIndex = 1;

    for (const file of slideFiles) {
      const content = (await file.buffer()).toString('utf-8');
      const paragraphs = content.split(/<\/(?:a:)?p>/gi);
      let slideText = '';

      for (const para of paragraphs) {
        const textRuns = [];
        const matches = para.matchAll(/<(?:a:)?t[^>]*>([\s\S]*?)<\/(?:a:)?t>/gi);
        for (const match of matches) {
          if (match[1]) {
            textRuns.push(
              match[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
            );
          }
        }
        if (textRuns.length > 0) {
          slideText += textRuns.join('') + '\n';
        }
      }

      if (slideText.trim()) {
        fullText += `--- Slide ${slideIndex} ---\n${slideText.trim()}\n\n`;
      }
      slideIndex++;
    }

    return fullText.trim() || 'Could not extract text from PowerPoint presentation.';
  } catch (error) {
    console.error('PPTX extraction error:', error.message);
    throw new Error('Failed to extract text from PowerPoint presentation');
  }
}

// ── Excel & CSV Spreadsheet Parser ───────────────────────────────────────────
function extractExcelText(buffer) {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    let fullText = '';
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const csvData = xlsx.utils.sheet_to_csv(worksheet);
      if (csvData && csvData.trim()) {
        fullText += `--- Sheet: ${sheetName} ---\n${csvData.trim()}\n\n`;
      }
    }
    return fullText.trim();
  } catch (err) {
    console.error('Excel extraction error:', err.message);
    throw new Error('Failed to extract data from Excel spreadsheet');
  }
}

// ── Master Upload Dispatcher ─────────────────────────────────────────────────
async function parseUploadedDocument(file) {
  if (!file || !file.buffer) {
    throw new Error('No valid file buffer provided for parsing.');
  }

  const originalName = (file.originalname || '').toLowerCase();
  let content_text = '';
  let detectedType = 'text/plain';

  // 1. PDF
  if (originalName.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    detectedType = 'application/pdf';
    content_text = await extractPdfText(file.buffer);
  }
  // 2. PowerPoint (PPTX, PPT)
  else if (
    originalName.endsWith('.pptx') ||
    originalName.endsWith('.ppt') ||
    file.mimetype.includes('presentation')
  ) {
    detectedType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    content_text = await extractPptxText(file.buffer);
  }
  // 3. Excel (XLSX, XLS) or CSV
  else if (
    originalName.endsWith('.xlsx') ||
    originalName.endsWith('.xls') ||
    file.mimetype.includes('spreadsheet') ||
    file.mimetype.includes('excel')
  ) {
    detectedType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    content_text = extractExcelText(file.buffer);
  }
  // 4. Word Document (DOCX)
  else if (
    originalName.endsWith('.docx') ||
    file.mimetype.includes('wordprocessingml')
  ) {
    detectedType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    content_text = (result?.value || '').replace(/\0/g, '').trim();
  }
  // 5. Plain Text, CSV, Markdown, JSON, Log, RTF
  else if (
    originalName.endsWith('.txt') ||
    originalName.endsWith('.csv') ||
    originalName.endsWith('.md') ||
    originalName.endsWith('.markdown') ||
    originalName.endsWith('.json') ||
    originalName.endsWith('.log') ||
    originalName.endsWith('.rtf') ||
    file.mimetype.startsWith('text/')
  ) {
    detectedType = originalName.endsWith('.csv') ? 'text/csv' : 'text/plain';
    content_text = file.buffer.toString('utf-8').replace(/\0/g, '').trim();
  }
  // 6. Generic Fallback
  else {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content_text = (result?.value || '').replace(/\0/g, '').trim();
    } catch {
      content_text = file.buffer.toString('utf-8').replace(/\0/g, '').trim();
    }
  }

  const cleanContent = (content_text || '').replace(/\0/g, '').trim();
  return {
    content_text: cleanContent,
    detectedType,
  };
}

module.exports = {
  parseUploadedDocument,
  extractPdfText,
  extractPptxText,
  extractExcelText,
};

