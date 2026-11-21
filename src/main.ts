import './styles.css';
import { branchElement, castChart, instantLines, trigrams, type LineInput } from './domain';
import { isResultStatus, makeBackup, methodLabels, readRecords, restoreBackup, resultLabels, writeRecords, type Method, type RecordEntry } from './records';
import { makePicker } from './picker';
import { enableAppUpdates } from './app-update';
import { Solar } from 'lunar-javascript';

type EntryMethod = Exclude<Method, 'instant'>;
const lastMethod = safeGet('liuyao.method');
const initialMethod = lastMethod === 'coins' || lastMethod === 'pick' ? lastMethod : 'book';
const picker = makePicker();
const state: { method: EntryMethod; page: 'entry'|'chart'|'records'; time: string; question: string; pages: [string,string]; coins: (LineInput|null)[]; active: number; chart?: ReturnType<typeof castChart>; mode: 'all'|'moving'; settings: boolean; hidden: boolean } = {
  method: initialMethod, page: 'entry', time: currentTime(), question: '', pages: ['', ''], coins: Array(6).fill(null), active: 0,
  mode: safeGet('liuyao.transform') === 'all' ? 'all' : 'moving', settings: false, hidden: false,
};

let records = readRecords();
let openedRecord: RecordEntry | undefined;
let chartOrigin: 'entry' | 'records' | 'home-recent' = 'entry';
let recordFilter: 'recent' | 'favorite' = 'recent';
let recordSearch = '';
let revealedRecord: string | undefined;
let storageFailed = false;
let editingQuestion = false;
let backupMessage = '';
let touchStart: { id: string; x: number; y: number } | undefined;
let suppressRecordClickUntil = 0;
let timeEdited = false;

function commitRecords(next: RecordEntry[]) {
  storageFailed = !writeRecords(next);
  records = next;
}

function safeGet(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key: string, value: string): void { try { localStorage.setItem(key, value); } catch {} }
function esc(s: string): string { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function branchText(p: string): string { return [...p].map(c => branchElement[c] ? `<span class="el-${branchElement[c]}">${c}</span>` : c).join(''); }
function lineMark(yang:boolean, faint=false):string { if (faint) return '<span class="yao faint" aria-hidden="true"></span>'; return `<span class="yao ${yang?'yang':'yin'} ${faint?'faint':''}" aria-hidden="true"><i></i>${yang?"":"<i></i>"}</span>`; }
function currentTime(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts();
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return part('year') + '-' + part('month') + '-' + part('day') + 'T' + part('hour') + ':' + part('minute');
}

function formatTime(value: string): string {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  return year + '年' + month + '月' + day + '日 ' + time;
}
function lunarCaption(value: string): string {
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const lunar = Solar.fromYmdHms(year, month, day, hour, minute, 0).getLunar();
  return `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} · ${lunar.getTimeZhi()}时`;
}

function validPage(value: string): boolean {
  return /^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
function pageError(value: string): string {
  if (!value) return '';
  if (!/^[0-9]+$/.test(value)) return '请输入正整数页数';
  if (!Number.isSafeInteger(Number(value))) return '页数过大，请重新输入';
  return Number(value) > 0 ? '' : '页数必须大于 0';
}
function resetEntry() {
  picker.reset();
  state.page = 'entry'; state.pages = ['', '']; state.coins = Array(6).fill(null);
  state.active = 0; state.time = currentTime(); state.question = ''; timeEdited = false;
  state.hidden = false; openedRecord = undefined;
}
function renderEntry():string {
  const complete=state.coins.every(Boolean); const valid=state.pages.every(validPage);
  const step=state.active; const ordinal=['初爻','二爻','三爻','四爻','五爻','上爻'];
  const coinOptions=[{n:'3背',desc:'老阳',mark:'○',back:3,char:0,yang:true,moving:true},{n:'2背1字',desc:'少阳',mark:'━',back:2,char:1,yang:true,moving:false},{n:'1背2字',desc:'少阴',mark:'━ ━',back:1,char:2,yang:false,moving:false},{n:'3字',desc:'老阴',mark:'×',back:0,char:3,yang:false,moving:true}];
  const header = `<header class="topbar home-nav"><button id="records-open" aria-label="收藏">收藏</button></header>
    <div class="card time-card">
      <button id="time-open" class="time-open">
        <span class="time-label">起卦时间</span>
        <span class="time-value"><strong>${formatTime(state.time)}</strong><small class="lunar-caption">${lunarCaption(state.time)}</small>${timeEdited ? '<span class="time-manual">已手动设时</span>' : ''}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      <button id="instant-cast" class="instant-button">即时排盘</button>
    </div>
    <input class="card question" id="question" maxlength="80" placeholder="所问何事（选填）" value="${esc(state.question)}">
    <div class="segmented"><button data-method="book" class="${state.method==='book'?'selected':''}">翻书页</button><button data-method="coins" class="${state.method==='coins'?'selected':''}">硬币</button><button data-method="pick" aria-pressed="${state.method==='pick'}" class="${state.method==='pick'?'selected':''}">选卦</button></div>`;
  let body='';
  if(state.method==='book') body=`<section class="card book-card"><label>第一次翻到的页数<input class="page-input" id="page1" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(state.pages[0])}"></label><label>第二次翻到的页数<input class="page-input" id="page2" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(state.pages[1])}"></label><p class="hint">随手翻，按先后顺序填入页码</p><p class="input-error" id="page-error" role="status">${state.pages.map(pageError).filter(Boolean).join("；")}</p></section><button class="primary" id="book-submit" ${valid?'':'disabled'}>确认起卦</button>`;
  else if (state.method === "pick") body = picker.render(lineMark, esc);
  else body=`<section class="card cast-card"><div class="section-title"><strong>${step===6?"六爻已录齐":"第"+(step+1)+"次 · "+ordinal[step]}</strong><span>${step===6?"6/6 已录入":"当前第"+(step+1)+"步 · 已录"+state.coins.filter(Boolean).length+"爻"}</span></div><div class="options" ${step===6?"hidden":""}>${coinOptions.map((o,i)=>`<button class="option" data-option="${i}"><span class="coins">${Array.from({length:3},(_,j)=>`<i class="coin ${j<o.back?'back':''}">${j<o.back?'':'字'}</i>`).join('')}</span><b>${o.n}</b><small>${o.desc} <em>${o.mark}</em> ${o.moving?'动':'静'}</small></button>`).join('')}</div></section><section class="card preview"><div class="section-title"><strong>已录入</strong><button id="previous" ${step===0?'disabled':''}>上一步</button></div>${[5,4,3,2,1,0].map(i=>{const l=state.coins[i];return `<button class="preview-row" data-line="${i}" ${l?"":"disabled"}><span>${ordinal[i]}</span>${l?lineMark(l.yang):'<span class="placeholder">—</span>'}<span class="preview-state">${l?(l.moving?`${l.yang?'○':'×'} 动`:'静'):' '}</span><span class="chevron">${l?'›':''}</span></button>`}).join('')}</section><button class="primary" id="coin-submit" ${complete?'':'disabled'}>装卦排盘</button>`;
  const recent = records.slice().sort((a, b) => (b.createdAt ?? b.time).localeCompare(a.createdAt ?? a.time)).slice(0, 3);
  const recentList = recent.length ? `<section class="recent"><div class="recent-heading"><span>最 近</span><button id="all-records">全部记录 ›</button></div>${recent.map(item => `<button class="recent-item" data-record-open="${esc(item.id)}" data-record-origin="home"><span class="recent-dot" aria-hidden="true"></span><span><strong>${esc(item.question || '未填写所问何事')}</strong><small>${esc(item.original)}${item.transformed ? ' → ' + esc(item.transformed) : ''} · ${methodLabels[item.method]}</small></span><time>${formatTime(item.time)}</time></button>`).join('')}</section>` : '';
  return `<main class="shell">${header}${body}${recentList}</main>${state.hidden?`<div class="scrim" id="scrim"><section class="sheet"><div class="sheet-handle"></div><h2>起卦时间</h2><label>日期与时间<input id="time-picker" type="datetime-local" required min="1900-01-01T00:00" max="2100-12-31T23:59" value="${state.time}"></label><button class="primary" id="time-done">完成</button></section></div>`:''}`;
}
function renderChart(): string {
  const chart = state.chart!;
  const isStatic = !chart.lines.some(line => line.moving);
  const rowNames = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  const stems: Record<string, string> = { 甲:'木', 乙:'木', 丙:'火', 丁:'火', 戊:'土', 己:'土', 庚:'金', 辛:'金', 壬:'水', 癸:'水' };
  const generates: Record<string, string> = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' };
  const overcomes: Record<string, string> = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' };
  const najia = (line: typeof chart.lines1[number]) =>
    `<span class="pan-najia">${line.stem}<b class="el-${line.element}">${line.branch}${line.element}${line.relative}</b></span>`;
  function row(index: number, side: 'main' | 'change') {
    const changed = side === 'change';
    if (changed && state.mode === 'moving' && !chart.lines[index].moving) {
      return '<div class="pan-row pan-change pan-blank" aria-hidden="true"></div>';
    }
    const line = (changed ? chart.lines2 : chart.lines1)[index];
    const shi = chart.palace.世;
    const showPositions = !changed;
    const badge = showPositions && index === shi ? '<span class="pan-chip shi">世</span>'
      : showPositions && index === (shi + 3) % 6 ? '<span class="pan-chip ying">应</span>' : '';
    const empty = line.empty ? '<span class="pan-chip kong">空</span>' : '';
    const originalElement = chart.lines1[index].element;
    const isMoving = chart.lines[index].moving;
    const relation = changed && isMoving && generates[line.element] === originalElement
      ? '<span class="pan-return sheng">← 回头生</span>'
      : changed && isMoving && overcomes[line.element] === originalElement
        ? '<span class="pan-return ke">← 回头克</span>'
        : '';
    return `<div class="pan-row pan-${side}" data-position="${index + 1}">
      <div class="pan-data"><span class="pan-meta ${changed ? 'pan-change-meta' : ''}">${changed ? relation : rowNames[index][0] + '·' + chart.dateGods[index]}</span>${lineMark(line.yang)}${najia(line)}<span class="pan-badges">${badge}${empty}</span></div>
    </div>`;
  }

  const palace = chart.palace.palace;
  const date = formatTime(openedRecord?.time ?? state.time);
  const question = openedRecord?.question ?? state.question;
  const pillars = [['年', chart.pillars.year], ['月', chart.pillars.month], ['日', chart.pillars.day], ['时', chart.pillars.hour]];
  const calendar = pillars.map(([label, [stem, branch]]) => `<div>
    <small>${label}</small><strong><span class="el-${stems[stem]}">${stem}</span>${branchText(branch)}</strong>
  </div>`).join('');
  const hidden = chart.hiddenList;
  const hiddenPreview = hidden.map(({index, line}) =>
    `<span>${najia(line)} · 伏于${rowNames[index]}下</span>`).join('');
  const hiddenDetail = hidden.map(({index, line}) =>
    `<div>本卦六亲缺${line.relative}，伏神${najia(line)}，伏于${rowNames[index]}${najia(chart.lines1[index])}之下。</div>`).join('');

  return `<header class="topbar chart-nav pan-nav"><button id="back" aria-label="${chartOrigin === 'entry' ? '返回起卦' : '返回记录'}">‹</button><h1>观爻</h1><button id="settings" aria-label="设置">⚙</button></header>
  <main class="shell pan-shell">
    <section class="card pan-time"><div class="pan-date">${date}</div><div class="pan-pillars">${calendar}</div></section>
    ${editingQuestion
      ? `<form id="note-form" class="card chart-question note-form"><label for="note-input">所问何事</label><input id="note-input" maxlength="80" value="${esc(question)}"><button class="primary" type="submit">保存备注</button></form>`
      : `<button class="card chart-question" id="edit-note"><span class="pan-question ${question ? '' : 'muted'}">${esc(question || '添加所问何事')}</span><span>编辑</span></button>`}
    <section class="card pan-month" aria-label="月建日辰旬空">
      <div><small>月建</small><b>${branchText(chart.pillars.monthBranch)}</b></div>
      <div><small>日辰</small><b>${branchText(chart.pillars.dayBranch)}</b></div>
      <div><small>旬空</small><strong class="pan-chip kong">${chart.pillars.voids.join('')}</strong></div>
    </section>
    ${storageFailed ? '<p role="status" class="hint">浏览器未能写入本机储存，本次记录仅保留在当前页面。</p>' : ''}
    <section class="card pan-grid" aria-label="卦盘">
      <div class="pan-head pan-main"><div class="pan-label">本卦</div><h2>${chart.name}</h2><span class="pan-palace el-${palace.element}">${palace.name}宫 · ${palace.element}</span></div>
      <div class="pan-head pan-change"><div class="pan-label">变卦</div>
        ${isStatic ? '' : `<h2>${chart.changedName}</h2><button id="quick-mode" class="pan-mode" aria-label="变卦显示：${state.mode === 'all' ? '全部' : '仅动爻'}">${state.mode === 'all' ? '全部' : '仅动爻'}</button>`}
      </div>
      ${[5,4,3,2,1,0].map(index => row(index, 'main') + (isStatic ? '' : row(index, 'change'))).join('')}
      ${isStatic ? '<div class="pan-static">静卦 · 无变卦</div>' : ''}
    </section>
    <section class="card pan-hidden">
      <button id="hidden-toggle" type="button" aria-expanded="${state.hidden}" aria-controls="pan-hidden-detail">
        <b>伏神</b><span class="pan-hidden-preview">${hiddenPreview || '无伏神'}</span><span class="pan-caret" aria-hidden="true">${state.hidden ? '⌃' : '⌄'}</span>
      </button>
      <div id="pan-hidden-detail" class="pan-hidden-detail"${state.hidden ? '' : ' hidden'}>${hiddenDetail || '本卦六亲齐全。'}</div>
    </section>
    <button class="primary restart" id="restart">重新起卦</button>${openedRecord ? renderCase(openedRecord) : ''}
  </main>
  ${state.settings ? `<div class="scrim" id="scrim"><section class="sheet"><div class="sheet-handle"></div><h2>设置</h2><p>变卦显示</p><div class="segmented"><button data-mode="all" class="${state.mode==='all'?'selected':''}">全部显示</button><button data-mode="moving" class="${state.mode==='moving'?'selected':''}">仅动爻</button></div><button class="plain-action" id="settings-done">完成</button></section></div>` : ''}`;
}
function renderCase(entry: RecordEntry): string {
  const status = entry.result ?? 'pending';
  return `<form class="card case-form" id="case-form">
    <div class="judgment-heading"><label for="judgment">我的断语</label><span id="judgment-status" role="status" hidden>有更新</span><button class="primary" type="submit">保存断语</button></div>
    <textarea id="judgment" name="judgment" rows="4" placeholder="写下你的判断，方便日后回看">${esc(entry.judgment ?? '')}</textarea>
    <label for="case-result">应验状态</label>
    <select id="case-result" name="result">${Object.entries(resultLabels).map(([value, label]) =>
      `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select>
  </form>`;
}

function recordsList(): string {
  const query = recordSearch.trim().toLowerCase();
  const matches = records
    .filter(item => recordFilter === 'recent' || item.favorite)
    .filter(item => [item.question, item.original, item.transformed, item.judgment].some(text => text?.toLowerCase().includes(query)))
    .sort((a, b) => (b.createdAt ?? b.time).localeCompare(a.createdAt ?? a.time));
  if (!matches.length) {
    return '<p class="records-empty">' + (query ? '未找到符合条件的记录' : recordFilter === 'favorite' ? '暂无收藏，去最近记录点「收藏」即可添加' : '暂无排盘记录') + '</p>';
  }
  return matches.map(item => {
    const id = esc(item.id);
    const same = records.filter(other => other.id !== item.id && other.time === item.time && other.question === item.question && other.original === item.original && other.transformed === item.transformed);
    const repeat = same.length ? ` · 同刻第${same.filter(other => (other.createdAt ?? other.id) < (item.createdAt ?? item.id)).length + 1}次` : '';
    const revealed = revealedRecord === item.id;
    return `<article class="record-item${revealed ? ' delete-revealed' : ''}" data-record-id="${id}">
      <button class="record-open" data-record-open="${id}">
        <strong>${esc(item.question || '未填写所问何事')}</strong>
        <span class="record-names">${esc(item.original)}${item.transformed ? ' → ' + esc(item.transformed) : ' · 静卦'}</span>
        <span class="record-meta"><time>${item.time.replace('T', ' ')}</time><small>${methodLabels[item.method]}</small></span>
        ${repeat || item.createdAt ? `<span class="record-save-meta">${repeat.replace(/^ · /, '')}${repeat && item.createdAt ? ' · ' : ''}${item.createdAt ? `存于 ${new Date(item.createdAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}` : ''}</span>` : ''}
        ${item.judgment || item.result ? `<span class="case-summary">${resultLabels[item.result ?? 'pending']}${item.judgment ? ' · ' + esc(item.judgment) : ''}</span>` : ''}
        <span class="record-arrow" aria-hidden="true">›</span>
      </button>
      <button class="record-star" data-record-star="${id}" aria-pressed="${item.favorite}" aria-label="${item.favorite ? '取消收藏' : '收藏'}" ${revealed ? 'disabled' : ''}>${item.favorite ? '已收藏' : '收藏'}</button>
      <button class="record-delete" data-record-delete="${id}" aria-hidden="${!revealed}" tabindex="${revealed ? 0 : -1}">删除</button>
    </article>`;
  }).join('');
}

function renderRecords(): string {
  return `<main class="shell records-shell">
    <header class="topbar chart-nav"><button id="records-back" aria-label="返回起卦">‹</button><h1>记录</h1></header>
    <label class="card records-search"><i aria-hidden="true"></i><input id="records-search" type="search" aria-label="搜索所问、卦名或断语" placeholder="搜索所问、卦名或断语" value="${esc(recordSearch)}"></label>
    <div class="segmented records-tabs"><button data-record-filter="recent" aria-pressed="${recordFilter === 'recent'}" class="${recordFilter === 'recent' ? 'selected' : ''}">最近</button><button data-record-filter="favorite" aria-pressed="${recordFilter === 'favorite'}" class="${recordFilter === 'favorite' ? 'selected' : ''}">收藏</button></div>
    <section class="card backup-card">
      <button class="plain-action" id="export-backup" ${records.length ? '' : 'disabled aria-describedby="backup-empty"'}>导出备份</button>
      <button class="plain-action" id="import-backup">导入备份</button>
      <input type="file" id="backup-file" accept=".json,application/json" hidden>
      ${records.length ? '' : '<p id="backup-empty">暂无记录可导出</p>'}
      ${backupMessage ? `<p role="status">${esc(backupMessage)}</p>` : ''}
    </section>
    ${storageFailed ? '<p role="status" class="hint">浏览器未能写入本机储存，本次更改仅保留在当前页面。</p>' : ''}
    <section class="card records-list" id="records-list">${recordsList()}</section>
    <p class="records-footer">点击记录查看排盘 · 点「收藏」保存 · 左滑可删除</p>
  </main>`;
}

function render() {
  document.body.classList.toggle('pan-page', state.page === 'chart');
  document.body.classList.toggle('records-page', state.page === 'records');
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = state.page === 'entry' ? renderEntry() : state.page === 'chart' ? renderChart() : renderRecords();
}

function submit(entry: LineInput[] | 'instant') {
  if (!timeEdited) state.time = currentTime();
  const lines = entry === 'instant' ? instantLines(state.time) : entry;
  const chart = castChart(lines, state.time);
  openedRecord = {
    id: globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2),
    time: state.time, question: state.question.trim(), method: entry === 'instant' ? 'instant' : state.method,
    lines: lines.map(line => ({ ...line })), original: chart.name,
    transformed: lines.some(line => line.moving) ? chart.changedName : null, favorite: false, createdAt: new Date().toISOString(),
  };
  commitRecords([openedRecord, ...records]);
  state.chart = chart;
  chartOrigin = 'entry';
  showChart();
}

function showChart() {
  state.page = 'chart';
  state.hidden = false;
  state.settings = false;
  editingQuestion = false;
  render();
  window.scrollTo(0, 0);
}
document.addEventListener('click',event=>{
  const element = event.target as HTMLElement;
  if (element.id === 'scrim') { state.settings = false; state.hidden = false; render(); return; }
  const target=element.closest<HTMLElement>('button');if(!target)return;
  if (Date.now() < suppressRecordClickUntil && target.closest('[data-record-id]')) { event.preventDefault(); return; }
  if (target.id === 'records-open') {
    state.page = 'records'; recordFilter = 'favorite'; recordSearch = ''; revealedRecord = undefined;
    render(); window.scrollTo(0, 0); return;
  }
  if (target.id === 'all-records') { state.page = 'records'; recordFilter = 'recent'; recordSearch = ''; render(); window.scrollTo(0, 0); return; }
  if (target.id === 'records-back') { state.page = 'entry'; render(); window.scrollTo(0, 0); return; }
  if (target.id === 'export-backup') {
    const url = URL.createObjectURL(new Blob([makeBackup(records)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `六爻案例备份-${currentTime().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  if (target.id === 'import-backup') { document.getElementById('backup-file')?.click(); return; }
  if (target.dataset.recordFilter) {
    recordFilter = target.dataset.recordFilter === 'favorite' ? 'favorite' : 'recent';
    revealedRecord = undefined; render(); return;
  }
  if (target.dataset.recordOpen) {
    const entry = records.find(item => item.id === target.dataset.recordOpen);
    if (entry) {
      openedRecord = entry;
      state.chart = castChart(entry.lines, entry.time);
      chartOrigin = target.dataset.recordOrigin === 'home' ? 'home-recent' : 'records';
      showChart();
    }
    return;
  }
  if (target.dataset.recordStar) {
    commitRecords(records.map(item => item.id === target.dataset.recordStar ? { ...item, favorite: !item.favorite } : item));
    render(); return;
  }
  if (target.dataset.recordDelete) {
    if (window.confirm('删除这条排盘记录？')) {
      commitRecords(records.filter(item => item.id !== target.dataset.recordDelete));
      revealedRecord = undefined; render();
    }
    return;
  }
  if (target.id === 'edit-note') { editingQuestion = true; render(); document.getElementById('note-input')?.focus(); return; }
  if (target.dataset.upper !== undefined || target.dataset.lower !== undefined || target.dataset.moving !== undefined || target.dataset.mchip !== undefined) {
    const key = target.dataset.upper !== undefined ? 'upper' : target.dataset.lower !== undefined ? 'lower' : target.dataset.moving !== undefined ? 'moving' : 'mchip';
    const index = Number(target.dataset[key]);
    if (key === 'upper') picker.chooseUpper(index);
    else if (key === 'lower') picker.chooseLower(index);
    else picker.toggleMoving(index);
    render();
    document.querySelector<HTMLElement>(`[data-${key}="${index}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.hex) {
    const [upper, lower] = target.dataset.hex.split(',').map(Number);
    picker.chooseHex(upper, lower);
    render();
    document.getElementById('picked-name')?.focus();
    return;
  }
  if (target.id === 'pick-submit') {
    const lines = picker.lines();
    if (lines) submit(lines);
    return;
  }
  if(target.dataset.method){state.method=target.dataset.method as EntryMethod;safeSet('liuyao.method',state.method);render();return;}
  if (target.id === 'instant-cast') { submit('instant'); return; }
  if(target.id==='time-open'){if(!timeEdited)state.time=currentTime();state.hidden=true;render();return;}
  if(target.id==='time-done'){const input=document.querySelector<HTMLInputElement>('#time-picker');if(!input?.value || !input.reportValidity())return;timeEdited=timeEdited||input.value!==state.time;state.time=input.value;state.hidden=false;render();return;}
  if(target.id==='book-submit'){
    if (!state.pages.every(validPage)) return;
    const a=Number(state.pages[0]),b=Number(state.pages[1]);const up=trigrams[(a%8||8)-1],down=trigrams[(b%8||8)-1];const remainder=(a%6+b%6)%6;const movingAt=(remainder||6)-1;
    const bits=[...down.lines,...up.lines].map((yang,i)=>({yang,moving:i===movingAt}));submit(bits);return;
  }
  if(target.dataset.option!==undefined){const o=[{yang:true,moving:true},{yang:true,moving:false},{yang:false,moving:false},{yang:false,moving:true}][Number(target.dataset.option)];if (event.detail > 1 || state.active > 5) return;state.coins[state.active]=o;const next=state.coins.findIndex(x=>!x);state.active=next<0?6:next;render();return;}
  if(target.dataset.line!==undefined){const i=Number(target.dataset.line);if(state.coins[i]){state.active=i;render();}return;}
  if(target.id==='previous'){if(state.active>0)state.active--;render();return;}
  if(target.id==='coin-submit'){if(state.coins.every(Boolean))submit(state.coins as LineInput[]);return;}
  if(target.id==='back'){if(chartOrigin==='entry') resetEntry(); else {state.page=chartOrigin==='records'?'records':'entry';state.hidden=false;}render();window.scrollTo(0,0);return;}
  if(target.id==='settings'){state.settings=true;render();return;}
  if(target.id==='settings-done'||target.id==='scrim'){state.settings=false;render();return;}
  if(target.dataset.mode){state.mode=target.dataset.mode as 'all'|'moving';safeSet('liuyao.transform',state.mode);render();return;}
  if(target.id==='quick-mode'){state.mode=state.mode==='all'?'moving':'all';safeSet('liuyao.transform',state.mode);render();return;}
  if(target.id==='hidden-toggle'){state.hidden=!state.hidden;render();return;}
  if(target.id==='restart'){resetEntry();render();return;}
});
document.addEventListener('input',event=>{
  const el=event.target as HTMLInputElement;
  if (el.id === 'hex-search') {
    document.getElementById('hex-results')!.innerHTML = picker.search(el.value);
    return;
  }
  if (el.id === 'records-search') {
    recordSearch = el.value;
    revealedRecord = undefined;
    document.getElementById('records-list')!.innerHTML = recordsList();
    return;
  }
  if(el.id==='question'){state.question=el.value;return;}
  if(el.id==='page1'||el.id==='page2'){state.pages[el.id==='page1'?0:1]=el.value;const btn=document.querySelector<HTMLButtonElement>('#book-submit');if(btn)btn.disabled=!state.pages.every(validPage);const error=document.querySelector<HTMLElement>('#page-error');if(error)error.textContent=state.pages.map(pageError).filter(Boolean).join('；');return;}
});
document.addEventListener('toggle', event => {
  const details = event.target as HTMLDetailsElement;
  if (details.id === 'hex-catalog' && details.isConnected) picker.setBrowseOpen(details.open);
}, true);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(state.settings||state.hidden)){state.settings=false;state.hidden=false;render();}});
document.addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  if (input.id !== 'backup-file' || !input.files?.[0]) return;
  try {
    const data = await input.files[0].text();
    const restored = restoreBackup(data, records);
    if (restored.added && !writeRecords(restored.records)) {
      backupMessage = '本机储存写入失败，未导入记录。';
    } else {
      records = restored.records;
      backupMessage = `已导入 ${restored.added} 条，跳过 ${restored.skipped} 条重复记录。`;
    }
  } catch {
    backupMessage = '无法读取这份备份，请选择本工具导出的 JSON 文件。';
  }
  if (state.page === 'records') render();
});

document.addEventListener('submit', event => {
  const form = event.target as HTMLFormElement;
  if (form.id === 'case-form' && openedRecord) {
    event.preventDefault();
    const data = new FormData(form);
    const result = data.get('result');
    if (!isResultStatus(result)) return;
    const updated = { ...openedRecord, judgment: String(data.get('judgment') ?? '').trim(), result };
    commitRecords(records.map(item => item.id === updated.id ? updated : item));
    openedRecord = updated;
    const save = form.querySelector<HTMLButtonElement>('.judgment-heading button')!;
    save.textContent = storageFailed ? '本机保存失败' : '已保存';
    form.querySelector<HTMLElement>('#judgment-status')!.hidden = true;
    return;
  }
  if ((event.target as HTMLElement).id !== 'note-form' || !openedRecord) return;
  event.preventDefault();
  const question = document.querySelector<HTMLInputElement>('#note-input')!.value.trim();
  const updated = { ...openedRecord, question };
  commitRecords(records.map(item => item.id === updated.id ? updated : item));
  openedRecord = updated;
  if (chartOrigin === 'entry') state.question = question;
  editingQuestion = false;
  render();
});

document.addEventListener('input', event => {
  const target = event.target as HTMLElement;
  if ((target.id === 'judgment' || target.id === 'case-result') && openedRecord) {
    const status = document.querySelector<HTMLElement>('#judgment-status');
    if (status) status.hidden = false;
    const save = document.querySelector<HTMLButtonElement>('.judgment-heading button');
    if (save) save.textContent = '保存断语';
  }
});

document.addEventListener('touchstart', event => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-record-id]');
  const touch = event.touches[0];
  touchStart = item?.dataset.recordId && touch ? { id: item.dataset.recordId, x: touch.clientX, y: touch.clientY } : undefined;
}, { passive: true });

function revealRecordDelete(id?: string) {
  revealedRecord = id;
  document.querySelectorAll<HTMLElement>('[data-record-id]').forEach(item => {
    const revealed = item.dataset.recordId === id;
    item.classList.toggle('delete-revealed', revealed);
    item.querySelector<HTMLButtonElement>('.record-star')!.disabled = revealed;
    const remove = item.querySelector<HTMLButtonElement>('.record-delete')!;
    remove.setAttribute('aria-hidden', String(!revealed));
    remove.tabIndex = revealed ? 0 : -1;
  });
}

document.addEventListener('touchcancel', () => { touchStart = undefined; });
document.addEventListener('touchend', event => {
  const start = touchStart;
  touchStart = undefined;
  const touch = event.changedTouches[0];
  if (!start || !touch || state.page !== 'records') return;
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (event.cancelable) event.preventDefault();
  suppressRecordClickUntil = Date.now() + 350;
  revealRecordDelete(dx < 0 ? start.id : undefined);
}, { passive: false });

document.addEventListener('contextmenu', event => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-record-id]');
  if (!item) return;
  event.preventDefault();
  revealRecordDelete(item.dataset.recordId);
});

render();

if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator &&
    document.querySelector('link[rel="manifest"]')) {
  enableAppUpdates(() => state.page === 'entry' && !state.hidden && !timeEdited &&
    !state.question && !state.pages.some(Boolean) && !state.coins.some(Boolean) && !picker.hasDraft());
}
