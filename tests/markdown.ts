/**
 * Small, dependency-free Markdown parser for manuscripts.
 *
 * The previous viewer split text on blank lines and treated any block that STARTED with "#" as a
 * heading, so a heading followed directly by its paragraph turned the whole paragraph into a title.
 * It also printed paragraphs as plain text, so bold, italics, code and LaTeX showed literally.
 * This parser is line-based, handles the constructs the generator emits (headings, paragraphs,
 * lists, block quotes, tables with captions, fenced code, display and inline math, figure
 * captions bundled with their diagram) and is unit-tested.
 */

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; caption?: string; header: string[]; align: ('l' | 'r' | 'c')[]; rows: string[][] }
  | { type: 'math'; tex: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'figure'; n: number; caption: string; mermaid: string }
  | { type: 'abstract'; text: string }
  | { type: 'rule' };

const RE_HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const RE_RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const RE_UL = /^[-*•]\s+(.*)$/;
const RE_OL = /^\d+[.)]\s+(.*)$/;
const RE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

const splitRow = (line: string): string[] => {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  // split on unescaped pipes
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (t[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
};

const startsBlock = (t: string): boolean =>
  RE_HEADING.test(t) || t.startsWith('```') || t.startsWith('$$') || t.startsWith('|') || t.startsWith('>') || RE_RULE.test(t);

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      i++;
      continue;
    }

    // fenced code
    if (t.startsWith('```')) {
      const lang = t.slice(3).trim().toLowerCase();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
      i++; // closing fence
      out.push({ type: 'code', lang, code: buf.join('\n').replace(/^\n+|\n+$/g, '') });
      continue;
    }

    // display math
    if (t.startsWith('$$')) {
      if (t.length > 4 && t.endsWith('$$')) {
        out.push({ type: 'math', tex: t.slice(2, -2).trim() });
        i++;
      } else {
        const buf: string[] = [t.slice(2)];
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) buf.push(lines[i++]);
        if (i < lines.length) buf.push(lines[i++].trim().slice(0, -2));
        out.push({ type: 'math', tex: buf.join('\n').trim() });
      }
      continue;
    }

    const h = t.match(RE_HEADING);
    if (h) {
      out.push({ type: 'heading', level: Math.min(4, h[1].length) as 1 | 2 | 3 | 4, text: h[2] });
      i++;
      continue;
    }

    if (RE_RULE.test(t)) {
      out.push({ type: 'rule' });
      i++;
      continue;
    }

    // table
    if (t.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      if (rows.length >= 2 && RE_SEP.test(rows[1])) {
        const header = splitRow(rows[0]);
        const align = splitRow(rows[1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : 'l')) as ('l' | 'r' | 'c')[];
        out.push({ type: 'table', header, align, rows: rows.slice(2).map(splitRow) });
      } else {
        out.push({ type: 'paragraph', text: rows.join(' ') });
      }
      continue;
    }

    // block quote
    if (t.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push({ type: 'quote', text: buf.join(' ').trim() });
      continue;
    }

    // list
    const ul = t.match(RE_UL);
    const ol = t.match(RE_OL);
    if (ul || ol) {
      const ordered = !!ol;
      const items: string[] = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (!lt) break;
        const m = ordered ? lt.match(RE_OL) : lt.match(RE_UL);
        if (m) items.push(m[1].trim());
        else if (items.length && !startsBlock(lt) && !RE_UL.test(lt) && !RE_OL.test(lt)) items[items.length - 1] += ' ' + lt;
        else break;
        i++;
      }
      out.push({ type: 'list', ordered, items });
      continue;
    }

    // paragraph: lines up to a blank line or a block start
    const buf: string[] = [t];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i].trim())) buf.push(lines[i++].trim());
    out.push({ type: 'paragraph', text: buf.join(' ') });
  }

  return attach(out);
}

/** Merges captions with tables and diagrams, and the abstract heading with its text. */
function attach(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    const next = blocks[k + 1];

    if (b.type === 'heading' && /^abstract$/i.test(b.text) && next?.type === 'paragraph') {
      out.push({ type: 'abstract', text: next.text });
      k++;
      continue;
    }

    if (b.type === 'paragraph' && /^\*\*Table\b/.test(b.text) && next?.type === 'table') {
      out.push({ ...next, caption: b.text });
      k++;
      continue;
    }

    if (b.type === 'paragraph') {
      const fig = b.text.match(/^\*\*Figure (\d+)\.\*\*/);
      if (fig) {
        let mermaid = '';
        if (next?.type === 'code' && next.lang === 'mermaid') {
          mermaid = next.code;
          k++;
        }
        out.push({ type: 'figure', n: parseInt(fig[1], 10), caption: b.text, mermaid });
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Inline
// ------------------------------------------------------------------------------------------------

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'math'; v: string }
  | { t: 'link'; href: string; label: string }
  | { t: 'placeholder'; v: string };

const ESCAPABLE = '\\`*_{}[]()#+-.!$|';

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // escapes
    if (ch === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    // inline code
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // inline math: $...$ (non-empty, no space after the opener or before the closer)
    if (ch === '$' && text[i + 1] !== '$' && text[i + 1] !== ' ' && i + 1 < text.length) {
      let j = i + 1;
      let found = -1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === '$') {
          if (text[j - 1] !== ' ' && !/\d/.test(text[j + 1] || '')) found = j;
          break;
        }
        j++;
      }
      if (found > i + 1) {
        flush();
        out.push({ t: 'math', v: text.slice(i + 1, found) });
        i = found + 1;
        continue;
      }
    }

    // bold
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'bold', c: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // italic
    if (ch === '*' && text[i + 1] !== ' ' && text[i + 1] !== '*' && i + 1 < text.length) {
      let j = i + 1;
      let found = -1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === '$') {
          // skip over math so a * inside it cannot close the span
          const e = text.indexOf('$', j + 1);
          if (e > 0) {
            j = e + 1;
            continue;
          }
        }
        if (text[j] === '*' && text[j - 1] !== ' ' && text[j + 1] !== '*') {
          found = j;
          break;
        }
        j++;
      }
      if (found > i + 1) {
        flush();
        out.push({ t: 'italic', c: parseInline(text.slice(i + 1, found)) });
        i = found + 1;
        continue;
      }
    }

    // author placeholders, highlighted so they cannot be missed
    if (ch === '[') {
      const ph = text.slice(i).match(/^\[Authors?:[^\]]*\]/);
      if (ph) {
        flush();
        out.push({ t: 'placeholder', v: ph[0] });
        i += ph[0].length;
        continue;
      }
      const lk = text.slice(i).match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
      if (lk) {
        flush();
        out.push({ t: 'link', href: lk[2], label: lk[1] });
        i += lk[0].length;
        continue;
      }
    }

    // bare URLs
    if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(text.slice(i, i + 8))) {
      const m = text.slice(i).match(/^https?:\/\/[^\s<>"')\]]+/i);
      if (m) {
        let url = m[0];
        const trail = url.match(/[.,;:]+$/);
        if (trail) url = url.slice(0, -trail[0].length);
        flush();
        out.push({ t: 'link', href: url, label: url });
        i += url.length;
        continue;
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** All TeX strings in a document (inline and display), for validation. */
export function extractMath(md: string): { tex: string; display: boolean }[] {
  const res: { tex: string; display: boolean }[] = [];
  const blocks = parseBlocks(md);
  const walk = (inl: Inline[]) =>
    inl.forEach((x) => {
      if (x.t === 'math') res.push({ tex: x.v, display: false });
      else if (x.t === 'bold' || x.t === 'italic') walk(x.c);
    });
  blocks.forEach((b) => {
    if (b.type === 'math') res.push({ tex: b.tex, display: true });
    else if (b.type === 'paragraph' || b.type === 'quote' || b.type === 'abstract') walk(parseInline(b.text));
    else if (b.type === 'list') b.items.forEach((it) => walk(parseInline(it)));
    else if (b.type === 'table') {
      if (b.caption) walk(parseInline(b.caption));
      [b.header, ...b.rows].forEach((r) => r.forEach((c) => walk(parseInline(c))));
    } else if (b.type === 'figure') walk(parseInline(b.caption));
  });
  return res;
}
