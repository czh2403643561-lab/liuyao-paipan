import { hexagramName, listHexagrams, trigrams, type LineInput } from './domain';

const catalog = listHexagrams();
const positions = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

export function makePicker() {
  let upper: number | undefined;
  let lower: number | undefined;
  const moving = new Set<number>();
  let query = '';
  let browseOpen = false;

  function select(u: number | undefined, l: number | undefined) {
    if (upper !== u || lower !== l) moving.clear();
    upper = u;
    lower = l;
  }

  function lines(): LineInput[] | undefined {
    if (upper === undefined || lower === undefined) return;
    return [...trigrams[lower].lines, ...trigrams[upper].lines].map((yang, i) => ({ yang, moving: moving.has(i) }));
  }

  function names(items: typeof catalog) {
    return items.map(({ u, l, name }) => `<button type="button" data-hex="${u},${l}">${name}</button>`).join('');
  }

  function search(value: string) {
    query = value;
    const term = value.trim().replace(/\s+/g, '');
    if (!term) return '';
    return names(catalog.filter(item => item.name.includes(term))) || '<p class="hint">没有找到匹配的卦名。</p>';
  }

  function renderWorkspace(lineMark: (yang: boolean) => string) {
    const grid = (side: 'upper' | 'lower', label: string, selected: number | undefined) => `
      <section class="card pick-card"><h2>${label}</h2><div class="trigram-grid">${trigrams.map((tri, index) => `
        <button type="button" data-${side}="${index}" aria-label="${label}：${tri.name}" aria-pressed="${selected === index}">
          <span class="trigram-lines">${[...tri.lines].reverse().map(yang => lineMark(yang)).join('')}</span>${tri.name}
        </button>`).join('')}</div></section>`;
    const movingNames = positions.filter((_, i) => moving.has(i));
    return `${grid('upper', '上卦', upper)}${grid('lower', '下卦', lower)}
      <section class="card pick-card pick-moving"><div class="section-title"><h2>动爻</h2><span>${movingNames.length ? '已选：' + movingNames.join('、') : '已选：无 · 静卦'}</span></div>
        <div class="moving-grid">${positions.map((name, i) => `<button type="button" data-mchip="${i}" aria-label="动爻：${name}" aria-pressed="${moving.has(i)}">${name}</button>`).join('')}</div></section>`;
  }

  function render(lineMark: (yang: boolean) => string, esc: (value: string) => string, calendarCard: string) {
    const grid = (side: 'upper' | 'lower', label: string, selected: number | undefined) => `
      <section class="card pick-card">
        <h2>${label}</h2>
        <div class="trigram-grid">${trigrams.map((tri, index) => `
          <button type="button" data-${side}="${index}" aria-label="${label}：${tri.name}" aria-pressed="${selected === index}">
            <span class="trigram-lines">${[...tri.lines].reverse().map(yang => lineMark(yang)).join('')}</span>${tri.name}
          </button>`).join('')}</div>
      </section>`;
    const picked = lines();
    const movingNames = picked ? picked.map((line, i) => line.moving ? positions[i] : '').filter(Boolean) : [];
    const movingCard = `
      <section class="card pick-card pick-moving">
        <h2>动爻</h2>
        ${picked ? `<div class="moving-grid">${positions.map((name, i) => `
          <button type="button" data-mchip="${i}" aria-label="动爻：${name}" aria-pressed="${picked[i].moving}">${name}</button>`).join('')}</div>
        <p class="hint">${movingNames.length ? '已选：' + movingNames.join('、') + '动' : '静卦 · 无动爻（点上面的格子选动爻，可多选）'}</p>`
        : '<p class="hint">先选好上卦和下卦，再在这里选动爻，可多选；一个不选就是静卦。</p>'}
      </section>`;
    const preview = picked ? `
      <h2 id="picked-name" tabindex="-1">${hexagramName(trigrams[upper!], trigrams[lower!])}</h2>
      <div class="pick-lines">${picked.map((line, i) => `
        <button type="button" data-moving="${i}" aria-label="${positions[i]}，${line.yang ? '阳爻' : '阴爻'}" aria-pressed="${line.moving}">
          <span>${positions[i]}</span>${lineMark(line.yang)}<span class="pick-marker">${line.moving ? (line.yang ? '○' : '×') : ''}</span>
        </button>`).reverse().join('')}</div>
      <p class="hint">点爻线可标为动爻，可多选。全不选为静卦。</p>`
      : '<p class="hint">各选一个上卦和下卦，即可预览。</p>';
    return `
      <section class="card pick-card">
        <input id="hex-search" type="search" aria-label="搜索卦名" placeholder="搜卦名，如：噬嗑 / 否" value="${esc(query)}">
        <div class="hex-names" id="hex-results" aria-live="polite">${search(query)}</div>
      </section>
      ${grid('upper', '上卦', upper)}${grid('lower', '下卦', lower)}
      <section class="card pick-card picked-preview">${preview}</section>
      ${movingCard}
      ${calendarCard}
      <button type="button" class="primary" id="pick-submit" ${picked ? '' : 'disabled'}>装卦排盘</button>
      <details class="card pick-card" id="hex-catalog" ${browseOpen ? 'open' : ''}>
        <summary>全部 64 卦（按八宫浏览）</summary>
        ${trigrams.map(tri => `<section class="hex-group"><h3>${tri.name}宫</h3>
          <div class="hex-names">${names(catalog.filter(item => item.palace === tri.name))}</div>
        </section>`).join('')}
      </details>`;
  }

  return {
    render, renderWorkspace, lines, search,
    hasDraft: () => upper !== undefined || lower !== undefined || Boolean(query) || browseOpen,
    chooseUpper(index: number) { select(index, lower); },
    chooseLower(index: number) { select(upper, index); },
    chooseHex(u: number, l: number) { select(u, l); query = ''; browseOpen = false; },
    toggleMoving(index: number) { if (moving.has(index)) moving.delete(index); else moving.add(index); },
    setBrowseOpen(open: boolean) { browseOpen = open; },
    reset() { select(undefined, undefined); query = ''; browseOpen = false; },
  };
}
