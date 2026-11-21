import { Solar } from 'lunar-javascript';
export type LineInput = { yang: boolean; moving: boolean };
type Trigram = { name: string; lines: boolean[]; element: string };
type PillarData = { year: string; month: string; day: string; hour: string; monthBranch: string; dayBranch: string; voids: string[] };

export const trigrams: Trigram[] = [
  { name: '乾', lines: [true, true, true], element: '金' }, { name: '兑', lines: [true, true, false], element: '金' },
  { name: '离', lines: [true, false, true], element: '火' }, { name: '震', lines: [true, false, false], element: '木' },
  { name: '巽', lines: [false, true, true], element: '木' }, { name: '坎', lines: [false, true, false], element: '水' },
  { name: '艮', lines: [false, false, true], element: '土' }, { name: '坤', lines: [false, false, false], element: '土' },
];
const names: Record<string, string> = {
  '乾乾':'乾为天','坤坤':'坤为地','坎震':'水雷屯','艮坎':'山水蒙','坎乾':'水天需','乾坎':'天水讼','坤坎':'地水师','坎坤':'水地比',
  '乾巽':'天风姤','巽乾':'风天小畜','乾兑':'天泽履','兑乾':'泽天夬','坤震':'地雷复','震坤':'雷地豫','坤艮':'地山谦','艮坤':'山地剥','乾震':'天雷无妄',
  '震乾':'雷天大壮','乾艮':'天山遁','坤巽':'地风升','巽坤':'风地观','离坎':'火水未济','坎离':'水火既济','离乾':'火天大有','乾离':'天火同人',
  '巽离':'风火家人','离兑':'火泽睽','兑坎':'泽水困','坎兑':'水泽节','艮震':'山雷颐','震艮':'雷山小过','兑巽':'泽风大过','巽兑':'风泽中孚',
  '坎艮':'水山蹇','震巽':'雷风恒','巽震':'风雷益','兑离':'泽火革','离巽':'火风鼎','震离':'雷火丰','离震':'火雷噬嗑',
  '艮兑':'山泽损','兑艮':'泽山咸','震兑':'雷泽归妹','兑震':'泽雷随','巽艮':'风山渐','艮巽':'山风蛊','巽坎':'风水涣','坎巽':'水风井',
  '离坤':'火地晋','坤离':'地火明夷','兑坤':'泽地萃','坤兑':'地泽临','巽巽':'巽为风','震震':'震为雷','艮艮':'艮为山','兑兑':'兑为泽',
  '乾坤':'天地否','离离':'离为火','离艮':'火山旅','震坎':'雷水解','坎坎':'坎为水','艮乾':'山天大畜','艮离':'山火贲','坤乾':'地天泰',
};
const five = ['木','火','土','金','水'];
export const branchElement: Record<string, string> = { 子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' };
const branchByTrigram: Record<string, string[]> = { 乾:['子','寅','辰','午','申','戌'],兑:['巳','卯','丑','亥','酉','未'],离:['卯','丑','亥','酉','未','巳'],震:['子','寅','辰','午','申','戌'],巽:['丑','亥','酉','未','巳','卯'],坎:['寅','辰','午','申','戌','子'],艮:['辰','午','申','戌','子','寅'],坤:['未','巳','卯','丑','亥','酉'] };
const stemByTrigram: Record<string, string> = {乾:'甲',兑:'丁',离:'己',震:'庚',巽:'辛',坎:'戊',艮:'丙',坤:'乙'};
const trigramByBits = new Map(trigrams.map(t => [t.lines.map(Number).join(''), t]));

function trigram(lines: boolean[]): Trigram { return trigramByBits.get(lines.map(Number).join(''))!; }
function lunarAt(date: string) {
  const [year, month, day, hour, minute] = date.split(/[-T:]/).map(Number);
  return Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar();
}

export function instantLines(date: string): LineInput[] {
  const lunar = lunarAt(date);
  // getMonth() uses a negative number for a leap month, such as -6 for 闰六月.
  const upperTotal = lunar.getYearZhiIndex() + 1 + Math.abs(lunar.getMonth()) + lunar.getDay();
  const total = upperTotal + lunar.getTimeZhiIndex() + 1;
  const upper = trigrams[(upperTotal % 8 || 8) - 1];
  const lower = trigrams[(total % 8 || 8) - 1];
  const movingAt = (total % 6 || 6) - 1;
  return [...lower.lines, ...upper.lines].map((yang, index) => ({ yang, moving: index === movingAt }));
}

export function solarPillars(date: string): PillarData {
  const lunar = lunarAt(date);
  const y = lunar.getYearInGanZhiExact(); const m = lunar.getMonthInGanZhiExact();
  // Exact 口径在 23:00 换日，日柱和旬空必须使用同一口径。
  const d = lunar.getDayInGanZhiExact(); const h = lunar.getTimeInGanZhi();
  const voids = [...lunar.getDayXunKongExact()];
  return { year:y, month:m, day:d, hour:h, monthBranch:m[1], dayBranch:d[1], voids };
}
export function sixGods(dayStem: string): string[] {
  const start: Record<string, number> = {甲:0,乙:0,丙:1,丁:1,戊:2,己:3,庚:4,辛:4,壬:5,癸:5};
  const order = ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
  return Array.from({length:6}, (_, i) => order[(start[dayStem] + i) % 6]);
}
export const dayStems = [...'甲乙丙丁戊己庚辛壬癸'];
export const calendarBranches = Object.keys(branchElement);
export type ChartCalendar = { mode: 'current' | 'custom'; monthBranch: string; dayStem: string; dayBranch: string };

export function dayVoids(stem: string, branch: string): string[] | undefined {
  const gan = dayStems.indexOf(stem);
  const zhi = calendarBranches.indexOf(branch);
  if (gan < 0 || zhi < 0 || gan % 2 !== zhi % 2) return;
  const start = (zhi - gan + 12) % 12;
  return [calendarBranches[(start + 10) % 12], calendarBranches[(start + 11) % 12]];
}
function palaceFor(bits: boolean[]): { palace: Trigram; 世: number; 游归: string } {
  for (const palace of trigrams) {
    const pure = [...palace.lines, ...palace.lines];
    const stages = [
      { flips: [], 世: 5, 游归: '' },
      { flips: [0], 世: 0, 游归: '' },
      { flips: [0, 1], 世: 1, 游归: '' },
      { flips: [0, 1, 2], 世: 2, 游归: '' },
      { flips: [0, 1, 2, 3], 世: 3, 游归: '' },
      { flips: [0, 1, 2, 3, 4], 世: 4, 游归: '' },
      { flips: [0, 1, 2, 4], 世: 3, 游归: '游魂' },
      { flips: [4], 世: 2, 游归: '归魂' },
    ];
    const hit = stages.find(({ flips }) => pure.every((yang, index) => bits[index] === (flips.includes(index) ? !yang : yang)));
    if (hit) return { palace, 世: hit.世, 游归: hit.游归 };
  }
  throw new Error('找不到对应的八宫卦位');
}
function relatives(palaceElement:string, element:string):string {
  if(element===palaceElement)return '兄弟';
  if(five[(five.indexOf(element)+1)%5]===palaceElement)return '父母';
  if(five[(five.indexOf(palaceElement)+1)%5]===element)return '子孙';
  if(five[(five.indexOf(palaceElement)+2)%5]===element)return '妻财';
  return '官鬼';
}
export function hexagramName(upper: Trigram, lower: Trigram): string {
  return names[upper.name + lower.name] ?? upper.name + lower.name;
}

export function listHexagrams() {
  return trigrams.flatMap((upper, u) => trigrams.map((lower, l) => ({
    u, l, name: hexagramName(upper, lower),
    palace: palaceFor([...lower.lines, ...upper.lines]).palace.name,
  })));
}
export function castChart(lines: LineInput[], date: string, calendar?: ChartCalendar) {
  const pillars=solarPillars(date); const original=lines.map(l=>l.yang); const changed=lines.map(l=>l.moving?!l.yang:l.yang);
  if (calendar?.mode === 'custom') {
    pillars.monthBranch = calendar.monthBranch;
    pillars.day = calendar.dayStem + calendar.dayBranch;
    pillars.dayBranch = calendar.dayBranch;
    pillars.voids = dayVoids(calendar.dayStem, calendar.dayBranch)!;
  }
  const lower=trigram(original.slice(0,3)), upper=trigram(original.slice(3)); const lower2=trigram(changed.slice(0,3)),upper2=trigram(changed.slice(3));
  const palace=palaceFor(original); const palace2=palaceFor(changed); const voids=pillars.voids;
  const make = (bits: boolean[], palaceElement: string) => bits.map((yang, i) => {
    const t = trigram(i < 3 ? bits.slice(0, 3) : bits.slice(3));
    const branch = branchByTrigram[t.name][i];
    const outerStem = t.name === '乾' ? '壬' : t.name === '坤' ? '癸' : undefined;
    const stem = i >= 3 && outerStem ? outerStem : stemByTrigram[t.name];
    const element = branchElement[branch];
    return { yang, branch, stem, element, relative: relatives(palaceElement, element), empty: voids.includes(branch) };
  });
  const lines1=make(original,palace.palace.element); const lines2=make(changed,palace.palace.element);
  const dateGods=sixGods(pillars.day[0]);
  const pure = palace.palace.lines;
  const hidden = make([...pure, ...pure], palace.palace.element)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !lines1.some(main => main.relative === line.relative));
  const sixClash=new Set(['子午','丑未','寅申','卯酉','辰戌','巳亥']);
  const clash=(ls:typeof lines1)=>[0,1,2].every(i=>sixClash.has(ls[i].branch+ls[i+3].branch)||sixClash.has(ls[i+3].branch+ls[i].branch));
  return {pillars,lines,lines1,lines2,lower,upper,lower2,upper2,palace,palace2,dateGods,hidden,name:hexagramName(upper,lower),changedName:hexagramName(upper2,lower2),clash:clash(lines1),changedClash:clash(lines2),hiddenList:hidden};
}


