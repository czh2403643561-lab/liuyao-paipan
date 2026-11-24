import './course.css';
import { guideTopics, loadCorpus, readCourseHistory, searchCourse, writeCourseHistory, type CourseHistory } from './course-data';
import { passageGuide, selectDisplayedSources } from './course-evidence';
import { askMimo, CourseRequestError, mimo, formatCourseGuide, type CourseIssue } from './course-api';

const courseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#A9852F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6c-1.5-1.3-3.6-2-6-2v13c2.4 0 4.5.7 6 2 1.5-1.3 3.6-2 6-2V4c-2.4 0-4.5.7-6 2z"/><path d="M12 6v13"/><circle cx="17.2" cy="16.8" r="3.1"/><path d="M19.5 19.1l2 2"/></svg>';
const historyIcon = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#7C8692" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 1 2.5 6"/><path d="M3.5 21v-4.5H8"/><path d="M12 7.5V12l3 2"/></svg>';
const keyName = 'liuyao.course.mimo-key';
const examples = ['回头克一定是凶吗？', '暗动怎么看？', '世爻持官鬼是什么意思？'];
const notFound = '这次没在课里找到相关内容。换个说法试试，或者直接打关键词（比如只打「回头克」）有时反而找得准。';
const timeZone = 'Asia/Shanghai';
const slowWait = 8_000;
const maximumWait = 30_000;

type PendingSubmission = {
  controller: AbortController;
  deadline: number;
  slowTimer: number;
  timeoutTimer: number;
  slot: HTMLElement;
};

export const courseEntry = '<button type="button" class="chake-entry" data-course-open aria-label="查课">' + courseIcon + '</button>';

function esc(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function readKey() {
  try { return localStorage.getItem(keyName) ?? ''; }
  catch { return ''; }
}

function updateKey(value: string) {
  try {
    if (value) localStorage.setItem(keyName, value);
    else localStorage.removeItem(keyName);
    return true;
  } catch { return false; }
}

function errorCard(issue: CourseIssue, retry: 'ask' | 'test' | 'reader') {
  const retryButton = '<button type="button" class="b1" data-course-retry="' + retry + '">重试</button>';
  let title: string, detail = '', actions = retryButton;
  switch (issue.type) {
    case 'key':
      title = 'Key 好像不对';
      detail = '小米没认这个 Key。检查一下有没有复制全、复制错，或者重新生成一个再填。';
      actions = '<button type="button" class="b1" data-course-key>重新填 Key</button>';
      break;
    case 'balance':
      title = '可能是余额不足';
      detail = '小米那边没让这次调用通过，多半是账户没余额了，或者触发了限额。去小米平台看一眼就知道。';
      actions = '<button type="button" class="b1" data-course-platform>去小米平台看看</button>'
        + retryButton.replace('class="b1"', 'class="b2"');
      break;
    case 'net':
      title = '网络没通';
      detail = '这次没连上小米。检查一下网络，或者等会儿再试。';
      break;
    case 'unknown':
      title = '出了点问题（错误码 ' + issue.status + '）';
  }
  return '<div class="err" role="alert"><div class="t">' + title + '</div>'
    + (detail ? '<div class="d">' + detail + '</div>' : '')
    + '<div class="acts">' + actions + '</div></div>';
}

function safeAnswer(text: string) {
  const conclusion = text.match(/^.+?[。！？](?:[」”])?|^[^\n]+/)?.[0] ?? text;
  const rest = text.slice(conclusion.length);
  const format = (part: string) => esc(part)
    .replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>')
    .replace(/〔第\d{3}课〕/g, '<b>$&</b>');
  return '<b>' + esc(conclusion.replace(/\*\*/g, '')) + '</b>' + format(rest);
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function heading(label: string, right = '') {
  return '<header class="topbar"><button type="button" class="back" data-course-back aria-label="返回">‹</button><h1>'
    + label + '</h1>' + right + '</header>';
}

export function openCourse(app: HTMLElement, trigger: HTMLButtonElement) {
  if (document.querySelector('.course-shell')) return;
  const returnY = window.scrollY;
  const shell = document.createElement('main');
  shell.className = 'course-shell';
  shell.innerHTML = '<section class="course-chat">' + heading('查课', '<span class="top-right"><button type="button" class="hist-btn" data-course-history aria-label="历史记录">'
    + historyIcon + '</button><button type="button" class="key-state" data-course-key><span class="dot"></span><span class="key-label"></span></button></span>')
    + '<div class="scope">语料：六爻课 001–031 · 修订版（约 109 万字）· 回答只引课里原文</div>'
    + '<div class="guide"><div class="t">先填入你的小米 API Key</div><div class="d">查课要调小米 MiMo 模型回答，费用走你自己的账户，一次几分钱。Key 只存在这台手机上，不会上传。</div><button type="button" data-course-key>去填 Key</button></div>'
    + '<div class="hello">用大白话问就行，我去课里给你找原文。比如：</div><div class="chips">'
    + examples.map((text, index) => '<button type="button" class="chip" data-course-example="' + index + '">' + text + '</button>').join('')
    + '</div><div class="course-messages" aria-live="polite"></div><form class="composer" autocomplete="off"><input aria-label="想查什么，问一句" placeholder="想查什么，问一句" maxlength="500"><button type="submit">发送</button></form></section>'
    + '<section class="course-history" hidden>' + heading('问答记录', '<button type="button" class="clear-link" data-course-clear>清空</button>')
    + '<div class="scope">存在本机 · 点开直接看，不再花钱 · 左滑可删除</div><div class="hist-list"></div></section>'
    + '<section class="course-reader" hidden><div class="reader-bg"><header class="reader-top"><button type="button" class="back" data-course-back aria-label="返回">‹</button><div class="reader-title"></div></header>'
    + '<div class="reader-meta"></div><div class="reader-tip">已定位到引用的那一段（浅黄底）· 上下滑动看上下文</div><div class="reader-body"></div></div></section>'
    + '<dialog class="mask key-mask" aria-label="小米 API Key"><section class="modal"><h2>小米 API Key</h2><div class="hint">在小米开放平台申请，复制到这里<br>模型已定好：MiMo-V2.6-Flash，不用你选</div>'
    + '<input type="password" aria-label="小米 API Key" placeholder="粘贴你的 Key" autocomplete="off" spellcheck="false">'
    + '<div class="sec-note">🔒 只保存在这台手机的浏览器里，不上传、不进记录备份。换手机要重新填。</div>'
    + '<div class="test-ok" role="status">✓ 连接成功，这个 Key 能用</div><div class="test-error"></div>'
    + '<div class="modal-btns"><button type="button" class="m-test" data-course-test>测试连接</button><button type="button" class="m-save" data-course-save>保存</button></div>'
    + '<button type="button" class="m-del" data-course-delete-key>删除已保存的 Key</button></section></dialog>'
    + '<dialog class="mask clear-mask" aria-label="清空全部问答记录"><section class="modal"><h2>清空全部问答记录？</h2>'
    + '<div class="hint">清掉之后就找不回来了<br>（卦的记录和断语反馈不受影响）</div><div class="modal-btns"><button type="button" class="m-test" data-course-cancel-clear>取消</button><button type="button" class="m-save" data-course-confirm-clear>清空</button></div></section></dialog>'
    + '<div class="toast" role="status"></div>';

  const chat = shell.querySelector<HTMLElement>('.course-chat')!;
  const historyPage = shell.querySelector<HTMLElement>('.course-history')!;
  const reader = shell.querySelector<HTMLElement>('.course-reader')!;
  const messages = shell.querySelector<HTMLElement>('.course-messages')!;
  const input = shell.querySelector<HTMLInputElement>('.composer input')!;
  const send = shell.querySelector<HTMLButtonElement>('.composer button')!;
  const keyDialog = shell.querySelector<HTMLDialogElement>('.key-mask')!;
  const clearDialog = shell.querySelector<HTMLDialogElement>('.clear-mask')!;
  const keyInput = keyDialog.querySelector<HTMLInputElement>('input')!;
  const testButton = keyDialog.querySelector<HTMLButtonElement>('[data-course-test]')!;
  const testError = keyDialog.querySelector<HTMLElement>('.test-error')!;
  const testOk = keyDialog.querySelector<HTMLElement>('.test-ok')!;
  const guide = shell.querySelector<HTMLElement>('.guide')!;
  const toastBox = shell.querySelector<HTMLElement>('.toast')!;
  let key = readKey();
  let pending: PendingSubmission | undefined;
  let testing = false;
  let visible = chat;
  let answer: CourseHistory | undefined;
  let lastQuestion = '';
  let chatY = 0, showSource = 0;
  let toastTimer = 0;
  let history = readCourseHistory();
  let openHistoryId: string | undefined;
  let readerRequest = 0;

  function toast(text: string) {
    clearTimeout(toastTimer);
    toastBox.textContent = text;
    toastBox.classList.add('show');
    toastTimer = window.setTimeout(() => toastBox.classList.remove('show'), 1500);
  }

  function keyUI() {
    guide.hidden = !!key;
    shell.querySelector('.key-state .dot')!.classList.toggle('ok', !!key);
    shell.querySelector('.key-label')!.textContent = key ? 'Key 已设置' : '填 Key';
    shell.querySelector('.m-del')!.classList.toggle('show', !!key);
  }

  function changePage(page: HTMLElement, y = 0) {
    visible.hidden = true;
    page.hidden = false;
    visible = page;
    window.scrollTo(0, y);
  }

  function openKey() {
    if (keyDialog.open) {
      keyInput.focus();
      keyInput.select();
      return;
    }
    keyInput.value = key;
    testError.replaceChildren();
    testOk.classList.remove('show');
    keyDialog.showModal();
    keyDialog.classList.add('on');
  }

  function closeApp() {
    clearTimeout(toastTimer);
    readerRequest += 1;
    shell.remove();
    document.body.classList.remove('course-page');
    app.hidden = false;
    window.scrollTo(0, returnY);
    trigger.focus({ preventScroll: true });
  }

  function back() {
    if (visible === reader) {
      readerRequest += 1;
      changePage(chat, chatY);
      shell.querySelector<HTMLButtonElement>('[data-course-source="' + showSource + '"]')?.focus({ preventScroll: true });
    } else if (visible === historyPage) {
      changePage(chat, chatY);
      shell.querySelector<HTMLButtonElement>('[data-course-history]')?.focus({ preventScroll: true });
    } else closeApp();
  }

  function questionBubble(question: string) {
    return '<div class="msg-q"><div class="bub">' + esc(question) + '</div></div>';
  }

  function renderAnswer(result: CourseHistory, slot?: HTMLElement) {
    answer = result;
    const card = '<div class="msg-a' + (slot ? ' course-answer-fade' : '') + '"><div class="txt">'
      + safeAnswer(result.answer) + '</div><div class="src-line">'
      + result.sources.map((source, i) => '<button type="button" class="src-item" data-course-source="' + i + '">'
        + '<span class="h">第' + esc(source.lesson) + '课 · ' + esc(source.head)
        + '<span class="go">看原文 ›</span></span><span class="p">「' + esc(source.excerpt) + '」</span></button>').join('')
      + '</div></div>';
    if (slot) {
      slot.innerHTML = card;
      if (visible === chat && shell.isConnected) slot.scrollIntoView({ block: 'start' });
    } else {
      messages.innerHTML = questionBubble(result.question) + card;
    }
  }

  async function openReader(index: number) {
    if (!answer?.sources[index]) return;
    const source = answer.sources[index];
    if (visible === chat) chatY = window.scrollY;
    showSource = index;
    const current = ++readerRequest;
    const body = reader.querySelector('.reader-body')!;
    const tip = reader.querySelector<HTMLElement>('.reader-tip')!;
    reader.querySelector('.reader-title')!.textContent = '第' + source.lesson + '课';
    reader.querySelector('.reader-meta')!.textContent = source.head;
    tip.hidden = true;
    body.replaceChildren();
    changePage(reader);
    try {
      const corpus = await loadCorpus(answer.version);
      if (readerRequest !== current) return;
      const lesson = corpus.lessons[source.lesson];
      if (!lesson?.paragraphs[source.paragraph]) throw new Error('Course paragraph unavailable');
      const paragraphs = lesson.paragraphs.map((text, paragraphIndex) => {
        const p = document.createElement('p');
        p.textContent = text;
        p.classList.toggle('hit', paragraphIndex === source.paragraph);
        return p;
      });
      tip.hidden = false;
      body.replaceChildren(...paragraphs);
      requestAnimationFrame(() => {
        if (readerRequest === current) paragraphs[source.paragraph].scrollIntoView({ block: 'center' });
      });
    } catch {
      if (readerRequest === current) body.innerHTML = errorCard({ type: 'net' }, 'reader');
    }
  }

  function redact(text: string) {
    return text.replace(/\b(?:sk|tp)-[a-z0-9_-]{16,}\b/gi, '…');
  }

  function startSubmission(question: string) {
    lastQuestion = question;
    answer = undefined;
    input.value = '';
    send.disabled = true;
    send.textContent = '…';
    send.setAttribute('aria-busy', 'true');
    messages.innerHTML = questionBubble(question)
      + '<div class="course-response"><div class="course-loading">'
      + '<div class="course-load-row"><span class="course-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span class="course-load-stage">正在翻课，找原文…</span></div>'
      + '<div class="course-load-foot" hidden><span>等久了可以先取消，待会儿再问</span>'
      + '<button type="button" data-course-cancel-ask>取消</button></div></div></div>';
    const slot = messages.querySelector<HTMLElement>('.course-response')!;
    const request: PendingSubmission = {
      slot,
      controller: new AbortController(),
      deadline: performance.now() + maximumWait,
      slowTimer: window.setTimeout(() => {
        if (pending !== request) return;
        slot.querySelector('.course-load-stage')!.textContent = '还在等回话，网络可能有点慢…';
        slot.querySelector<HTMLElement>('.course-load-foot')!.hidden = false;
      }, slowWait),
      timeoutTimer: window.setTimeout(() => expire(request), maximumWait),
    };
    pending = request;
    slot.scrollIntoView({ block: 'nearest' });
    return request;
  }

  function finishSubmission(request: PendingSubmission) {
    if (pending !== request) return false;
    pending = undefined;
    window.clearTimeout(request.slowTimer);
    window.clearTimeout(request.timeoutTimer);
    send.disabled = false;
    send.textContent = '发送';
    send.removeAttribute('aria-busy');
    return true;
  }

  function expire(request: PendingSubmission) {
    if (!finishSubmission(request)) return;
    request.controller.abort();
    request.slot.innerHTML = errorCard({ type: 'net' }, 'ask');
  }

  function canContinue(request: PendingSubmission) {
    if (pending !== request) return false;
    if (performance.now() < request.deadline) return true;
    expire(request);
    return false;
  }

  async function submit(value: string) {
    const question = redact(value.trim());
    if (!question || pending) return;
    if (!key) {
      input.value = question;
      openKey();
      toast('先填 Key 才能问');
      return;
    }
    const requestKey = key;
    const request = startSubmission(question);
    try {
      // Let the browser show the loading card before running the local search.
      await new Promise<void>(resolve => requestAnimationFrame(() => window.setTimeout(resolve, 0)));
      if (!canContinue(request)) return;
      if (!navigator.onLine) throw new CourseRequestError({ type: 'net' });
      const corpus = await loadCorpus();
      if (!canContinue(request)) return;
      const candidates = searchCourse(corpus, question);
      if (!canContinue(request)) return;
      if (!candidates.length) {
        finishSubmission(request);
        request.slot.innerHTML = '<p class="nf">' + notFound + '</p>';
        input.value = question;
        return;
      }
      const hits = selectDisplayedSources(question, candidates);
      if (!hits.length) {
        finishSubmission(request);
        request.slot.innerHTML = '<p class="nf">课里提到了相关术语，这次召回的段落没有直接回答这个问题。可以换个说法再查。</p>';
        input.value = question;
        return;
      }
      if (request.slot.querySelector<HTMLElement>('.course-load-foot')!.hidden) {
        request.slot.querySelector('.course-load-stage')!.textContent = '找到 ' + hits.length + ' 段原文，正在整理导读…';
      }
      const prompt = '问题：' + question + '\n\n检索到的原文：\n'
        + hits.map(hit => '〔第' + hit.source.lesson + '课〕' + hit.text).join('\n');
      const reply = await askMimo(requestKey, prompt, false, request.controller.signal);
      if (!canContinue(request)) return;
      const guide = formatCourseGuide(redact(reply), hits.map(hit => ({
        lesson: hit.source.lesson, head: hit.source.head, text: hit.text,
      })), guideTopics(question, hits.map(hit => hit.text)), passageGuide(question, hits));
      const result: CourseHistory = { id: crypto.randomUUID(), question, answer: guide,
        sources: hits.map(hit => hit.source), version: corpus.version, time: Date.now() };
      if (!canContinue(request)) return;
      finishSubmission(request);
      const saved = [result, ...readCourseHistory()].slice(0, 200);
      if (!writeCourseHistory(saved)) toast('问答记录未能保存');
      history = saved;
      if (visible === historyPage) renderHistory();
      renderAnswer(result, request.slot);
    } catch (error) {
      if (!canContinue(request)) return;
      finishSubmission(request);
      const issue = error instanceof CourseRequestError ? error.issue : { type: 'net' } as const;
      request.slot.innerHTML = errorCard(issue, 'ask');
    }
  }

  async function testKey() {
    const candidate = keyInput.value.trim();
    if (!candidate) { toast('先粘贴 Key'); return; }
    if (testing) return;
    testing = true;
    testButton.disabled = true;
    testError.replaceChildren();
    testOk.classList.remove('show');
    try {
      await askMimo(candidate, '', true);
      if (keyInput.value.trim() === candidate) testOk.classList.add('show');
    } catch (error) {
      if (keyInput.value.trim() === candidate) {
        testError.innerHTML = errorCard(error instanceof CourseRequestError ? error.issue : { type: 'net' }, 'test');
      }
    } finally {
      testing = false;
      testButton.disabled = false;
    }
  }

  function renderHistory() {
    const today = dateKey(new Date());
    const yesterday = new Date(today + 'T00:00:00Z');
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const previous = yesterday.toISOString().slice(0, 10);
    let group = '';
    const list = historyPage.querySelector('.hist-list')!;
    list.innerHTML = history.length ? history.map(result => {
      const date = new Date(result.time);
      const day = dateKey(date);
      const section = day === today ? '今天' : day === previous ? '昨天' : '更早';
      const groupTitle = section !== group ? '<div class="hist-group">' + section + '</div>' : '';
      group = section;
      const time = day === today ? new Intl.DateTimeFormat('zh-CN', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
        : new Intl.DateTimeFormat('zh-CN', { timeZone, month: 'numeric', day: 'numeric' }).format(date);
      const id = esc(result.id);
      return groupTitle + '<div class="hist-wrap" data-course-row="' + id + '">'
        + '<button type="button" class="hist-del" data-course-remove="' + id + '" hidden>删除</button>'
        + '<button type="button" class="hist-item" data-course-reopen="' + id + '"><div class="q">' + esc(result.question)
        + '</div><div class="a">' + esc(result.answer.split(/[\n。！？]/)[0].replace(/\*\*/g, '')) + '</div><div class="t">' + time + '</div></button></div>';
    }).join('') : '<div class="hist-empty">还没有问答记录<br>问过的问题会攒在这里</div>';
    historyPage.querySelector<HTMLButtonElement>('[data-course-clear]')!.disabled = !history.length;
    openHistoryId = undefined;
  }

  function revealHistory(id?: string) {
    openHistoryId = id;
    for (const row of historyPage.querySelectorAll<HTMLElement>('.hist-wrap')) {
      const revealed = row.dataset.courseRow === id;
      row.toggleAttribute('data-open', revealed);
      row.querySelector<HTMLElement>('.hist-del')!.hidden = !revealed;
    }
  }

  function saveHistory(next: CourseHistory[]) {
    if (!writeCourseHistory(next)) { toast('问答记录未能保存'); return false; }
    history = next;
    renderHistory();
    return true;
  }

  let swipe: { target: HTMLElement; id: string; x: number; y: number; pointer: number } | undefined;
  let suppressHistoryClick = 0;
  historyPage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-course-reopen]');
    if (!target) return;
    swipe = { target, id: target.dataset.courseReopen!, x: event.clientX, y: event.clientY, pointer: event.pointerId };
  });
  historyPage.addEventListener('pointermove', event => {
    if (!swipe || event.pointerId !== swipe.pointer) return;
    const dx = event.clientX - swipe.x;
    if (Math.abs(dx) <= 12 || Math.abs(dx) <= Math.abs(event.clientY - swipe.y)) return;
    swipe.target.setPointerCapture(event.pointerId);
    const start = openHistoryId === swipe.id ? -74 : 0;
    swipe.target.style.transform = 'translateX(' + Math.max(-74, Math.min(0, start + dx)) + 'px)';
  });
  historyPage.addEventListener('pointercancel', () => {
    if (swipe) swipe.target.style.transform = '';
    swipe = undefined;
  });
  historyPage.addEventListener('pointerup', event => {
    if (!swipe || event.pointerId !== swipe.pointer) return;
    const dx = event.clientX - swipe.x;
    const horizontal = Math.abs(dx) > Math.abs(event.clientY - swipe.y);
    swipe.target.style.transform = '';
    if (horizontal && Math.abs(dx) > 12) {
      if (Math.abs(dx) >= 30) revealHistory(dx < 0 ? swipe.id : undefined);
      suppressHistoryClick = Date.now() + 400;
    }
    swipe = undefined;
  });

  shell.querySelector('.composer')!.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    void submit(input.value);
  });
  keyInput.addEventListener('input', () => {
    testError.replaceChildren();
    testOk.classList.remove('show');
  });
  for (const dialog of [keyDialog, clearDialog]) {
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.classList.remove('on'));
  }
  keyDialog.addEventListener('close', () => { keyInput.value = ''; });
  shell.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button) return;
    event.stopPropagation();
    const action = button.dataset;
    if ('courseBack' in action) back();
    else if ('courseHistory' in action) {
      chatY = window.scrollY;
      history = readCourseHistory();
      renderHistory();
      changePage(historyPage);
    } else if ('courseClear' in action) {
      if (history.length && !clearDialog.open) {
        clearDialog.showModal();
        clearDialog.classList.add('on');
      }
    } else if ('courseCancelClear' in action) clearDialog.close();
    else if ('courseConfirmClear' in action) {
      if (saveHistory([])) { clearDialog.close(); toast('已清空'); }
    } else if (action.courseRemove) {
      if (openHistoryId === action.courseRemove && saveHistory(readCourseHistory().filter(item => item.id !== action.courseRemove))) toast('已删除');
    } else if (action.courseReopen) {
      if (Date.now() < suppressHistoryClick) return;
      if (openHistoryId === action.courseReopen) { revealHistory(); return; }
      if (pending) return;
      const stored = history.find(item => item.id === action.courseReopen);
      if (stored) {
        changePage(chat);
        renderAnswer(stored);
        toast('存档回看 · 没花钱');
      }
    } else if ('courseKey' in action) openKey();
    else if ('coursePlatform' in action) window.open(mimo.platform, '_blank', 'noopener,noreferrer');
    else if ('courseSave' in action) {
      const candidate = keyInput.value.trim();
      if (!candidate) toast('先粘贴 Key');
      else if (updateKey(candidate)) { key = candidate; keyUI(); keyDialog.close(); toast('Key 已存到本机'); }
      else toast('Key 未能保存');
    } else if ('courseDeleteKey' in action) {
      if (updateKey('')) { key = ''; keyUI(); keyDialog.close(); toast('Key 已删除'); }
      else toast('Key 未能删除');
    } else if ('courseCancelAsk' in action) {
      const request = pending;
      if (request && finishSubmission(request)) {
        request.controller.abort();
        request.slot.remove();
        toast('已取消，这次没问成');
      }
    } else if ('courseTest' in action || action.courseRetry === 'test') void testKey();
    else if (action.courseRetry === 'ask') void submit(lastQuestion);
    else if (action.courseRetry === 'reader') void openReader(showSource);
    else if (action.courseExample !== undefined) void submit(examples[Number(action.courseExample)]);
    else if (action.courseSource !== undefined) void openReader(Number(action.courseSource));
  });
  shell.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !keyDialog.open && !clearDialog.open) back();
  });

  app.hidden = true;
  document.body.classList.add('course-page');
  app.after(shell);
  keyUI();
  window.scrollTo(0, 0);
  shell.querySelector<HTMLButtonElement>('[data-course-back]')!.focus({ preventScroll: true });
  void loadCorpus().catch(() => {});
}
