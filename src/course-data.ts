import manifest from './course-manifest.json';
import rawGlossary from './course-glossary.json';

export interface CourseSource {
  lesson: string;
  paragraph: number;
  head: string;
  excerpt: string;
}

export interface CourseHistory {
  id: string;
  question: string;
  answer: string;
  sources: CourseSource[];
  version: string;
  time: number;
}

interface Block {
  lesson: string;
  start: number;
  end: number;
  size: number;
  keys: string[];
}

interface Corpus {
  version: string;
  lessons: Record<string, { title: string; paragraphs: string[] }>;
  blocks: Block[];
  postings: Record<string, number[]>;
  terms: string[];
}

const corpusCache = 'liuyao-course-corpus';
const historyKey = 'liuyao.course.history.v1';
const loaded = new Map<string, Promise<Corpus>>();
const stop = new Set('老师 讲过 提到 什么 怎么 怎么看 是不是 一定 是的 这里 里面 课程 六爻 课里 原文 怎么办 为什么 意思 问题 时间 一下 能不能 请问 一定会 可以 会不会 时候 有什么 有没有 这是什么意思 说了 什么意思 一样 什么时候'.split(' '));
const aliases: Record<string, string[]> = {
  '找东西': ['寻物'], '丢了': ['寻物'], '找不到': ['寻物'],
  '哪一天': ['应期'], '什么时候': ['应期'],
  '克回来': ['回头克'], '生回来': ['回头生'],
  '治病': ['问病', '占病'], '生病': ['问病', '占病'],
  '动就不空': ['空亡'], '动不为空': ['空亡'],
};

export function loadCorpus(version = manifest.version): Promise<Corpus> {
  if (!/^[a-f0-9]{16}$/.test(version)) return Promise.reject(new Error('Invalid corpus version'));
  const existing = loaded.get(version);
  if (existing) return existing;
  const base = window.location.protocol === 'file:'
    ? 'https://czh2403643561-lab.github.io/liuyao-paipan/'
    : document.baseURI;
  const url = new URL('course/' + version + '.json', base).href;
  const reading = (async () => {
    const disk = typeof caches !== 'undefined' ? await caches.open(corpusCache).catch(() => undefined) : undefined;
    const cached = await disk?.match(url).catch(() => undefined);
    const response = cached ?? await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error('Course corpus unavailable');
    const uncached = !cached && disk ? response.clone() : undefined;
    const corpus: Corpus = await response.json();
    if (corpus.version !== version || !corpus.lessons || !corpus.blocks || !corpus.postings) {
      if (cached) await disk?.delete(url).catch(() => false);
      throw new Error('Invalid course corpus');
    }
    if (uncached) await disk?.put(url, uncached).catch(() => undefined);
    return corpus;
  })().catch(error => {
    loaded.delete(version);
    throw error;
  });
  loaded.set(version, reading);
  return reading;
}

export function readCourseHistory(): CourseHistory[] {
  try {
    const data = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
    return Array.isArray(data) ? data.slice(0, 200) : [];
  } catch {
    return [];
  }
}

export function writeCourseHistory(history: CourseHistory[]) {
  try {
    localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 200)));
    return true;
  } catch {
    return false;
  }
}

const glossary = rawGlossary as Record<string, { lessons: string[]; count: number }>;
const knownTerms = Object.keys(glossary).sort((a, b) => b.length - a.length);
const byCorpus = new WeakMap<Corpus, Passage[]>();
type Passage = { lesson: string; index: number; title: string; text: string; next: string };
type RankedPassage = { passage: Passage; score: number; focus: string[] };

const variants: Record<string, string[]> = {
  旬空: ['空亡', '逢空'], 空亡: ['旬空', '逢空'],
  元神: ['原神'], 原神: ['元神'],
  静卦: ['无动爻', '没有动爻'], 三冲: ['六冲', '相冲'],
  卦身: ['世爻', '持世'], 病神: ['问病', '占病', '官鬼'],
  持官鬼: ['官鬼持世', '世爻是官鬼', '官鬼'],
  世应口诀: ['天同二世', '天变五', '寻宫诀'],
  化进神: ['化进', '进神'], 化退神: ['化退', '退神'],
  入墓: ['入库', '墓库'], 飞伏: ['飞神', '伏神'],
};

function tokenize(question: string): string[] {
  const words = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(question), token => token.segment)
    : question.match(/[\u3400-\u9fff]+/gu) ?? [];
  return [...new Set(words.filter(word => /^[\u3400-\u9fff]{2,10}$/u.test(word) && !stop.has(word)))];
}

function passages(corpus: Corpus) {
  let existing = byCorpus.get(corpus);
  if (!existing) {
    existing = Object.entries(corpus.lessons).flatMap(([lesson, {title, paragraphs}]) =>
      paragraphs.map((text, index) => ({ lesson, index, title, text, next: paragraphs[index + 1] ?? '' })));
    byCorpus.set(corpus, existing);
  }
  return existing;
}

export function splitQuestion(question: string) {
  const clauses = question.split(/[？?。！!；;，,]+/).map(part => part.trim()).filter(Boolean);
  const parts: string[] = [];
  let prefix = '';
  for (const clause of clauses) {
    if (/怎么|为何|为什么|何时|何谓|哪|多少|能否|吗$|呢$|一样|要看|区别/.test(clause)) {
      parts.push(prefix + clause);
      prefix = '';
    } else {
      prefix += clause;
    }
  }
  if (prefix) parts.push(prefix);
  return parts.length ? parts : [question];
}

function exactTerms(question: string) {
  return knownTerms.filter(term => question.includes(term));
}

export function guideTopics(question: string, contexts: string[]) {
  const terms = exactTerms(question.normalize('NFKC'));
  return terms.filter(term => !terms.some(other => other !== term && other.includes(term))
    && contexts.some(text => text.includes(term)))
    .sort((a, b) => question.indexOf(a) - question.indexOf(b)).slice(0, 4);
}

function conceptClues(question: string): string[] {
  const clues = [];
  const held = /世(?:爻)?持(官鬼|子孙|妻财|父母|兄弟)|(官鬼|子孙|妻财|父母|兄弟)持世/.exec(question);
  if (held) {
    const relative = held[1] ?? held[2];
    clues.push(relative + '持世', '世爻持了' + relative, '世爻是' + relative);
  }
  if (/吉|凶|好坏|好还是坏/.test(question)) {
    clues.push('占病', '问病', '病去了', '回头克官', '忌神', '反而', '具体问题', '化废', '不能一概');
  }
  if (/暗动/.test(question)) {
    clues.push('有气', '有能量', '不能同时', '其中一方', '月日都冲', '直接冲死', '所冲', '月生', '日生', '被月', '日冲', '短期', '长久');
  }
  if (/(?:动爻|静爻).{0,3}空|动.{0,5}静.{0,6}一样|动(?:就不空|不为空)/.test(question)) {
    clues.push('动就不空', '动不为空', '动了就不空', '静爻逢空', '空亡');
  }
  if (/填实|(?:空|何时).{0,12}(?:实|填)/.test(question)) {
    clues.push('冲的时候可以填实', '自到', '就只有这两个', '冲空', '冲实', '临值');
  }
  if (/出伏|飞伏|伏藏/.test(question)) {
    clues.push('飞神生伏神', '飞生伏', '日月生旺', '冲开飞神', '飞神旬空', '不宜空破', '忌神来克');
  }
  if (/静卦/.test(question)) {
    clues.push('静卦就是', '断卦五步', '五个点', '五步', '第一步', '第二步', '没有动爻', '无动爻', '用旺世兴', '可以允许有暗动');
  }
  return clues;
}

function rankPassages(all: Passage[], question: string, inherited: string[], expanded: boolean) {
  const exact = exactTerms(question);
  const inferred = Object.entries(aliases).flatMap(([phrase, terms]) => question.includes(phrase) ? terms : []);
  const terms = [...new Set([...exact, ...inferred])];
  const clues = conceptClues(question);
  const related = expanded
    ? [...new Set([...terms.flatMap(term => variants[term] ?? []), ...inherited, ...clues])]
      .filter(term => !terms.includes(term))
    : [];
  const words = tokenize(question).filter(word => !terms.some(term => term.includes(word)));
  const wordCoverage = new Map(words.map(word => [word, all.filter(p => p.text.includes(word)).length]));
  const rank: RankedPassage[] = [];
  for (const passage of all) {
    const matched = terms.filter(term => passage.text.includes(term));
    const alternate = related.filter(word => passage.text.includes(word));
    const matchedWords = words.filter(word => passage.text.includes(word));
    if (!matched.length && !alternate.length && (matchedWords.length < 2 &&
        (!expanded || matchedWords.length !== 1 || (wordCoverage.get(matchedWords[0]) ?? 0) < 2))) continue;

    const cueHits = clues.filter(word => passage.text.includes(word));
    const nextCueCount = clues.filter(word => passage.next.includes(word)).length;
    const main = matched.filter(term => glossary[term]?.lessons.includes(passage.lesson)).length;
    const mainTitle = matched.filter(term => passage.title.includes(term)).length;
    const wordScore = matchedWords.reduce((sum, word) => sum + Math.log1p(all.length / (1 + (wordCoverage.get(word) ?? 0))), 0);
    const matchScore = matched.reduce((sum, term) => sum + 8 + Math.min(6, Math.max(0, term.length - 2) * 2), 0);
    const score = matchScore + main * 6 + mainTitle * 18 + wordScore
      + cueHits.reduce((sum, word) => sum + 2 + Math.min(12, word.length * 2), 0)
      + (cueHits.includes('动就不空') ? 16 : 0)
      + nextCueCount * 1.4 + alternate.length * 3;
    if (matched.length || score >= (expanded ? 3 : 7)) {
      rank.push({ passage, score, focus: [...cueHits, ...matched, ...alternate, ...matchedWords] });
    }
  }
  return rank.sort((a, b) => b.score - a.score);
}

function passageKey({ lesson, index }: Passage) {
  return lesson + ':' + index;
}

function excerpt(text: string, focus: string[]) {
  const index = focus.map(word => text.indexOf(word)).find(pos => pos >= 0) ?? 0;
  const start = Math.max(0, index - 31);
  const end = start + 145;
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function searchCourse(corpus: Corpus, rawQuestion: string) {
  const question = rawQuestion.normalize('NFKC');
  const all = passages(corpus);
  const exact = exactTerms(question);
  const parts = splitQuestion(question);
  const rankings = parts.map(part => {
    const strict = rankPassages(all, part, [], false);
    return strict.length ? strict : rankPassages(all, part, exact, true);
  });
  const global = rankPassages(all, question, [], false);
  const any = global.length || rankings.some(list => list.length);
  const broad = any ? [] : rankPassages(all, question, [], true);
  const evidence = [...rankings.flat(), ...global, ...broad].sort((a, b) => b.score - a.score);

  const chosen: RankedPassage[] = [];
  const seen = new Set<string>();
  const courseCounts = new Map<string, number>();
  let chars = 0;
  function add(hit: RankedPassage | undefined, priority = false) {
    if (!hit || chosen.length >= 8 || seen.has(passageKey(hit.passage))) return false;
    const { lesson, text, next } = hit.passage;
    const size = text.length + next.length + 1;
    if (chars + size > 6000 || (!priority && (courseCounts.get(lesson) ?? 0) >= 2)) return false;
    courseCounts.set(lesson, (courseCounts.get(lesson) ?? 0) + 1);
    chars += size;
    chosen.push(hit);
    seen.add(passageKey(hit.passage));
    return true;
  }

  for (const list of rankings) {
    if (list.length && !list.some(hit => seen.has(passageKey(hit.passage)) && hit.score >= list[0].score * .75)) {
      list.some(hit => add(hit, true));
    }
  }
  for (const term of exact) {
    if (!chosen.some(hit => hit.passage.text.includes(term))) {
      const precise = all.filter(passage => passage.text.includes(term));
      const best = evidence.find(hit => hit.passage.text.includes(term));
      const backup = precise.find(passage => glossary[term].lessons.includes(passage.lesson)) ?? precise[0];
      if (!add(best ?? (backup && { passage: backup, score: 0, focus: [term] }), true) && !precise.length) {
        const related = variants[term] ?? [];
        const fallback = evidence.find(hit => related.some(word => hit.passage.text.includes(word)))
          ?? all.filter(passage => related.some(word => passage.text.includes(word)))
            .map(passage => ({ passage, score: 0, focus: related }))[0];
        add(fallback, true);
      }
    }
  }
  for (const list of rankings) {
    if (parts.length > 1 && list.length) {
      list.some(hit => hit.score >= list[0].score * .6 && add(hit));
    }
  }

  const best = evidence[0]?.score ?? 0;
  for (const hit of evidence) {
    if ((courseCounts.get(hit.passage.lesson) ?? 0) === 0 && hit.score >= best * .38) add(hit);
  }
  for (const hit of evidence) {
    if (hit.score >= best * .38) add(hit);
  }

  return chosen.map(({ passage, focus, score }) => ({
    source: {
      lesson: passage.lesson,
      paragraph: passage.index,
      head: passage.title,
      excerpt: excerpt(passage.text, focus),
    },
    paragraphText: passage.text,
    score,
    text: [passage.text, passage.next].filter(Boolean).join('\n'),
  }));
}
