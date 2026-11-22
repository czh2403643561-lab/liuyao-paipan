import { verdictSectionsFor, type RecordEntry, type VerdictSection } from './records';

const pencil = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l1-5L16 4a2.8 2.8 0 0 1 4 4L9 19z"/></svg>';
const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function savedLabel(timestamp?: number) {
  if (timestamp === undefined) return '已保存';
  const date = new Date(timestamp);
  const day = date.toDateString() === new Date().toDateString() ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`;
  const time = [date.getHours(), date.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
  return `已保存于 ${day} ${time}`;
}

export function createVerdictForm(entry: RecordEntry, persist: (sections: VerdictSection[]) => boolean) {
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
      ${first ? '' : `<span class="verdict-badge">✓ 已应验</span><span class="verdict-preview"></span><button type="button" class="verdict-chevron" aria-label="展开或收起" aria-controls="verdict-body-${index}">${chevron}</button>`}<div class="verdict-actions"><span class="verdict-status" role="status"></span><button type="button" class="verdict-save"></button></div></div>
      <div id="verdict-body-${index}" class="verdict-body"><textarea aria-labelledby="verdict-title-${index}" rows="4"></textarea><div class="verdict-verify-row"><button type="button" class="verdict-verify"></button></div></div>`;
    form.append(panel);
    const title = panel.querySelector<HTMLElement>('.verdict-title')!;
    const edit = panel.querySelector<HTMLButtonElement>('.verdict-edit')!;
    const body = panel.querySelector<HTMLElement>('.verdict-body')!;
    const preview = panel.querySelector<HTMLElement>('.verdict-preview');
    const toggle = panel.querySelector<HTMLButtonElement>('.verdict-chevron');
    const badge = panel.querySelector<HTMLElement>('.verdict-badge');
    const content = panel.querySelector('textarea')!;
    const verify = panel.querySelector<HTMLButtonElement>('.verdict-verify')!;
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
      if (badge) badge.hidden = !section.verified;
      verify.setAttribute('aria-pressed', String(section.verified));
      verify.innerHTML = `<span aria-hidden="true">${section.verified ? '✓' : ''}</span>${section.verified ? '已应验' : '应验了，勾这里'}`;
    }
    body.hidden = !first && !section.content.trim();
    updatePanel();
    toggle?.addEventListener('click', () => { body.hidden = !body.hidden; updatePanel(); });
    content.addEventListener('input', () => { section.content = content.value; markDirty(); });
    verify.addEventListener('click', () => {
      const verified = !section.verified;
      const next = committed.map((item, i) => i === index ? { ...item, verified } : { ...item });
      if (persist(next)) {
        committed = next;
        section.verified = verified;
        verify.title = '';
        updatePanel();
      } else {
        verify.title = '保存失败，请重试';
        verify.textContent = '保存失败，点此重试';
      }
    });

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
