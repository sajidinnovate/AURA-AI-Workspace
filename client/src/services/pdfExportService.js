import { jsPDF } from 'jspdf';

// ── Color Palette Constants ──────────────────────────────────────────────────
const C = {
  navy: [15, 23, 42],          // #0F172A - Headings & Primary Text
  slate: [51, 65, 85],         // #334155 - Body Text
  muted: [100, 116, 139],      // #64748B - Labels, Dates, Secondary
  lightMuted: [148, 163, 184], // #94A3B8 - Dividers & Footers
  indigo: [79, 70, 229],       // #4F46E5 - Brand Indigo
  indigoBar: [99, 102, 241],   // #6366F1 - Left Accent Bar
  indigoBg: [238, 242, 255],   // #EEF2FF - Soft Badge Fill
  indigoBorder: [199, 210, 254],// #C7D2FE
  emerald: [5, 150, 105],      // #059669 - Verified Badge Text
  emeraldBg: [236, 253, 245],  // #ECFDF5 - Verified Badge Fill
  emeraldBorder: [167, 243, 208],// #A7F3D0
  cardBg: [255, 255, 255],     // White
  userBg: [248, 250, 252],     // #F8FAFC
  border: [226, 232, 240],     // #E2E8F0
  codeBg: [241, 245, 249],     // #F1F5F9
};

/**
 * Sanitizes input text into clean ASCII / standard printable Latin characters.
 * Replaces typographic quotes, dashes, and copyright symbols with ASCII equivalents,
 * and strips non-ASCII emojis, surrogate pairs, and pictographs so jsPDF Helvetica
 * never produces garbled characters or wide letter-spacing artifacts.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeForPdf(raw) {
  if (!raw) return '';
  let text = String(raw);

  // 1. Map smart typography to safe ASCII equivalents
  text = text
    .replace(/[\u201C\u201D]/g, '"')   // Smart double quotes
    .replace(/[\u2018\u2019]/g, "'")   // Smart single quotes
    .replace(/[\u2013\u2014]/g, '-')   // En-dash and Em-dash
    .replace(/\u2026/g, '...')         // Ellipsis
    .replace(/©/g, '(c)')              // Copyright
    .replace(/®/g, '(R)')              // Registered
    .replace(/™/g, '(TM)')             // Trademark
    .replace(/[•·]/g, '*');            // Bullets

  // 2. Strip Unicode emojis, surrogate pairs, and pictographs
  // Surrogate pairs: covers all modern emojis (SMP plane 1: 0x1F000 - 0x1FAFF)
  text = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  // Dingbats, misc symbols, variation selectors, zero-width chars
  text = text.replace(/[\u2600-\u27BF\uE000-\uF8FF\u200B-\u200D\uFE00-\uFE0F\uFEFF]/g, '');
  // Explicit common symbols
  text = text.replace(/[✦📄👁️⚡📊🔍✓❌⚠️©]/g, '');

  // 3. Strip remaining non-printable / high Unicode characters outside safe Latin range
  // Preserves printable ASCII (0x20-0x7E), newlines (\n), tabs (\t), and standard European accents (0xC0-0xFF)
  text = text.replace(/[^\x20-\x7E\n\r\t\u00C0-\u00FF]/g, '');

  return text;
}

/**
 * Strips raw markdown syntax while preserving textual meaning.
 * Removes bold (**...**), italics (*...* and _..._),
 * inline code (`...`), markdown links, and emojis.
 *
 * @param {string} raw
 * @returns {string}
 */
export function stripMarkdownSymbols(raw) {
  if (!raw) return '';
  let text = String(raw);

  // 1. Strip bold **...** and __...__
  text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1');

  // 2. Strip italics *...* and _..._
  text = text.replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1');

  // 3. Strip inline code `...`
  text = text.replace(/`([^`]+)`/g, '$1');

  // 4. Strip markdown links [text](url) -> text
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');

  // 5. Strip images ![alt](url)
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');

  // 6. Strip leading ### headings
  text = text.replace(/^#{1,6}\s+/gm, '');

  // 7. Strip leftover stray asterisks or backticks
  text = text.replace(/[*`]/g, '');

  // 8. Sanitize against non-ASCII emojis and surrogate pairs
  text = sanitizeForPdf(text);

  return text.trim();
}

/**
 * Checks whether a message is an initial system/welcome greeting that should be filtered
 * out so the exported report starts directly with the user's first query (#1).
 *
 * @param {Object} msg
 * @returns {boolean}
 */
function isSystemGreetingMessage(msg) {
  if (!msg || !msg.text) return true;
  if (msg.id === 'init' || String(msg.id || '').startsWith('init_')) return true;

  const clean = sanitizeForPdf(String(msg.text || '')).toLowerCase().trim();
  if (!clean) return true;

  return (
    clean.startsWith('new chat session started') ||
    clean.startsWith('welcome to') ||
    clean.startsWith('welcome!') ||
    clean.includes('is ready. ask any question') ||
    clean.includes('is ready. ask any question!') ||
    clean.startsWith('chat history cleared')
  );
}

/**
 * Generates and downloads a clean, vector-rendered Executive PDF Report using pure jsPDF.
 * 
 * @param {Object} options
 * @param {string} options.workspaceName
 * @param {number} options.documentsCount
 * @param {Array}  options.messages
 * @param {string} [options.activeDocumentTitle]
 */
export async function exportChatToPdf({
  workspaceName = 'Workspace',
  documentsCount = 0,
  messages = [],
  activeDocumentTitle = null,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginL = 15;
  const marginR = 15;
  const marginT = 16;
  const marginB = 16;
  const usableW = pageWidth - marginL - marginR; // 180mm
  const bottomLimit = pageHeight - marginB - 6;

  let currentY = marginT;

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const cleanWsName = sanitizeForPdf(workspaceName || 'Workspace').trim();
  const safeWsFilename = cleanWsName
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const filename = `AURA-${safeWsFilename || 'Workspace'}-Chat-Report.pdf`;

  // ── 1. Skip Initial System Greeting Messages ───────────────────────────────
  // If the conversation contains actual user queries, filter out welcome/init messages
  // so the report begins directly with User Query (#1) and AI Response (#2).
  const hasUserQueries = (messages || []).some((m) => m.sender === 'user');

  let filteredMessages = (messages || []).filter((m) => {
    if (!m.text || !String(m.text).trim()) return false;
    if (hasUserQueries && isSystemGreetingMessage(m)) {
      return false;
    }
    return true;
  });

  // If filtering left nothing (e.g. empty chat with only greeting), keep fallback
  const messagesToRender = filteredMessages.length > 0
    ? filteredMessages
    : (messages || []).filter((m) => m.text && String(m.text).trim().length > 0);

  // ── Helper: Check page boundary & add page if needed ────────────────────────
  function ensureSpace(neededHeight) {
    if (currentY + neededHeight > bottomLimit) {
      doc.addPage();
      drawRunningHeader();
      currentY = 22; // Start below running header
      return true;
    }
    return false;
  }

  // ── Helper: Draw compact running header on page 2+ ──────────────────────────
  function drawRunningHeader() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text('AURA AI WORKSPACE - EXECUTIVE REPORT', marginL, 11);

    doc.setFont('helvetica', 'normal');
    doc.text(cleanWsName, marginL + usableW, 11, { align: 'right' });

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(marginL, 14, marginL + usableW, 14);
  }

  // ── 2. Page 1 Top Branded Header ───────────────────────────────────────────
  // Brand Icon Box
  doc.setFillColor(...C.indigo);
  doc.roundedRect(marginL, currentY, 7.5, 7.5, 1.8, 1.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('A', marginL + 2.2, currentY + 5.3);

  // Brand Name & Subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.navy);
  doc.text('AURA AI WORKSPACE', marginL + 10, currentY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.indigo);
  doc.text('EXECUTIVE KNOWLEDGE INTELLIGENCE REPORT', marginL + 10, currentY + 8.6);

  // Export Date on Top Right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text('EXPORTED ON', marginL + usableW, currentY + 3.8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.navy);
  doc.text(`${dateFormatted} - ${timeFormatted}`, marginL + usableW, currentY + 8, { align: 'right' });

  currentY += 12;

  // Metadata Ribbon Box
  const ribbonH = 10;
  doc.setFillColor(...C.userBg);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginL, currentY, usableW, ribbonH, 2, 2, 'FD');

  let ribbonX = marginL + 5;
  const ribbonY = currentY + 6.3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text('Workspace:', ribbonX, ribbonY);
  ribbonX += doc.getTextWidth('Workspace:') + 2;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.navy);
  const truncatedWs = cleanWsName.length > 24 ? cleanWsName.slice(0, 22) + '...' : cleanWsName;
  doc.text(truncatedWs, ribbonX, ribbonY);
  ribbonX += doc.getTextWidth(truncatedWs) + 4;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.lightMuted);
  doc.text('|', ribbonX, ribbonY);
  ribbonX += 4;

  doc.setTextColor(...C.muted);
  doc.text('Indexed Files:', ribbonX, ribbonY);
  ribbonX += doc.getTextWidth('Indexed Files:') + 2;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.navy);
  const docsText = `${documentsCount} Document${documentsCount !== 1 ? 's' : ''}`;
  doc.text(docsText, ribbonX, ribbonY);
  ribbonX += doc.getTextWidth(docsText) + 4;

  if (activeDocumentTitle) {
    const cleanDocTitle = sanitizeForPdf(activeDocumentTitle).trim();
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.lightMuted);
    doc.text('|', ribbonX, ribbonY);
    ribbonX += 4;

    doc.setTextColor(...C.muted);
    doc.text('Focus Doc:', ribbonX, ribbonY);
    ribbonX += doc.getTextWidth('Focus Doc:') + 2;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.indigo);
    const truncDoc = cleanDocTitle.length > 20 ? cleanDocTitle.slice(0, 18) + '...' : cleanDocTitle;
    doc.text(truncDoc, ribbonX, ribbonY);
    ribbonX += doc.getTextWidth(truncDoc) + 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.lightMuted);
  doc.text('|', ribbonX, ribbonY);
  ribbonX += 4;

  doc.setTextColor(...C.muted);
  doc.text('Total Queries:', ribbonX, ribbonY);
  ribbonX += doc.getTextWidth('Total Queries:') + 2;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.navy);
  const userQueriesCount = messagesToRender.filter((m) => m.sender === 'user').length;
  doc.text(String(userQueriesCount), ribbonX, ribbonY);

  currentY += ribbonH + 7;

  // ── 3. Message Blocks Rendering ─────────────────────────────────────────────
  messagesToRender.forEach((m, msgIdx) => {
    const isAi = m.sender === 'ai';
    const rawText = String(m.text || '').trim();

    if (!isAi) {
      // ── USER QUERY BLOCK (#1, #3, ...) ────────────────────────────────────
      const cleanPrompt = stripMarkdownSymbols(rawText);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const promptLines = doc.splitTextToSize(cleanPrompt, usableW - 14);

      const blockH = 8 + (promptLines.length * 4.5) + 3;
      ensureSpace(blockH + 4);

      // Card Background
      doc.setFillColor(...C.userBg);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(marginL, currentY, usableW, blockH, 2, 2, 'FD');

      // Card Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.muted);
      doc.text('USER QUERY', marginL + 6, currentY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.lightMuted);
      doc.text(`#${msgIdx + 1}`, marginL + usableW - 6, currentY + 5.5, { align: 'right' });

      // User prompt text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.navy);

      let textY = currentY + 10.5;
      promptLines.forEach((line) => {
        doc.text(line, marginL + 6, textY);
        textY += 4.5;
      });

      currentY += blockH + 5;

    } else {
      // ── AURA AI RESPONSE BLOCK (#2, #4, ...) ──────────────────────────────
      ensureSpace(28);

      let segmentStartY = currentY;

      // Draw Vector Dot Accent before AURA AI
      doc.setFillColor(...C.indigo);
      doc.circle(marginL + 7.5, currentY + 5.2, 0.9, 'F');

      // Plain ASCII AURA AI Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.indigo);
      doc.text('AURA AI', marginL + 10, currentY + 6.5);

      // Verified Badge Pill
      const badgeX = marginL + 10 + doc.getTextWidth('AURA AI') + 3;
      doc.setFillColor(...C.emeraldBg);
      doc.setDrawColor(...C.emeraldBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(badgeX, currentY + 2.5, 22, 4.5, 1.2, 1.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.emerald);
      doc.text('RAG VERIFIED', badgeX + 2.5, currentY + 5.7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.lightMuted);
      doc.text(`#${msgIdx + 1}`, marginL + usableW - 6, currentY + 6.5, { align: 'right' });

      // Divider line under AI header
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(marginL + 5, currentY + 9, marginL + usableW - 5, currentY + 9);

      currentY += 14;

      // ── Markdown-to-PDF Line Parser ───────────────────────────────────────
      const rawLines = rawText.split('\n');
      const innerW = usableW - 14; // text width inside card

      let isInsideCodeBlock = false;

      // Helper to handle page break inside the AI block while preserving accent bars
      const handleBlockPageBreak = () => {
        // Draw accent bar on page before breaking
        const prevH = Math.max(8, currentY - segmentStartY);
        doc.setFillColor(...C.indigoBar);
        doc.roundedRect(marginL, segmentStartY, 1.8, prevH, 0.9, 0.9, 'F');

        doc.addPage();
        drawRunningHeader();
        currentY = 22;
        segmentStartY = 22;
      };

      for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
        const rawLine = rawLines[lineIdx];
        const trimmed = rawLine.trim();

        // Handle code block toggles
        if (trimmed.startsWith('```')) {
          isInsideCodeBlock = !isInsideCodeBlock;
          continue;
        }

        // Handle empty line
        if (!trimmed) {
          currentY += 2.5;
          continue;
        }

        // Check page boundary during line streaming
        if (currentY > bottomLimit) {
          handleBlockPageBreak();
        }

        // 1. Code Block Line
        if (isInsideCodeBlock) {
          const cleanCode = sanitizeForPdf(trimmed);
          doc.setFont('courier', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...C.navy);

          const codeLines = doc.splitTextToSize(cleanCode, innerW - 4);
          const blockH = codeLines.length * 3.8 + 2;

          if (currentY + blockH > bottomLimit) {
            handleBlockPageBreak();
          }

          doc.setFillColor(...C.codeBg);
          doc.setDrawColor(...C.border);
          doc.setLineWidth(0.2);
          doc.rect(marginL + 7, currentY - 2.8, innerW, blockH, 'FD');

          codeLines.forEach((cl) => {
            doc.text(cl, marginL + 9, currentY);
            currentY += 3.8;
          });
          currentY += 1.5;
          continue;
        }

        // 2. Full Multi-Line Text Wrapping in Tables (Zero '...' Truncation)
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          // Skip separator row (|---|---|)
          if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
            continue;
          }

          // Extract and sanitize table cells
          const rawCells = trimmed.split('|').slice(1, -1);
          const cells = rawCells.map((c) => stripMarkdownSymbols(c.trim()));

          if (cells.length > 0) {
            const nextRaw = rawLines[lineIdx + 1]?.trim();
            const isHeader = Boolean(nextRaw && /^\|[\s\-:|]+\|$/.test(nextRaw));

            const colCount = cells.length;
            const colW = innerW / colCount;
            const padX = 2.5;
            const padY = 2.0;
            const cellTextW = Math.max(8, colW - (padX * 2));
            const lineHeight = 3.6;

            // Set font before measuring wrapped lines
            doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
            doc.setFontSize(isHeader ? 8 : 7.5);

            // Dynamically split cell text into multi-line arrays (NO '...' truncation)
            const wrappedCells = cells.map((cellText) => {
              return doc.splitTextToSize(cellText || '', cellTextW);
            });

            // Calculate required row height from the tallest cell in this row
            const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
            const rowH = Math.max(6.5, (maxLines * lineHeight) + (padY * 2));

            // Automatic page-break check if tall row nears bottom margin
            if (currentY + rowH > bottomLimit) {
              handleBlockPageBreak();
            }

            // Draw table row container
            doc.setFillColor(...(isHeader ? C.indigoBg : C.userBg));
            doc.setDrawColor(...(isHeader ? C.indigoBorder : C.border));
            doc.setLineWidth(0.2);
            doc.rect(marginL + 7, currentY - 2.2, innerW, rowH, 'FD');

            // Render each cell and vertical column dividers
            cells.forEach((_, colIdx) => {
              const cellX = marginL + 7 + (colIdx * colW);

              // Vertical column divider
              if (colIdx > 0) {
                doc.setDrawColor(...(isHeader ? C.indigoBorder : C.border));
                doc.line(cellX, currentY - 2.2, cellX, currentY - 2.2 + rowH);
              }

              // Render wrapped text lines cleanly with proper cell padding
              doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
              doc.setFontSize(isHeader ? 8 : 7.5);
              doc.setTextColor(...(isHeader ? C.indigo : C.navy));

              const lines = wrappedCells[colIdx];
              let lineY = currentY + padY + 1.2;
              lines.forEach((line) => {
                doc.text(line, cellX + padX, lineY);
                lineY += lineHeight;
              });
            });

            currentY += rowH + 1.0;
            continue;
          }
        }

        // 3. Heading Lines (###, ##, #)
        if (/^#{1,4}\s+/.test(trimmed)) {
          const headingText = stripMarkdownSymbols(trimmed.replace(/^#{1,4}\s+/, ''));
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(...C.navy);

          const hLines = doc.splitTextToSize(headingText, innerW);
          currentY += 2;
          hLines.forEach((hl) => {
            if (currentY > bottomLimit) {
              handleBlockPageBreak();
            }
            doc.text(hl, marginL + 7, currentY);
            currentY += 4.5;
          });
          currentY += 1.5;
          continue;
        }

        // 4. Bullet / Numbered List Items (- , * , 1. )
        const isBullet = /^[-*•+]\s+/.test(trimmed);
        const isNumbered = /^\d+\.\s+/.test(trimmed);

        if (isBullet || isNumbered) {
          let itemText = trimmed.replace(/^[-*•+]\s+/, '').replace(/^\d+\.\s+/, '');

          // Check if bullet starts with bold label e.g. **Topic**: Content or *Topic*: Content
          const boldPrefixMatch = itemText.match(/^(\*\*([^*]+)\*\*|\*([^*]+)\*):?\s*(.*)$/);

          if (boldPrefixMatch) {
            const rawLabel = boldPrefixMatch[2] || boldPrefixMatch[3];
            const prefix = stripMarkdownSymbols(rawLabel) + ': ';
            const rest = stripMarkdownSymbols(boldPrefixMatch[4]);

            // Draw vector bullet circle
            doc.setFillColor(...C.indigo);
            doc.circle(marginL + 8, currentY - 1, 0.65, 'F');

            // Draw bold label in navy
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...C.navy);
            doc.text(prefix, marginL + 11, currentY);

            const prefixW = doc.getTextWidth(prefix);
            const remainingW = innerW - 4 - prefixW;

            // Draw rest of the text in slate
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...C.slate);

            const firstLineWrapped = doc.splitTextToSize(rest, remainingW);
            if (firstLineWrapped.length > 0) {
              doc.text(firstLineWrapped[0], marginL + 11 + prefixW, currentY);
              currentY += 4.2;

              if (firstLineWrapped.length > 1) {
                const subLines = doc.splitTextToSize(rest.slice(firstLineWrapped[0].length).trim(), innerW - 4);
                subLines.forEach((sl) => {
                  if (currentY > bottomLimit) {
                    handleBlockPageBreak();
                  }
                  doc.text(sl, marginL + 11, currentY);
                  currentY += 4.2;
                });
              }
            } else {
              currentY += 4.2;
            }
          } else {
            // Standard Bullet Item
            const cleanItem = stripMarkdownSymbols(itemText);

            // Draw vector bullet circle
            doc.setFillColor(...C.indigo);
            doc.circle(marginL + 8, currentY - 1, 0.65, 'F');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...C.slate);
            const itemLines = doc.splitTextToSize(cleanItem, innerW - 4);

            itemLines.forEach((il) => {
              if (currentY > bottomLimit) {
                handleBlockPageBreak();
              }
              doc.text(il, marginL + 11, currentY);
              currentY += 4.2;
            });
          }
          currentY += 1;
          continue;
        }

        // 5. Citation Line e.g. (Source: filename.pdf, Page X)
        if (/\(Source:.*Page.*\)/i.test(trimmed)) {
          const cleanCitation = stripMarkdownSymbols(trimmed);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...C.indigo);

          const citLines = doc.splitTextToSize(`[Source] ${cleanCitation}`, innerW);
          citLines.forEach((cl) => {
            if (currentY > bottomLimit) {
              handleBlockPageBreak();
            }
            doc.text(cl, marginL + 7, currentY);
            currentY += 4.2;
          });
          currentY += 1.5;
          continue;
        }

        // 6. Standard Paragraph Line
        const cleanPara = stripMarkdownSymbols(trimmed);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.slate);

        const paraLines = doc.splitTextToSize(cleanPara, innerW);
        paraLines.forEach((pl) => {
          if (currentY > bottomLimit) {
            handleBlockPageBreak();
          }
          doc.text(pl, marginL + 7, currentY);
          currentY += 4.2;
        });
        currentY += 1.5;
      }

      // Draw the Left Accent Bar (Indigo #6366F1) alongside the final segment of the card
      const totalCardH = Math.max(12, currentY - segmentStartY);
      doc.setFillColor(...C.indigoBar);
      doc.roundedRect(marginL, segmentStartY, 1.8, totalCardH, 0.9, 0.9, 'F');

      currentY += 6;
    }
  });

  // ── 4. Footer Stamping on Every Page (Page X of Y) ───────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Footer divider line
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(marginL, pageHeight - 12, marginL + usableW, pageHeight - 12);

    // Left Footer: Copyright & Enterprise Branding (ASCII '(c) 2026')
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(
      '(c) 2026 AURA AI Workspace - Enterprise Knowledge Intelligence - Confidential',
      marginL,
      pageHeight - 7.5
    );

    // Right Footer: Exact Page Count
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.navy);
    doc.text(`Page ${p} of ${totalPages}`, marginL + usableW, pageHeight - 7.5, { align: 'right' });
  }

  // ── 5. Save and Trigger Direct Download ─────────────────────────────────────
  doc.save(filename);
  return true;
}
