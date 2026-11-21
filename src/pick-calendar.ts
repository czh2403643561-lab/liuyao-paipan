import { branchElement, calendarBranches, dayStems, dayVoids, sixGods, solarPillars, type ChartCalendar } from './domain';

export type CalendarField = 'month' | 'day';
export type CalendarSheet = { field: CalendarField; dayStem?: string; dayBranch?: string };

export function currentCalendar(date: string): ChartCalendar {
  const { monthBranch, day } = solarPillars(date);
  return { mode: 'current', monthBranch, dayStem: day[0], dayBranch: day[1] };
}

export function renderPickCalendar(calendar: ChartCalendar, dateCaption: string, flash: boolean): string {
  const current = calendar.mode === 'current';
  const field = (key: CalendarField, label: string, value: string) =>
    `<button type="button" class="calendar-field${flash ? ' calendar-flash' : ''}" data-calendar-field="${key}"><small>${label}</small><strong>${value}</strong><span aria-hidden="true">▾</span></button>`;
  return `<section class="card pick-card pick-calendar">
    <div class="calendar-heading"><h2>月建 · 日辰</h2><button type="button" id="calendar-current" class="${current ? 'calendar-on' : ''}" aria-pressed="${current}">${current ? '✓ ' : ''}以当前</button></div>
    <div class="calendar-fields">${field('month', '月建', calendar.monthBranch)}${field('day', '日辰', calendar.dayStem + calendar.dayBranch)}</div>
    <div class="calendar-derived"><span>旬空 <strong class="pan-chip kong">${dayVoids(calendar.dayStem, calendar.dayBranch)?.join('')}</strong></span><small>${current ? dateCaption : '随日辰自动算'}</small></div>
    <p class="hint calendar-status${current ? '' : ' custom'}">${current ? '按起卦日期 · 排盘页照常显示日期与四柱' : '已自选 · 排盘页不显示日期与四柱'}</p>
  </section>`;
}

export function renderCalendarSheet(sheet: CalendarSheet, calendar: ChartCalendar, animate: boolean): string {
  const month = sheet.field === 'month';
  const stem = sheet.dayStem ?? calendar.dayStem;
  const branch = sheet.dayBranch ?? calendar.dayBranch;
  const voids = dayVoids(stem, branch);
  const chosen = (active: boolean) => `class="${active ? 'calendar-on' : ''}" aria-pressed="${active}"`;
  const branches = `<div class="calendar-branches">${calendarBranches.map(value =>
    `<button type="button" ${chosen(value === (month ? calendar.monthBranch : branch))} data-calendar-branch="${value}"><strong>${value}</strong><small class="el-${branchElement[value]}">${branchElement[value]}</small></button>`).join('')}</div>`;
  const dayFields = `<div class="calendar-preview" aria-live="polite"><strong>${stem + branch}日</strong> · ${voids ? `旬空 <b>${voids.join('')}</b> · 六神起 <b>${sixGods(stem)[0]}</b>` : '干支不配，请选另一干或支'}</div>
    <div class="calendar-field-label">日干</div><div class="calendar-stems">${dayStems.map(value =>
      `<button type="button" ${chosen(value === stem)} data-calendar-stem="${value}">${value}</button>`).join('')}</div><div class="calendar-field-label">日支</div>`;
  return `<div class="scrim" id="calendar-scrim"><section class="sheet calendar-sheet${animate ? ' calendar-slide' : ''}" role="dialog" aria-modal="true" aria-labelledby="calendar-sheet-title">
    <div class="sheet-handle"></div><div class="calendar-heading"><h2 id="calendar-sheet-title">选择${month ? '月建' : '日辰'}</h2><button type="button" id="calendar-close" aria-label="关闭">×</button></div>
    ${month ? '' : dayFields}${branches}<p class="hint calendar-sheet-note">${month ? '点选地支即完成' : '日干、日支各点一次，配成有效日辰后自动关闭'}</p>
  </section></div>`;
}
