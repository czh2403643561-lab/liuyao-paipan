import { guideTopics, splitQuestion, type CourseSource } from './course-data';

export interface CourseHit {
  source: CourseSource;
  paragraphText: string;
  text: string;
  score: number;
}

type EvidenceTopic = { matches: RegExp; direct: (text: string) => boolean };
const explanation = /是指|指的|叫(?:作|做)|条件|前提|如果|比如|代表|说明|需要|要看/;

const topics: EvidenceTopic[] = [
  {
    matches: /回头克.*(?:吉|凶|好|坏|病)|(?:吉|凶|好|坏|病).*回头克/,
    direct: text => text.includes('回头克') && /具体问题|用神被回头克|占病|问病|回头克官|把官鬼克掉了|用克忌|病去了/.test(text),
  },
  {
    matches: /暗动/,
    direct: text => text.includes('暗动') && /能量没有完全|没有完全的破掉|其中一方生扶|月日都冲|没有气|短期暗动|长久日破|长期.*日破/.test(text),
  },
  {
    matches: /(?:动爻|静爻).{0,4}空|填实|空亡.*(?:怎么看|是什么|什么意思)|动(?:就不空|不为空)/,
    direct: text => /动就不空|动不为空|静爻逢空|日的空亡代表|冲的时候可以填实|自到的时候可以填实|就只有这两个/.test(text),
  },
  {
    matches: /出伏|飞伏|伏藏.{0,12}飞神|飞神.{0,12}伏(?:神|藏)/,
    direct: text => /(?:飞神|飞生伏|伏克飞)/.test(text) && /出伏|飞生伏|飞神生伏神|冲开飞神|飞神旬空|伏克飞/.test(text),
  },
  {
    matches: /静卦/,
    direct: text => text.includes('静卦') && /无动爻|没有动爻|五步|五个点|允许有暗动/.test(text),
  },
];

function selectForQuestion(question: string, hits: CourseHit[]) {
  const specific = topics.filter(topic => topic.matches.test(question));
  if (specific.length) return hits.filter(hit => specific.some(topic => topic.direct(hit.paragraphText)));
  const held = /世(?:爻)?持(官鬼|子孙|妻财|父母|兄弟)|(官鬼|子孙|妻财|父母|兄弟)持世/.exec(question);
  if (held) {
    const relative = held[1] ?? held[2];
    const mentions = new RegExp(relative + '持世|世爻持了?' + relative + '|世爻是' + relative);
    return hits.filter(hit => mentions.test(hit.paragraphText));
  }
  const terms = guideTopics(question, hits.map(hit => hit.paragraphText));
  const highest = Math.max(0, ...hits.map(hit => hit.score));
  if (!terms.length) return hits.filter(hit => hit.score >= highest * .85).slice(0, 2);
  const keywordSearch = terms.some(term => term === question.trim());
  const direct = hits.filter(hit => terms.some(term =>
    hit.paragraphText.split(/[。！？]/).some(sentence => sentence.includes(term) &&
      (keywordSearch || explanation.test(sentence)))));
  const bestDirect = Math.max(0, ...direct.map(hit => hit.score));
  return direct.filter(hit => hit.score >= bestDirect * .78).slice(0, 3);
}

export function selectDisplayedSources(question: string, hits: CourseHit[]) {
  const wanted = new Set(splitQuestion(question).flatMap(part => selectForQuestion(part, hits)));
  return hits.filter(hit => wanted.has(hit));
}

function source(hits: CourseHit[], ...words: string[]) {
  return hits.find(hit => words.every(word => hit.text.includes(word)));
}

function cite(hit: CourseHit) {
  return '〔第' + hit.source.lesson + '课〕';
}

function definitionGuide(question: string, hits: CourseHit[]) {
  const terms = guideTopics(question, hits.map(hit => hit.paragraphText));
  for (const hit of hits) {
    const sentences = hit.paragraphText.match(/[^。！？]+[。！？]/g) ?? [];
    const definition = sentences.map(sentence => sentence.trim()).find(sentence =>
      sentence.length >= 12 && sentence.length <= 96 && terms.some(term => sentence.includes(term))
      && /是指|指的是|也代表|叫做|叫作/.test(sentence)
      && !/如果|除非|只有|但是|所以|一定|必然|才|吉|凶|〔存疑〕|[「」“”]/.test(sentence));
    if (definition) return cite(hit) + '这样解释「' + definition + '」';
  }
  return '';
}

export function passageGuide(question: string, hits: CourseHit[]): string[] {
  const notes: string[] = [];
  if (/回头克/.test(question)) {
    const illness = source(hits, '回头克', '子孙', '官鬼', '病去了');
    const stopped = source(hits, '回头克', '化废', '被止住');
    if (illness) notes.push(cite(illness) + '的问病例讲的是官鬼动化子孙，子孙回头克官鬼，克掉的是病。');
    if (stopped) notes.push(cite(stopped) + '另讲了变爻化废的限制，这时回头克可能被止住。');
  }
  if (/暗动/.test(question)) {
    const support = source(hits, '暗动', '其中一方生扶') ?? source(hits, '暗动', '月日都冲', '月来冲他');
    const time = source(hits, '短期暗动', '长久日破');
    if (support) notes.push(cite(support) + '讲静爻受冲后，还要看有没有一方生扶、爻有没有气。');
    if (time) notes.push(cite(time) + '区分了受生扶时的短期暗动和长久日破。');
  }
  if (/空亡|填实|(?:动爻|静爻).{0,4}空/.test(question)) {
    const active = source(hits, '动就不空') ?? source(hits, '空亡', '动不为空');
    const full = source(hits, '冲的时候可以填实', '自到的时候可以填实');
    if (active) notes.push(cite(active) + '讲了动爻为什么不按空亡看。');
    if (full) notes.push(cite(full) + '讲了两种填实的时机，冲和自到。');
  }
  if (/出伏|飞伏|伏藏.{0,12}飞神|飞神.{0,12}伏(?:神|藏)/.test(question)) {
    const conditions = source(hits, '飞生伏', '日月生旺', '冲开飞神', '飞神旬空');
    const exception = source(hits, '飞神生伏神', '不宜空破');
    const useful = source(hits, '伏神就有用并且为吉', '忌神来克');
    if (conditions) notes.push(cite(conditions) + '按飞生伏、日月生旺、冲开飞神和飞神旬空分别讲了出伏的条件。');
    if (exception) notes.push(cite(exception) + '提醒飞神生伏神时不宜空破，冲飞会伤到生伏的元神。');
    if (useful) notes.push(cite(useful) + '还分开讲了出伏与出伏后的作用，伏神出伏后仍要看有没有发动的忌神来克。');
  }
  if (/静卦/.test(question)) {
    const definition = source(hits, '静卦就是无动爻', '允许有暗动');
    const steps = source(hits, '静卦', '五步', '用神');
    if (definition) notes.push(cite(definition) + '把静卦定义为无动爻，同时允许有暗动。');
    if (steps) notes.push(cite(steps) + '回顾了静卦的五步断法，也讲了五步覆盖不到时要另看用神等爻的状态。');
  }
  if (!notes.length) {
    const definition = definitionGuide(question, hits);
    if (definition) notes.push(definition);
  }
  return notes.slice(0, 3);
}
