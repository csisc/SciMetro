import test from 'node:test';
import assert from 'node:assert/strict';
import {
  norm, isUsableTerm, selectRelatedIds, collectQueryTerms, buildQueryGroups, ensureMainTerms,
  matchesTerm, matchesQuery, extractEntityTerms, classifyOntologyRows, relationCounts,
} from '../src/services/terms';
import type { TermPack } from '../src/types';

const pack = (id: string, rel: string, en: string, aliases: string[] = [], rank = 0, extra: Record<string, string> = {}): TermPack => ({
  id, rel, rank, labels: { en, ...extra }, aliases: { en: aliases },
});

test('normalisation is case-, accent- and dash-insensitive', () => {
  assert.equal(norm('  Génomique  Étendue '), 'genomique etendue');
  assert.equal(norm('Co–operation'), 'co-operation');
  assert.equal(norm('تَونُس'), norm('تونس'));
});

test('usable terms: specific enough, any script', () => {
  assert.equal(isUsableTerm('AI'), false);
  assert.equal(isUsableTerm('wiki'), true);
  assert.equal(isUsableTerm('the'), false);
  assert.equal(isUsableTerm('2019'), false);
  assert.equal(isUsableTerm('génomique'), true); // non-ASCII was previously dropped
  assert.equal(isUsableTerm('تونس'), true);
  assert.equal(isUsableTerm('人工'), true);      // two CJK characters are specific
  assert.equal(isUsableTerm('x'.repeat(90)), false);
});

test('related ids: broader items are never searched; ranked by sitelinks within relation priority', () => {
  const terms = [
    pack('Q1', 'main', 'Tunisia'),
    pack('Q10', 'broader', 'country', [], 9999),
    pack('Q11', 'broader', 'sovereign state', [], 9000),
    pack('Q20', 'narrower', 'Tunis', [], 50),
    pack('Q21', 'narrower', 'Sfax', [], 200),
    pack('Q30', 'instance', 'Tunisian city', [], 5),
    pack('Q40', 'same as', 'Ifriqiya', [], 1), // equivalents are not used
    pack('Q41', 'part', 'Tunisian region', [], 1),
  ];
  assert.deepEqual(selectRelatedIds(terms), ['Q21', 'Q20', 'Q30', 'Q41']);
  assert.deepEqual(selectRelatedIds(terms, 2), ['Q21', 'Q20']);
});

test('related ids respect per-relation caps (80 narrower)', () => {
  const terms = [pack('Q1', 'main', 'X'), ...Array.from({ length: 120 }, (_, i) => pack('Q' + (100 + i), 'narrower', 'Sub' + i, [], i))];
  const ids = selectRelatedIds(terms, 500);
  assert.equal(ids.length, 80);
  assert.equal(ids[0], 'Q219'); // highest rank first
});

test('query terms: all main labels, aliases and non-ASCII terms are kept; short and broader ones are not', () => {
  const terms = [
    pack('Q1', 'main', 'Scientometrics', ['bibliometry', 'science of science', 'AI'], 0, { fr: 'Scientométrie', ar: 'علم القياس' }),
    pack('Q2', 'narrower', 'Altmetrics', ['alternative metrics'], 40),
    pack('Q3', 'broader', 'information science', ['library science'], 999),
  ];
  const q = collectQueryTerms(terms);
  assert.deepEqual(q.main.map(norm), ['scientometrics', 'scientometrie', 'علم القياس', 'bibliometry', 'science of science']);
  assert.deepEqual(q.related.map(norm), ['altmetrics', 'alternative metrics']);
  assert.ok(!q.all.some((t) => /information science|library science/i.test(t)));
  assert.ok(!q.all.includes('AI'));
  assert.deepEqual(buildQueryGroups(terms)[0].slice(0, 2), ['scientometrics', 'scientométrie']);
});

test('query terms are deduplicated across items and capped', () => {
  const terms = [pack('Q1', 'main', 'Alpha'), pack('Q2', 'narrower', 'alpha'), ...Array.from({ length: 300 }, (_, i) => pack('Q' + (10 + i), 'instance', 'Gadget ' + i, [], i))];
  const q = collectQueryTerms(terms, { maxTerms: 100 });
  assert.equal(q.all.length, 100);
  assert.equal(q.all.filter((t) => norm(t) === 'alpha').length, 1);
});

test('LLM groups cannot drop the main-item terms', () => {
  const g = ensureMainTerms([['biblio'], ['health']], ['Scientometrics', 'Bibliometry']);
  assert.deepEqual(g, [['biblio', 'scientometrics', 'bibliometry'], ['health']]);
});

test('title matching uses word boundaries (no "ai" in "maintain", no "oman" in "woman")', () => {
  assert.equal(matchesTerm('How to maintain datasets', 'ai'), false);
  assert.equal(matchesTerm('Woman in science', 'oman'), false);
  assert.equal(matchesTerm('Indiana University study', 'india'), false);
  assert.equal(matchesTerm('Research in India today', 'india'), true);
  assert.equal(matchesTerm('Wikipedia quality', 'wiki'), false);        // short term must match whole word
  assert.equal(matchesTerm('The wiki way', 'wiki'), true);
});

test('title matching allows plurals and demonyms for longer terms and ignores accents', () => {
  assert.equal(matchesTerm('Bibliometrics of health', 'bibliometric'), true);
  assert.equal(matchesTerm('Tunisian women in science', 'Tunisia'), true);
  assert.equal(matchesTerm('Étude de la génomique', 'genomique'), true);
  assert.equal(matchesTerm('Tunisiaville farm', 'Tunisia'), false); // five trailing letters: a different word
  assert.equal(matchesTerm('الأمراض في تونس', 'تونس'), true);
});

test('query matching: groups are ANDed, terms ORed', () => {
  const g = [['cancer', 'tumor'], ['tunisia']];
  assert.equal(matchesQuery('Breast cancer in Tunisia', g), true);
  assert.equal(matchesQuery('Breast cancer in France', g), false);
  assert.equal(matchesQuery('anything', []), true);
});

const entity = {
  labels: { en: { language: 'en', value: 'Tunisia' }, fr: { language: 'fr', value: 'Tunisie' }, de: { language: 'de', value: 'Tunesien' }, mul: { language: 'mul', value: 'Tunisia' } },
  aliases: { en: [{ value: 'Republic of Tunisia' }, { value: 'tunisia' }], fr: [{ value: 'République tunisienne' }], ja: [{ value: 'チュニジア' }] },
  sitelinks: { enwiki: { title: 'Tunisia' }, frwiki: { title: 'Tunisie' }, dewiki: { title: 'Tunesien' }, commonswiki: { title: 'Category:Tunisia' }, zhwiki: { title: '突尼斯' }, eswiki: { title: 'Túnez' } },
  claims: {
    P1448: [{ mainsnak: { datavalue: { value: { text: 'al-Jumhūriyya at-Tūnisiyya', language: 'en' } } } }],
    P1549: [{ mainsnak: { datavalue: { value: { text: 'Tunisian', language: 'en' } } } }, { mainsnak: { datavalue: { value: { text: 'tunisien', language: 'fr' } } } }],
    P225: [{ mainsnak: { datavalue: { value: 'Tunisia officinalis' } } }],
  },
};

test('entity terms: languages, mul, aliases, sitelinks, official names and demonyms; no duplicates', () => {
  const t = extractEntityTerms(entity, ['en', 'fr', 'es']);
  assert.deepEqual(Object.keys(t.labels).sort(), ['en', 'fr', 'mul']);
  assert.ok(!('de' in t.labels));
  const all = [...Object.values(t.labels), ...Object.values(t.aliases).flat()];
  assert.ok(all.includes('Republic of Tunisia') && all.includes('République tunisienne'));
  assert.ok(all.includes('Túnez'), 'sitelink title in a requested language');
  assert.ok(all.includes('Tunisian') && all.includes('tunisien'), 'demonyms');
  assert.ok(all.includes('al-Jumhūriyya at-Tūnisiyya'), 'official name');
  assert.ok(all.includes('Tunisia officinalis'), 'string-valued name statement');
  assert.ok(!all.some((x) => /Category/.test(x)), 'no namespaced titles');
  assert.ok(!all.includes('チュニジア') && !all.includes('突尼斯'), 'languages not requested are excluded');
  const al = Object.values(t.aliases).flat().map(norm);
  const lb = Object.values(t.labels).map(norm);
  assert.equal(new Set(al).size, al.length, 'duplicate aliases');
  assert.ok(!al.some((a) => lb.includes(a)), 'an alias repeats a label');
});

test('ontology rows: best relation wins, ranked by sitelinks, capped; self and invalid ids ignored', () => {
  const rows = [
    { item: 'http://www.wikidata.org/entity/Q5', rel: 'broader', sl: '300' },
    { item: 'http://www.wikidata.org/entity/Q5', rel: 'narrower', sl: '300' },
    { item: 'http://www.wikidata.org/entity/Q6', rel: 'narrower', sl: '10' },
    { item: 'http://www.wikidata.org/entity/Q7', rel: 'narrower', sl: '90' },
    { item: 'http://www.wikidata.org/entity/Q1', rel: 'narrower', sl: '5' },
    { item: 'http://www.wikidata.org/entity/L99', rel: 'narrower', sl: '5' },
    { item: 'http://www.wikidata.org/entity/Q8', rel: 'same as' },
  ];
  const out = classifyOntologyRows(rows, 'Q1');
  assert.deepEqual(out.map((x) => `${x.id}:${x.rel}`), ['Q5:narrower', 'Q7:narrower', 'Q6:narrower']);
  const many = Array.from({ length: 200 }, (_, i) => ({ item: 'http://www.wikidata.org/entity/Q' + (100 + i), rel: 'broader', sl: String(i) }));
  assert.equal(classifyOntologyRows(many, 'Q1').length, 15);
  assert.deepEqual(relationCounts([pack('Q1', 'main', 'x'), ...out.map((x) => pack(x.id, x.rel, 'y'))]), { narrower: 3 });
});
