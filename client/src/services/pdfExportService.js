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
 * Strips raw markdown syntax while preserving text meaning.
 * Thoroughly removes bold (**...**), italics (*...* and _..._),
 * inline code (`...`), markdown links, and non-ASCII emojis.
 */
function stripMarkdownSymbols(raw) {
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

  // 8. Strip non-ASCII emojis that standard Helvetica cannot render
  text = text.replace(/[✦📄👁️⚡📊🔍✓❌⚠️©]/g, '');

  return text.trim();
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

  const safeWsName = (workspaceName || 'Workspace')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const filename = `AURA-${safeWsName}-Chat-Report.pdf`;

  // Filter messages (skip init message if real conversation exists)
  const exportable = (messages || []).filter(
    (m) => m.text && String(m.text).trim().length > 0 && m.id !== 'init'
  );
  const messagesToRender = exportable.length > 0
    ? exportable
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
    doc.text(String(workspaceName || 'Workspace'), marginL + usableW, 11, { align: 'right' });

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(marginL, 14, marginL + usableW, 14);
  }

  // ── 1. Page 1 Top Branded Header ───────────────────────────────────────────
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
  const truncatedWs = workspaceName.length > 24 ? workspaceName.slice(0, 22) + '...' : workspaceName;
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
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.lightMuted);
    doc.text('|', ribbonX, ribbonY);
    ribbonX += 4;

    doc.setTextColor(...C.muted);
    doc.text('Focus Doc:', ribbonX, ribbonY);
    ribbonX += doc.getTextWidth('Focus Doc:') + 2;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.indigo);
    const truncDoc = activeDocumentTitle.length > 20 ? activeDocumentTitle.slice(0, 18) + '...' : activeDocumentTitle;
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

  // ── 2. Message Blocks Rendering ─────────────────────────────────────────────
  messagesToRender.forEach((m, msgIdx) => {
    const isAi = m.sender === 'ai';
    const rawText = String(m.text || '').trim();

    if (!isAi) {
      // ── USER QUERY BLOCK ──────────────────────────────────────────────────
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
      // ── AURA AI RESPONSE BLOCK ────────────────────────────────────────────
      ensureSpace(28);

      const startCardY = currentY;

      // Draw Vector Diamond Accent before AURA AI (Replaces unsupported Unicode ✦)
      doc.setFillColor(...C.indigo);
      doc.circle(marginL + 7.5, currentY + 5.2, 0.9, 'F');

      // Plain ASCII AURA AI
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
      doc.text(`Response #${msgIdx + 1}`, marginL + usableW - 6, currentY + 6.5, { align: 'right' });

      // Divider line under AI header
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(marginL + 5, currentY + 9, marginL + usableW - 5, currentY + 9);

      currentY += 14;

      // ── Markdown-to-PDF Line Parser ───────────────────────────────────────
      const rawLines = rawText.split('\n');
      const innerW = usableW - 14; // text width inside card

      let isInsideCodeBlock = false;

      rawLines.forEach((rawLine) => {
        const trimmed = rawLine.trim();

        // Handle code block toggles
        if (trimmed.startsWith('```')) {
          isInsideCodeBlock = !isInsideCodeBlock;
          return;
        }

        // Handle empty line
        if (!trimmed) {
          currentY += 2.5;
          return;
        }

        // Check page boundary during line streaming
        if (currentY > bottomLimit) {
          doc.addPage();
          drawRunningHeader();
          currentY = 22;
        }

        // 1. Code Block Line
        if (isInsideCodeBlock) {
          doc.setFont('courier', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...C.navy);

          const codeLines = doc.splitTextToSize(trimmed, innerW - 4);
          const blockH = codeLines.length * 3.8 + 2;

          doc.setFillColor(...C.codeBg);
          doc.setDrawColor(...C.border);
          doc.setLineWidth(0.2);
          doc.rect(marginL + 7, currentY - 2.8, innerW, blockH, 'FD');

          codeLines.forEach((cl) => {
            doc.text(cl, marginL + 9, currentY);
            currentY += 3.8;
          });
          currentY += 1.5;
          return;
        }

        // 2. Clean Markdown Table Rendering (| col1 | col2 |)
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          // Skip separator row (|---|---|)
          if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
            return;
          }

          // Extract table row cells
          const rawCells = trimmed.split('|').slice(1, -1);
          const cells = rawCells.map((c) => stripMarkdownSymbols(c.trim()));

          if (cells.length > 0) {
            const colW = innerW / cells.length;
            const rowH = 6;

            if (currentY + rowH > bottomLimit) {
              doc.addPage();
              drawRunningHeader();
              currentY = 22;
            }

            // Draw clean table row container
            doc.setFillColor(...C.userBg);
            doc.setDrawColor(...C.border);
            doc.setLineWidth(0.2);
            doc.rect(marginL + 7, currentY - 2.5, innerW, rowH, 'FD');

            // Render each cell cleanly
            cells.forEach((cellText, colIdx) => {
              const cellX = marginL + 7 + (colIdx * colW);

              // Cell vertical divider
              if (colIdx > 0) {
                doc.setDrawColor(...C.border);
                doc.line(cellX, currentY - 2.5, cellX, currentY - 2.5 + rowH);
              }

              // Fit and print cell text
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              doc.setTextColor(...C.navy);

              const maxCellTextW = colW - 3;
              let displayCell = cellText;
              if (doc.getTextWidth(displayCell) > maxCellTextW) {
                while (displayCell.length > 3 && doc.getTextWidth(displayCell + '...') > maxCellTextW) {
                  displayCell = displayCell.slice(0, -1);
                }
                displayCell += '...';
              }

              doc.text(displayCell, cellX + 2, currentY + 1.8);
            });

            currentY += rowH + 1;
            return;
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
            doc.text(hl, marginL + 7, currentY);
            currentY += 4.5;
          });
          currentY += 1.5;
          return;
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

            // Draw vector bullet circle (immune to Unicode font issues)
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
            doc.setTextColor(...C.slate);

            const firstLineWrapped = doc.splitTextToSize(rest, remainingW);
            if (firstLineWrapped.length > 0) {
              doc.text(firstLineWrapped[0], marginL + 11 + prefixW, currentY);
              currentY += 4.2;

              if (firstLineWrapped.length > 1) {
                const subLines = doc.splitTextToSize(rest.slice(firstLineWrapped[0].length).trim(), innerW - 4);
                subLines.forEach((sl) => {
                  if (currentY > bottomLimit) {
                    doc.addPage();
                    drawRunningHeader();
                    currentY = 22;
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
                doc.addPage();
                drawRunningHeader();
                currentY = 22;
              }
              doc.text(il, marginL + 11, currentY);
              currentY += 4.2;
            });
          }
          currentY += 1;
          return;
        }

        // 5. Citation Line e.g. (Source: filename.pdf, Page X)
        if (/\(Source:.*Page.*\)/i.test(trimmed)) {
          const cleanCitation = stripMarkdownSymbols(trimmed);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...C.indigo);

          // Replaced Unicode 📄 with plain ASCII [Source]
          doc.text(`[Source] ${cleanCitation}`, marginL + 7, currentY);
          currentY += 4.5;
          return;
        }

        // 6. Standard Paragraph Line
        const cleanPara = stripMarkdownSymbols(trimmed);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.slate);

        const paraLines = doc.splitTextToSize(cleanPara, innerW);
        paraLines.forEach((pl) => {
          if (currentY > bottomLimit) {
            doc.addPage();
            drawRunningHeader();
            currentY = 22;
          }
          doc.text(pl, marginL + 7, currentY);
          currentY += 4.2;
        });
        currentY += 1.5;
      });

      // Draw the Left Accent Bar (Indigo #6366F1) alongside the card
      const totalCardH = Math.max(16, currentY - startCardY);
      doc.setFillColor(...C.indigoBar);
      doc.roundedRect(marginL, startCardY, 1.8, totalCardH, 0.9, 0.9, 'F');

      currentY += 6;
    }
  });

  // ── 3. Footer Stamping on Every Page (Page X of Y) ───────────────────────────
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

  // ── 4. Save and Trigger Direct Download ─────────────────────────────────────
  doc.save(filename);
  return true;
}
