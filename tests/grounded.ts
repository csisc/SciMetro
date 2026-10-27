/**
 * Grounded synthesis of prior studies with a language model.
 *
 * The model sees only numbered sources (title, year, abstract). Its output is validated sentence by
 * sentence and anything that cannot be traced to the sources is dropped:
 *   - every sentence must cite at least one known source tag [S1], [S2], ...;
 *   - every number in a sentence must appear in the text of a source it cites.
 * Unsupported prose therefore never reaches the manuscript. The validator is deterministic and
 * unit-tested; the model call is injected so that it can be replaced or mocked.
 */
import { Citer } from './references';

export interface SourceForSynthesis {
  tag: string; // "S1"
  key: string; // citation key registered in the Citer
  year: number;
  title: string;
  abstract: string;
}

export function buildSynthesisPrompt(topic: string, sources: SourceForSynthesis[]): string {
  const body = sources
    .map((s) => `[${s.tag}] (${s.year}) ${s.title}\nAbstract: ${s.abstract.slice(0, 900)}`)
    .join('\n\n');
  return `You are writing one short paragraph of a literature review on "${topic}".
Use ONLY the numbered sources below. Rules:
- 3 to 5 sentences, at most 150 words, neutral academic tone.
- End every sentence with the tag(s) of the source(s) it relies on, e.g. [S1] or [S2][S3].
- Do not state any number, percentage or year that does not appear in the cited source.
- Do not describe methods or findings that the abstracts do not state. If a source gives no abstract, mention only its title.
- Do not add references that are not listed.

SOURCES
${body}

PARAGRAPH:`;
}

const NUM_RE = /\d[\d.,]*\d|\d/g;

const norm = (t: string) => t.replace(/[,\u202f ]/g, '');

export function validateSynthesis(
  text: string,
  sources: SourceForSynthesis[],
  cite: Citer
): { text: string; kept: number; dropped: number } {
  const byTag = new Map(sources.map((s) => [s.tag, s]));
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: { body: string; keys: string[] }[] = [];
  let dropped = 0;
  for (const sent of sentences) {
    const tags = [...sent.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]);
    if (!tags.length || tags.some((t) => !byTag.has(t))) {
      dropped++;
      continue;
    }
    const cited = [...new Set(tags)].map((t) => byTag.get(t)!);
    const pool = norm(cited.map((x) => `${x.year} ${x.title} ${x.abstract}`).join(' '));
    const body = sent.replace(/\[(S\d+)\]/g, '').trim();
    const nums = (body.match(NUM_RE) || []).map((n) => norm(n).replace(/[.,]$/, ''));
    if (nums.some((n) => !pool.includes(n))) {
      dropped++;
      continue;
    }
    valid.push({ body, keys: cited.map((x) => x.key) });
  }
  const chosen = valid.slice(0, 5);
  // Citations are registered only for sentences that are actually kept.
  const joined = chosen
    .map((v) => `${v.body.replace(/\s+([.!?])$/, '$1').replace(/[.!?]$/, '')} ${cite.p(...v.keys)}.`)
    .join(' ');
  return { text: joined, kept: chosen.length, dropped };
}

export async function synthesizePrior(
  topic: string,
  sources: SourceForSynthesis[],
  cite: Citer,
  callModel: (prompt: string) => Promise<string>
): Promise<string> {
  if (sources.filter((s) => s.abstract.length > 40).length < 2) return '';
  const raw = await callModel(buildSynthesisPrompt(topic, sources));
  // Validate against a throw-away citer so a rejected draft leaves no stray references behind.
  const v = validateSynthesis(raw, sources, cite.fresh());
  if (v.kept < 2) return '';
  return validateSynthesis(raw, sources, cite).text;
}
