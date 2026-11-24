import { feedbackDays, verdictSectionsFor, type RecordEntry, type VerdictFeedback, type VerdictSection } from './records';

const pencil = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l1-5L16 4a2.8 2.8 0 0 1 4 4L9 19z"/></svg>';
const trash = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M10 10v7m4-7v7"/></svg>';
const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function savedLabel(timestamp?: number) {
  if (timestamp === undefined) return '已保存';
  const date = new Date(timestamp);
  const day = date.toDateString() === new Date().toDateString() ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`;
  const time = [date.getHours(), date.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
  return `已保存于 ${day} ${time}`;
}

export function createVerdictForm(
  entry: RecordEntry,
  persist: (sections: VerdictSection[]) => boolean,
  today: (date: Date) => string,
) {
  const form = document.createElement('form');
  form.id = 'case-form';
  form.className = 'card case-form';
  form.dataset.verdictRecordId = entry.id;
  const sections = verdictSectionsFor(entry).map(section => ({ ...section }));
  // Only committed values are persisted; drafts in other panels stay local.
  let committed = sections.map(section => ({ ...section }));

  sections.forEach((section, index) => {
    const first = index === 0;
    const panel = document.createElement('section');
    panel.className = 'verdict-section';
    panel.innerHTML = `<div class="verdict-row"><div class="verdict-name"><span class="verdict-title" id="verdict-title-${index}"></span><button type="button" class="verdict-edit" aria-label="修改栏目名">${pencil}</button></div>
      ${first ? '' : `<span class="verdict-preview"></span><button type="button" class="verdict-chevron" aria-label="展开或收起" aria-controls="verdict-body-${index}">${chevron}</button>`}<div class="verdict-actions"><span class="verdict-status" role="status"></span><button type="button" class="verdict-save"></button></div></div>
      <div id="verdict-body-${index}" class="verdict-body"><textarea aria-labelledby="verdict-title-${index}" rows="4"></textarea></div>
      <div class="verdict-feedback-actions"><button type="button" class="verdict-feedback" aria-haspopup="dialog"><span aria-hidden="true">✓</span><b></b></button></div>
      <div class="verdict-feedback-list" hidden></div>`;
    form.append(panel);
    const title = panel.querySelector<HTMLElement>('.verdict-title')!;
    const edit = panel.querySelector<HTMLButtonElement>('.verdict-edit')!;
    const body = panel.querySelector<HTMLElement>('.verdict-body')!;
    const preview = panel.querySelector<HTMLElement>('.verdict-preview');
    const toggle = panel.querySelector<HTMLButtonElement>('.verdict-chevron');
    const content = panel.querySelector('textarea')!;
    const feedbackButton = panel.querySelector<HTMLButtonElement>('.verdict-feedback')!;
    const feedbackList = panel.querySelector<HTMLElement>('.verdict-feedback-list')!;
    let state: 'saved' | 'dirty' | 'saving' | 'failed' = 'saved';
    let savedAt = section.savedAt ?? entry.verdictSavedAt;
    const status = panel.querySelector<HTMLElement>('.verdict-status')!;
    const save = panel.querySelector<HTMLButtonElement>('.verdict-save')!;
    function renderStatus() {
      panel.dataset.saveState = state;
      status.innerHTML = state === 'saved' ? '<b>✓</b> ' + savedLabel(savedAt)
        : state === 'dirty' ? '● 有修改未保存' : state === 'failed' ? '<button type="button">保存失败，点此重试</button>' : '';
      status.querySelector('button')?.addEventListener('click', saveSection);
      save.textContent = state === 'saved' ? '已保存' : state === 'saving' ? '保存中…' : '保存';
      save.disabled = state === 'saved' || state === 'saving';
    }
    function markDirty() {
      const previous = committed[index];
      state = section.title === previous.title && section.content === previous.content ? 'saved' : 'dirty';
      renderStatus();
    }
    function saveSection() {
      panel.querySelector<HTMLInputElement>('.verdict-rename')?.blur();
      if (state !== 'dirty' && state !== 'failed') return;
      state = 'saving';
      renderStatus();
      const timestamp = Date.now();
      const next = committed.map((item, i) => i === index ? { ...section, savedAt: timestamp } : { ...item });
      if (persist(next)) {
        committed = next;
        section.savedAt = savedAt = timestamp;
        state = 'saved';
      } else state = 'failed';
      renderStatus();
    }
    save.addEventListener('click', saveSection);
    renderStatus();
    title.textContent = section.title;
    content.value = section.content;
    content.placeholder = first ? '写下你的判断，方便日后回看' : '点铅笔给这栏起名，如：财运、健康、工作…';

    function updatePanel() {
      if (preview && toggle) {
        const chars = [...section.content.trim()];
        preview.textContent = chars.length ? chars.slice(0, 16).join('') + (chars.length > 16 ? '…' : '') : '空';
        preview.hidden = !body.hidden;
        toggle.setAttribute('aria-expanded', String(!body.hidden));
      }
    }
    function hasFeedback() {
      return Boolean(section.feedbacks?.length || (first && section.verified));
    }
    function renderFeedback() {
      feedbackButton.classList.toggle('has-feedback', hasFeedback());
      feedbackButton.querySelector('b')!.textContent = hasFeedback() ? '已反馈' : '反馈';
      feedbackList.replaceChildren();
      (section.feedbacks ?? []).forEach((feedback, feedbackIndex) => {
        const [, month, day] = feedback.date.split('-').map(Number);
        const item = document.createElement('div');
        item.className = 'verdict-feedback-item';
        const heading = document.createElement('div');
        heading.className = 'verdict-feedback-date';
        heading.textContent = `反馈 · ${month}月${day}日`;
        const elapsed = document.createElement('span');
        elapsed.textContent = ` · 起卦后 ${feedbackDays(entry.time, feedback.date)} 天`;
        heading.append(elapsed);
        const text = document.createElement('p');
        text.textContent = feedback.text;
        const content = document.createElement('div');
        content.append(heading, text);
        const actions = document.createElement('div');
        actions.className = 'feedback-item-actions';
        actions.innerHTML = `<button type="button" class="feedback-edit" aria-label="编辑反馈" aria-haspopup="dialog">${pencil}</button><button type="button" class="feedback-delete" aria-label="删除反馈" aria-haspopup="dialog">${trash}</button>`;
        actions.querySelector('.feedback-edit')!.addEventListener('click', () => openFeedbackDialog('edit', feedbackIndex));
        actions.querySelector('.feedback-delete')!.addEventListener('click', () => openFeedbackDialog('delete', feedbackIndex));
        item.append(content, actions);
        feedbackList.append(item);
      });
      feedbackList.hidden = !section.feedbacks?.length;
    }
    body.hidden = !first && !section.content.trim();
    updatePanel();
    renderFeedback();
    toggle?.addEventListener('click', () => { body.hidden = !body.hidden; updatePanel(); });
    content.addEventListener('input', () => { section.content = content.value; markDirty(); });
    feedbackButton.addEventListener('click', () => openFeedbackDialog('add'));

    function openFeedbackDialog(action: 'add' | 'edit' | 'delete', feedbackIndex = -1) {
      const feedbacks = section.feedbacks ?? [];
      const selected = feedbacks[feedbackIndex];
      if (action !== 'add' && !selected) return;
      const deleting = action === 'delete';
      const addingToExisting = action === 'add' && hasFeedback();
      const dialogTitle = deleting ? '删除这条反馈？' : action === 'edit' ? '编辑反馈' : addingToExisting ? '再补一条反馈' : '写反馈';
      const confirmLabel = deleting ? '删除' : action === 'edit' || addingToExisting ? '保存' : '确认';
      const dialog = document.createElement('dialog');
      dialog.className = 'feedback-dialog';
      dialog.setAttribute('aria-labelledby', 'feedback-dialog-title');
      dialog.setAttribute('aria-describedby', 'feedback-dialog-hint');
      dialog.innerHTML = `<h2 id="feedback-dialog-title">${dialogTitle}</h2>
        <p id="feedback-dialog-hint"></p>
        ${deleting ? '' : '<textarea rows="3" aria-label="反馈正文" placeholder="实际发生了什么，照实写一句" autofocus></textarea>'}
        <p class="feedback-error" role="status"></p>
        <div class="feedback-dialog-actions">
          <button type="button" class="feedback-cancel"${deleting ? ' autofocus' : ''}>取消</button>
          <button type="button" class="feedback-confirm${deleting ? ' danger' : ''}">${confirmLabel}</button>
        </div>
        ${addingToExisting ? '<button type="button" class="feedback-clear">清空本栏反馈</button>' : ''}`;
      const hint = dialog.querySelector('#feedback-dialog-hint')!;
      hint.textContent = deleting ? selected.text : action === 'edit' ? '修改这条反馈的正文' : '写下实际发生了什么，确认后就记在这条断语下面';
      if (deleting) hint.classList.add('feedback-delete-preview');
      const input = dialog.querySelector('textarea');
      if (input && selected) input.value = selected.text;
      const error = dialog.querySelector('.feedback-error')!;
      let saved = false;
      function saveFeedback(nextFeedbacks: VerdictFeedback[], verified = section.verified) {
        const next = committed.map((item, i) => i === index ? { ...item, feedbacks: nextFeedbacks, verified } : item);
        if (!persist(next)) {
          error.textContent = '保存失败，请重试';
          return;
        }
        committed = next;
        section.feedbacks = nextFeedbacks;
        section.verified = verified;
        renderFeedback();
        saved = true;
        dialog.close();
      }
      dialog.querySelector('.feedback-confirm')!.addEventListener('click', () => {
        if (!input) {
          saveFeedback(feedbacks.filter((_, i) => i !== feedbackIndex));
          return;
        }
        const text = input.value.trim();
        if (!text) {
          error.textContent = '先写一句';
          input.focus();
          return;
        }
        if (action === 'edit') {
          saveFeedback(feedbacks.map((feedback, i) => i === feedbackIndex ? { ...feedback, text } : feedback));
          return;
        }
        const now = new Date();
        saveFeedback([...feedbacks, { date: today(now), text, createdAt: now.getTime() }]);
      });
      dialog.querySelector('.feedback-clear')?.addEventListener('click', () => saveFeedback([], false));
      dialog.querySelector('.feedback-cancel')!.addEventListener('click', () => dialog.close());
      let startedOutside = false;
      dialog.addEventListener('pointerdown', event => { startedOutside = event.target === dialog; });
      dialog.addEventListener('click', event => {
        if (!startedOutside || event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (!saved) return;
        const row = feedbackList.children[feedbackIndex];
        const actionButton = row?.querySelector<HTMLButtonElement>(deleting ? '.feedback-delete' : '.feedback-edit');
        (actionButton ?? feedbackButton).focus({ preventScroll: true });
      }, { once: true });
      form.append(dialog);
      dialog.showModal();
    }

    edit.addEventListener('click', () => {
      const input = document.createElement('input');
      const count = document.createElement('small');
      input.className = 'verdict-rename';
      input.setAttribute('aria-label', '栏目名');
      input.value = section.title;
      count.className = 'verdict-counter';
      const limit = () => {
        const chars = [...input.value];
        if (chars.length > 8) input.value = chars.slice(0, 8).join('');
        count.textContent = `${Math.min(chars.length, 8)}/8`;
      };
      title.hidden = edit.hidden = true;
      edit.before(input, count);
      limit();
      input.addEventListener('input', event => { if (!(event as InputEvent).isComposing) limit(); });
      input.addEventListener('compositionend', limit);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); input.blur(); }
      });
      input.addEventListener('blur', () => {
        const name = [...input.value.trim()].slice(0, 8).join('');
        if (name && name !== section.title) { section.title = name; title.textContent = name; markDirty(); }
        input.remove();
        count.remove();
        title.hidden = edit.hidden = false;
      }, { once: true });
      input.focus();
      input.select();
    });
  });

  form.addEventListener('submit', event => event.preventDefault());
  return form;
}
