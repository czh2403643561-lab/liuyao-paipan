export const mimo = {
  endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
  platform: 'https://platform.xiaomimimo.com/',
  model: 'mimo-v2.6-flash',
} as const;

export const courseSystemPrompt = '你是「查课」助手，帮用户在《六爻课程（周姨）001–031课修订版》里找原文出处。下面会给你若干段课程原文（每段都标了课号），你只能依据这些原文回答：\n'
  + '1）最终只输出一个自然段、两三句、最多 180 字。第一句直接点出至少一条能在这些原文找到的具体事实、条件或例外，并紧跟对应课号。其余句说明阅读线索；不要只重复术语或课名，不写标题、列表、结论或额外解释；\n'
  + '2）引用原文时用引号，并标注课号，如〔第030课〕；\n'
  + '3）原文里没有的内容就直说「这几段原文里没有」，不许用课外知识替老师下结论，更不许编造原文；\n'
  + '4）说人话，简短，别绕，别用书面腔；\n'
  + '5）原文之间有条件区别时（比如某条只在占病时成立），把条件讲清楚。\n'
  + '6）原文里跟在「但是、除非、如果、只有」后面的限制必须一起说。说不全时，宁可写「这几段主要讲……」引导用户去看原文，也不要把带条件的说法当成通则。\n'
  + '7）不能确认逐字吻合的引文只可转述，不许加引号。\n'
  + '用户的问题和检索到的原文段会在后面给出。';

export function verifyCourseGuide(text: string, passages: { lesson: string; text: string }[]) {
  const citation = /(?:〔|【|\[)?第\s*(\d{3})\s*课(?:\s*(?:〕|】|\]))?/g;
  const known = new Set(passages.map(passage => passage.lesson));
  const quotes = /「([^」\n]+)」|『([^』\n]+)』|“([^”\n]+)”|‘([^’\n]+)’|"([^"\n]+)"|'([^'\n]+)'/g;
  return text.replace(quotes, (quote, ...parts) => {
    const position: number = parts.at(-2);
    const exact: string = parts.slice(0, 6).find(part => part !== undefined);
    const before = text.slice(0, position).split(/[。！？\n]/).at(-1) ?? '';
    const after = text.slice(position + quote.length).split(/[。！？\n「『“‘"']/)[0];
    const cited = [...after.matchAll(citation)][0]?.[1] ?? [...before.matchAll(citation)].at(-1)?.[1];
    return passages.some(passage => (!cited || passage.lesson === cited) && passage.text.includes(exact)) ? quote : exact;
  }).replace(citation, (label, id) => known.has(id) ? label : '');
}

export function formatCourseGuide(
  text: string,
  passages: { lesson: string; head: string; text: string }[],
  topics: string[],
  evidence: string[] = [],
) {
  const lead = text.trim().split(/\r?\n\s*\r?\n/, 1)[0].replace(/^\*\*|\*\*$/g, '');
  const guide = verifyCourseGuide(lead, passages).trim()
    .replace(/^这[两三四五六七八]段主要讲/, '这几段主要讲')
    .replace(/([。！？])\s*(?:下面按|下面分|下面逐|以下按)[\s\S]*$/, '$1');
  const sentences = guide.match(/[。！？]/g)?.length ?? 0;
  const unqualified = /一律|无论.{0,20}都|唯一通则|必然|(?<!不)一定[是要会有]|都必|必须(?:要)?(?:把飞神|冲开飞神)|官鬼(?:动化子孙后)?回头克子孙|动爻旬空|(?:月日都冲|日月同冲)[^，。；]{0,10}(?:就|也|仍|可以)暗动/.test(guide);
  const conflatedEmergence = /(?:算|叫|能)出伏[^。]{0,35}(?:且|才|必须)[^。]{0,25}忌神/.test(guide);
  const concrete = /第\s*\d{3}\s*课/.test(guide)
    && /条件|受冲|出空|自到|填实|不空|飞生伏|冲开|克|生扶|生旺|化废|化用|动爻|持世|断法|辨别|定义|区别|例外/.test(guide)
    && !/与所问相关|主要讲[^。]{0,30}中的内容/.test(guide);
  if (concrete && !unqualified && !conflatedEmergence && !guide.includes('\n') && guide.length <= 190
    && sentences >= 1 && sentences <= 3 && /[。！？]$/.test(guide)) {
    return sentences === 1 ? guide + '下方原文保留了完整语境。' : guide;
  }
  if (evidence.length) {
    return evidence.join('') + (evidence.length === 1 ? '下方原文保留了完整语境。' : '');
  }
  const heads = [...new Set(passages.map(passage => passage.head))].slice(0, 2);
  if (topics.length > 1) {
    return '这几段主要讲' + topics.join('、') + '。具体条件和例外可点开下方原文核对。';
  }
  return '这几段主要讲' + heads.join('、') + '中与所问相关的内容。具体条件和例外可点开下方原文核对。';
}

export type CourseIssue = { type: 'key' | 'balance' | 'net' } | { type: 'unknown'; status: number };

export class CourseRequestError extends Error {
  constructor(readonly issue: CourseIssue) {
    super(issue.type);
  }
}

function issueFor(status: number, body?: unknown): CourseIssue {
  const envelope = body as { error?: { code?: string | number; type?: string } } | undefined;
  const code = String(envelope?.error?.code ?? '') + ' ' + (envelope?.error?.type ?? '');
  if (status === 402 || status === 429 || /balance|insufficient[_-]?quota|quota[_-]?exceed|rate[_-]?limit|resource[_-]?exhausted|arrears|credit|billing|欠费|余额/i.test(code)) {
    return { type: 'balance' };
  }
  if (status === 401 || status === 403) return { type: 'key' };
  return { type: 'unknown', status };
}

export async function askMimo(key: string, question: string, testing = false, signal?: AbortSignal): Promise<string> {
  const messages = testing ? [{ role: 'user', content: '回一个字：好' }]
    : [{ role: 'system', content: courseSystemPrompt }, { role: 'user', content: question }];
  let response: Response;
  try {
    response = await fetch(mimo.endpoint, {
      method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: mimo.model, messages, temperature: 0.2, max_completion_tokens: testing ? 8 : 400,
        thinking: { type: 'disabled' }, stream: false,
      }),
      signal: signal ?? AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CourseRequestError({ type: 'net' });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) throw new CourseRequestError(issueFor(response.status));
    throw new CourseRequestError({ type: 'net' });
  }
  if (!response.ok || data?.error) throw new CourseRequestError(issueFor(response.status, data));
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new CourseRequestError({ type: 'unknown', status: response.status });
  }
  return content.trim();
}
