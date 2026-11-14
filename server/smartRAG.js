// ============================================================
// AURA AI — Intelligent Document Assistant Fallback Engine
// Clean Markdown output, structured bullet points, source citations,
// and zero raw page-marker text dumps
// ============================================================

const ROMAN_URDU_WORDS = new Set([
  'ye', 'yeh', 'hai', 'hain', 'kis', 'kya', 'kia', 'btao', 'batao',
  'konsa', 'konsi', 'konse', 'baray', 'bare', 'mein', 'me', 'mai', 'pe', 'par',
  'kaise', 'kese', 'chz', 'chiz', 'cheez', 'nai', 'nahi', 'nh', 'kuch',
  'bhi', 'aur', 'ka', 'ki', 'ke', 'ko', 'se', 'is', 'isme', 'h', 'hy',
  'kahan', 'kab', 'kyun', 'wala', 'wali', 'karo', 'karein', 'mujhe', 'mjhy',
  'samjhao', 'batayein', 'btain', 'bataen', 'bta', 'dafa', 'baar', 'kitni',
  'kitne', 'nikaal', 'nikal', 'paste', 'likha', 'likhi', 'likhe', 'shamil',
  'saari', 'tamam', 'sab', 'kholo', 'parho', 'dekho', 'bhejo'
]);

function isRomanUrdu(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  let count = 0;
  for (const w of words) {
    if (ROMAN_URDU_WORDS.has(w)) count++;
  }
  return count >= 1;
}

// Extract raw text from doc object regardless of property naming
function getDocText(doc) {
  if (!doc) return '';
  return String(doc.content_text || doc.content || doc.extracted_text || '');
}

// Strip raw document markers such as "--- Page 1 ---" or "--- Slide 2 ---"
function cleanRawMarkers(text) {
  return String(text || '')
    .replace(/---\s*(?:Page|Slide|Sheet:?)\s*[^-\n]+\s*---/gi, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Slice document text by page markers while tracking page numbers
function extractPagesWithText(rawText) {
  const text = String(rawText || '');
  const pageRegex = /---\s*(?:Page|Slide|Sheet:?)\s*([^-\n]+)\s*---/gi;
  const sections = [];
  let match;
  let lastIndex = 0;
  let currentPage = 1;

  while ((match = pageRegex.exec(text)) !== null) {
    const rawNum = match[1].trim();
    const parsed = parseInt(rawNum, 10);
    const pageNum = isNaN(parsed) ? 1 : Math.max(1, parsed);

    if (match.index > lastIndex) {
      const sectionText = text.substring(lastIndex, match.index).trim();
      if (sectionText) {
        sections.push({ page: currentPage, text: cleanRawMarkers(sectionText) });
      }
    }
    currentPage = pageNum;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const trailing = text.substring(lastIndex).trim();
    if (trailing) {
      sections.push({ page: currentPage, text: cleanRawMarkers(trailing) });
    }
  }

  if (sections.length === 0) {
    sections.push({ page: 1, text: cleanRawMarkers(text) });
  }

  return sections;
}

// Clean the query to get the core subject/term being asked about
function extractTargetTerm(query) {
  let cleaned = String(query || '').trim();
  cleaned = cleaned.replace(/^(isme|is me|is document me|is pdf me|us pdf me|us document me)\s*/i, '');
  cleaned = cleaned.replace(/\s*(kitni|kitne)\s*(baar|dafa)\s*(aaya|aayi|aaye|use hua|hai|h)?\??$/gi, '');
  cleaned = cleaned.replace(/^kis\s+kis\s+(pdf|file|document)\s+(mein|me)\s*/i, '');
  cleaned = cleaned.replace(/^which\s+(pdf|file|document)\s+(has|contains)\s*/i, '');
  cleaned = cleaned.replace(/\s*(hai ya nahi|hai ya nai|hai ya hai hi nahi|hai ya na|h ya nh|h ya ni)\??$/gi, '');
  cleaned = cleaned.replace(/\s*(is it present|does it exist|is there)\??$/gi, '');
  cleaned = cleaned.replace(/\s*(wala topic|topic|section)?\s*(bas)?\s*(mujhe|mjhy)?\s*(nikaal ke|nikal ke|extract kar ke|extract karke|extract)?\s*(yahan pe|yahan)?\s*(paste kar do|paste kardo|paste do|paste karein|nikaal do|nikal do)\??$/gi, '');
  cleaned = cleaned.replace(/\s*(kahan likha hua hai|kahan likha hai|kon se page pe hai|which page)\??$/gi, '');

  const stopTokens = new Set([
    'ye', 'yeh', 'hai', 'hain', 'h', 'hy', 'is', 'isme', 'me', 'mein', 'mai', 'pe', 'par',
    'kya', 'kia', 'kis', 'konsa', 'konsi', 'konse', 'ka', 'ki', 'ke', 'ko', 'se',
    'aaya', 'aayi', 'aaye', 'hua', 'hui', 'hue', 'wala', 'wali', 'wale', 'do', 'de',
    'kar', 'karo', 'karein', 'mujhe', 'mjhy', 'batao', 'btao', 'ya', 'hi', 'bhi',
    'pdf', 'document', 'file', 'topic', 'bas', 'yahan', 'kitni', 'kitne', 'baar', 'dafa',
    'likha', 'likhi', 'likhe'
  ]);

  const words = cleaned
    .replace(/["'?!.,:;()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !stopTokens.has(w.toLowerCase()));

  return words.join(' ').trim();
}

function detectIntent(text) {
  const lower = String(text || '').toLowerCase().trim();

  if (/(welcome\s*kaho|welcome\s*bolo|^welcome$|^just\s*welcome|^sirf\s*welcome)/i.test(lower)) {
    return 'CONVERSATIONAL_WELCOME';
  }
  if (/^(thank\s*u|thank\s*you|thanks|thx|shukriya|jazakallah)/i.test(lower)) {
    return 'CONVERSATIONAL_THANKS';
  }
  if (/^(hi|hello|hey|salam|aOA|assalam|kese ho|kaise ho|kya haal|kia haal)$/i.test(lower)) {
    return 'CONVERSATIONAL_GREETING';
  }

  if (/kitn[yea]\s*words?|how many words|word count|total words|kitn[yea]\s*alfaaz|kitn[yea]\s*lines/i.test(lower)) {
    return 'DOC_STATS';
  }

  if (/kitni (baar|dafa)|how many times|frequency\b|occurrences?/i.test(lower)) {
    return 'COUNT_OCCURRENCE';
  }

  if (/kis kis (pdf|file|document)|which (pdf|file|document)|kis (pdf|file|document) mein|konsi file/i.test(lower)) {
    return 'WHICH_FILES';
  }

  if (/nikaal (ke|kar) (paste|do|de)|extract\b|paste kar|sirf ye topic|topic nikaal/i.test(lower)) {
    return 'EXTRACT_PASTE';
  }

  if (/kon(se)? page|which page|page number|kahan likh/i.test(lower)) {
    return 'LOCATION_PAGE';
  }

  if (/hai ya (nahi|nai|hai hi nahi|na)|is it (in|present|there)|does it (have|contain)|shamil hai ya/i.test(lower)) {
    return 'EXISTENCE';
  }

  if (['btao', 'batao', 'summary', 'details', 'kya hai', 'kia hai'].includes(lower) ||
      /kis base (py|pe|par)|kis baray mein|kis bare mein|what is this (about|document)|overview|summarize/i.test(lower)) {
    return 'OVERVIEW';
  }

  return 'SPECIFIC_QA';
}

// ── 1. Count occurrences ────────────────────────────────────────────────────
function handleCountOccurrence(query, docs, urdu) {
  const term = extractTargetTerm(query);
  if (!term) {
    return urdu
      ? 'Aap kis word ya topic ki tadaad (count) poochna chahte hain? Barah-e-karam word ka naam likhein.'
      : 'Which word or term would you like me to count? Please specify the term.';
  }

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

  const results = [];
  let totalCount = 0;

  for (const doc of docs) {
    const text = cleanRawMarkers(getDocText(doc));
    const matches = text.match(regex);
    const count = matches ? matches.length : 0;
    totalCount += count;
    results.push({ title: doc.title, count });
  }

  if (urdu) {
    if (totalCount === 0) {
      return `### 🔍 Keyword Search: "${term}"\n\nTerm **"${term}"** aapke kisi bhi document mein **0 baar** aaya hai (mojood nahi hai).`;
    }
    let res = `### 🔍 Keyword Frequency: "${term}"\n\nTerm **"${term}"** kul milakar **${totalCount} baar** aaya hai:\n\n`;
    for (const r of results) {
      res += `- **"${r.title}"**: ${r.count} baar (Source: ${r.title})\n`;
    }
    return res.trim();
  } else {
    if (totalCount === 0) {
      return `### 🔍 Keyword Search: "${term}"\n\nThe term **"${term}"** appears **0 times** across your uploaded documents.`;
    }
    let res = `### 🔍 Keyword Frequency: "${term}"\n\nThe term **"${term}"** appears **${totalCount} time(s)** in total:\n\n`;
    for (const r of results) {
      res += `- **"${r.title}"**: ${r.count} time(s) (Source: ${r.title})\n`;
    }
    return res.trim();
  }
}

// ── 2. Which files have it ──────────────────────────────────────────────────
function handleWhichFiles(query, docs, urdu) {
  const term = extractTargetTerm(query);
  if (!term) {
    return urdu
      ? 'Aap kis cheez ke baray mein poochna chahte hain ke wo kis PDF mein hai?'
      : 'Which topic or term would you like me to check across the documents?';
  }

  const lowerTerm = term.toLowerCase();
  const hasFiles = [];
  const notHasFiles = [];

  for (const doc of docs) {
    const text = cleanRawMarkers(getDocText(doc)).toLowerCase();
    if (text.includes(lowerTerm)) {
      hasFiles.push(doc.title);
    } else {
      notHasFiles.push(doc.title);
    }
  }

  if (urdu) {
    if (hasFiles.length === 0) {
      return `### 📋 Document Search: "${term}"\n\n❌ **"${term}"** aapke kisi bhi document mein nahi mila.`;
    }
    let out = `### 📋 Document Search: "${term}"\n\n**"${term}"** in documents mein mojood hai:\n\n`;
    for (const f of hasFiles) {
      out += `- ✅ **"${f}"** (Source: ${f})\n`;
    }
    if (notHasFiles.length > 0) {
      out += `\n**Baaqi in files mein nahi mila:**\n`;
      for (const f of notHasFiles) {
        out += `- ❌ "${f}"\n`;
      }
    }
    return out.trim();
  } else {
    if (hasFiles.length === 0) {
      return `### 📋 Document Search: "${term}"\n\n❌ **"${term}"** was not found in any of your uploaded documents.`;
    }
    let out = `### 📋 Document Search: "${term}"\n\n**"${term}"** is present in:\n\n`;
    for (const f of hasFiles) {
      out += `- ✅ **"${f}"** (Source: ${f})\n`;
    }
    if (notHasFiles.length > 0) {
      out += `\n**Not present in:**\n`;
      for (const f of notHasFiles) {
        out += `- ❌ "${f}"\n`;
      }
    }
    return out.trim();
  }
}

// ── 3. Existence ────────────────────────────────────────────────────────────
function handleExistence(query, docs, urdu) {
  const term = extractTargetTerm(query);
  if (!term) {
    return urdu
      ? 'Aap kis topic ya word ke baray mein poochna chahte hain ke wo mojood hai ya nahi?'
      : 'Please specify the term you want to check for presence or absence.';
  }

  const lowerTerm = term.toLowerCase();
  const foundDocs = [];

  for (const doc of docs) {
    const pages = extractPagesWithText(getDocText(doc));
    for (const p of pages) {
      const lower = p.text.toLowerCase();
      const idx = lower.indexOf(lowerTerm);
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(p.text.length, idx + term.length + 100);
        const snippet = p.text.slice(start, end).replace(/\s+/g, ' ').trim();
        foundDocs.push({ title: doc.title, page: p.page, snippet });
        break;
      }
    }
  }

  if (foundDocs.length > 0) {
    const best = foundDocs[0];
    if (urdu) {
      return `### 🔍 Verification Result\n\n✅ **Haan**, "${term}" aapke document (**"${best.title}"**) mein **mojood hai**.\n\n- **Page:** ${best.page}\n- **Excerpt:** *"...${best.snippet}..."*\n\n*(Source: ${best.title}, Page ${best.page})*`;
    } else {
      return `### 🔍 Verification Result\n\n✅ **Yes**, "${term}" is **present** in **"${best.title}"**.\n\n- **Page:** ${best.page}\n- **Excerpt:** *"...${best.snippet}..."*\n\n*(Source: ${best.title}, Page ${best.page})*`;
    }
  } else {
    if (urdu) {
      return `### 🔍 Verification Result\n\n❌ **Nahi**, "${term}" aapke kisi bhi document mein **mojood nahi hai**.`;
    } else {
      return `### 🔍 Verification Result\n\n❌ **No**, "${term}" is **not present** in any of your uploaded documents.`;
    }
  }
}

// ── 4. Extract and Paste exact section ──────────────────────────────────────
function handleExtractPaste(query, docs, urdu) {
  const term = extractTargetTerm(query);
  const lowerTerm = term.toLowerCase();

  for (const doc of docs) {
    const pages = extractPagesWithText(getDocText(doc));
    for (const p of pages) {
      const paragraphs = p.text.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s.length > 20);
      const matched = paragraphs.filter((s) => lowerTerm ? s.toLowerCase().includes(lowerTerm) : true);

      if (matched.length > 0) {
        const excerpt = matched.slice(0, 2).map((s) => `> ${s}`).join('\n\n');
        if (urdu) {
          return `### 📄 Extracted from "${doc.title}" (Page ${p.page})\n\n${excerpt}\n\n*(Source: ${doc.title}, Page ${p.page})*`;
        } else {
          return `### 📄 Extracted from "${doc.title}" (Page ${p.page})\n\n${excerpt}\n\n*(Source: ${doc.title}, Page ${p.page})*`;
        }
      }
    }
  }

  if (urdu) {
    return `❌ Document mein "${term || 'ye topic'}" se mutalliq koi specific section nahi mila.`;
  } else {
    return `❌ No matching section found for "${term || 'this topic'}" to extract.`;
  }
}

// ── 5. Location / Page ──────────────────────────────────────────────────────
function handleLocationPage(query, docs, urdu) {
  const term = extractTargetTerm(query);
  if (!term) {
    return urdu ? 'Aap kis cheez ka page poochna chahte hain?' : 'Which topic page are you asking about?';
  }

  const lowerTerm = term.toLowerCase();

  for (const doc of docs) {
    const pages = extractPagesWithText(getDocText(doc));
    for (const p of pages) {
      if (p.text.toLowerCase().includes(lowerTerm)) {
        return urdu
          ? `### 📍 Location in Document\n\n**"${term}"** aapke document (**"${doc.title}"**) ke **Page ${p.page}** par likha hua hai.\n\n*(Source: ${doc.title}, Page ${p.page})*`
          : `### 📍 Location in Document\n\n**"${term}"** is located on **Page ${p.page}** of **"${doc.title}"**.\n\n*(Source: ${doc.title}, Page ${p.page})*`;
      }
    }
  }

  return urdu
    ? `❌ "${term}" aapke document mein nahi mila.`
    : `❌ "${term}" was not found in your document.`;
}

// ── 6. Overview & Multi-Document Summaries ──────────────────────────────────
function handleOverview(query, docs, urdu) {
  let output = '';

  for (const doc of docs) {
    const rawContent = getDocText(doc);
    const pages = extractPagesWithText(rawContent);
    const firstPageText = pages[0] ? pages[0].text : cleanRawMarkers(rawContent);

    // Extract natural sentences without any raw page markers
    const sentences = firstPageText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 25 && !s.includes('---'));

    const intro = sentences.slice(0, 2).join(' ') || firstPageText.slice(0, 250);

    // Look for bullet points
    const bulletCandidates = firstPageText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[•\-\*\d+\.]\s+/.test(l) && l.length > 15 && l.length < 200)
      .slice(0, 3)
      .map((l) => `- ${l.replace(/^[•\-\*\d+\.]\s*/, '')}`);

    output += `### 📄 ${doc.title}\n`;
    output += `- **Core Summary**: ${intro} (Source: ${doc.title}, Page 1)\n`;
    if (bulletCandidates.length > 0) {
      output += `- **Key Highlights**:\n  ${bulletCandidates.join('\n  ')}\n`;
    }
    output += '\n';
  }

  const footer = urdu
    ? 'Aap in documents se mutalliq koi bhi specific sawal pooch sakte hain!'
    : 'You can ask any specific questions, search for terms, or extract data from these files.';

  return (output.trim() + '\n\n' + footer).trim();
}

// ── 7. Specific Q&A ─────────────────────────────────────────────────────────
function handleSpecificQA(query, docs, urdu) {
  const term = extractTargetTerm(query);
  const queryLower = query.toLowerCase();

  for (const doc of docs) {
    const pages = extractPagesWithText(getDocText(doc));

    const candidates = [];
    for (const p of pages) {
      const paragraphs = p.text
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 25);

      for (const para of paragraphs) {
        const pLower = para.toLowerCase();
        let score = 0;
        if (term && pLower.includes(term.toLowerCase())) score += 10;
        const tokens = queryLower.split(/\s+/).filter((w) => w.length > 3 && !ROMAN_URDU_WORDS.has(w));
        for (const t of tokens) {
          if (pLower.includes(t)) score += 2;
        }
        if (score > 0) {
          candidates.push({ para, page: p.page, score, title: doc.title });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      const cleanSnippet = cleanRawMarkers(best.para);
      const sentences = cleanSnippet
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 15)
        .slice(0, 3);

      const bullets = sentences.map((s) => `- ${s}`).join('\n');

      return `### 📄 ${best.title} (Page ${best.page})\n\n${bullets}\n\n*(Source: ${best.title}, Page ${best.page})*`;
    }
  }

  return handleOverview(query, docs, urdu);
}

// ── 0. Total Document Statistics ────────────────────────────────────────────
function handleDocStats(query, docs, urdu) {
  let output = '### 📊 Document Metrics & Counts\n\n';

  for (const doc of docs) {
    const rawContent = getDocText(doc);
    const cleaned = cleanRawMarkers(rawContent);
    const words = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;
    const chars = cleaned.length;
    const pages = extractPagesWithText(rawContent).length;

    output += `### 📄 ${doc.title}\n`;
    output += `- **Total Words**: **${words.toLocaleString()}**\n`;
    output += `- **Total Characters**: **${chars.toLocaleString()}**\n`;
    output += `- **Page Count**: **${pages}** (Source: ${doc.title})\n\n`;
  }

  return output.trim();
}

// ── Main Dispatcher ─────────────────────────────────────────────────────────
function generateSmartRAGAnswer(query, docs) {
  const urdu = isRomanUrdu(query);
  const intent = detectIntent(query);

  switch (intent) {
    case 'CONVERSATIONAL_WELCOME':
      return 'Welcome! How can I assist you with your documents today?';
    case 'CONVERSATIONAL_THANKS':
      return urdu
        ? "You're welcome! 😊 Koi aur sawal ho toh zaroor batayein."
        : "You're welcome! 😊 Feel free to ask anything about your documents.";
    case 'CONVERSATIONAL_GREETING':
      return urdu
        ? "Assalam-o-Alaikum! Main aapke documents read karke aapke har sawal ka direct aur accurate jawab de sakta hoon. Aap kya poochna chahte hain?"
        : "Hello! I have full access to your workspace documents and am ready to answer any questions.";
    case 'DOC_STATS':
      return handleDocStats(query, docs, urdu);
    case 'COUNT_OCCURRENCE':
      return handleCountOccurrence(query, docs, urdu);
    case 'WHICH_FILES':
      return handleWhichFiles(query, docs, urdu);
    case 'EXISTENCE':
      return handleExistence(query, docs, urdu);
    case 'EXTRACT_PASTE':
      return handleExtractPaste(query, docs, urdu);
    case 'LOCATION_PAGE':
      return handleLocationPage(query, docs, urdu);
    case 'OVERVIEW':
      return handleOverview(query, docs, urdu);
    default:
      return handleSpecificQA(query, docs, urdu);
  }
}

module.exports = {
  generateSmartRAGAnswer,
  isRomanUrdu,
  detectIntent,
  extractTargetTerm,
};
