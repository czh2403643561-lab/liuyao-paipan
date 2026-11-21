import { Solar } from 'lunar-javascript';
import { branchElement } from './domain';

const jieNames = ['小寒','立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪'];
const elements = ['木','火','土','金','水'];
const stemElement: Record<string,string> = {甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
type Month = { start: string; end: string; name: string; stem: string; branch: string; jie: string; nextJie: string };
export type PeriodState = { view:'day'|'month'; year:number; month:number; selectedDay:string; selectedMonth:number; element?:string };

const parts = (date:string) => date.match(/\d+/g)!.map(Number);
const solar = (date:string) => { const [y,m,d,h=12,min=0,sec=0]=parts(date); return Solar.fromYmdHms(y,m,d,h,min,sec); };
const labelDate = (date:string) => { const [y,m,d]=parts(date); return `${m}月${d}日`; };
const timestamp = (date:string) => { const [y,m,d]=parts(date); return Date.UTC(y,m-1,d); };
const colored = (gan:string,zhi:string) => `<span class="el-${stemElement[gan]}">${gan}</span><span class="el-${branchElement[zhi]}">${zhi}</span>`;

export function periodMonths(origin:string): { months:Month[]; originIndex:number } {
  const [year]=parts(origin);
  const found = new Map<string,{ date:string; jie:string }>();
  for (let y=year-1;y<=year+2;y++) {
    const table=Solar.fromYmdHms(y,7,1,12,0,0).getLunar().getJieQiTable();
    for (const jie of jieNames) {
      const date=table[jie]?.toYmdHms();
      if(date) found.set(date,{date,jie});
    }
  }
  const terms=[...found.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const originIndex=terms.findLastIndex(term=>term.date<=origin.replace('T',' ') + ':00');
  const months=terms.slice(originIndex-1,originIndex+13).map((term,index)=>{
    const next=terms[originIndex-1+index+1];
    const ganZhi=solar(term.date).getLunar().getMonthInGanZhiExact();
    return {start:term.date,end:next?.date ?? '',name:ganZhi,stem:ganZhi[0],branch:ganZhi[1],jie:term.jie,nextJie:next?.jie ?? ''};
  });
  return {months,originIndex:1};
}

export function initialPeriod(origin:string):PeriodState {
  const [year,month]=parts(origin);
  return {view:'day',year,month,selectedDay:origin.slice(0,10),selectedMonth:1};
}

export function renderPeriod(state:PeriodState, origin:string, dayPillar:string, monthPillar:string):string {
  const originDay=origin.slice(0,10);
  const originTime=origin.slice(11,16);
  const {months}=periodMonths(origin);
  const filter=state.element;
  const chosenMonth=months[state.selectedMonth];
  const selectedSolar=solar(state.selectedDay+' '+originTime);
  const selectedGanZhi=state.selectedDay===originDay ? dayPillar : selectedSolar.getLunar().getDayInGanZhiExact();
  const dayDiff=Math.round((timestamp(state.selectedDay)-timestamp(originDay))/86400000);
  const detail=state.view==='day'
    ? `已选 ${labelDate(state.selectedDay)} ${selectedGanZhi} · 周${selectedSolar.getWeekInChinese()} · ${dayDiff===0?'起卦当天':`距起卦 ${dayDiff>0?'+':''}${dayDiff} 天`} · 地支${selectedGanZhi[1]}属${branchElement[selectedGanZhi[1]]}`
    : `已选 ${chosenMonth.name}月 · ${labelDate(chosenMonth.start)}${chosenMonth.jie}交节 · ${state.selectedMonth===1?'就是本月':state.selectedMonth===2?'就是下个月':state.selectedMonth>2?`再过 ${state.selectedMonth-1} 个月`:`${1-state.selectedMonth} 个月前`}`;
  const first=new Date(Date.UTC(state.year,state.month-1,1)).getUTCDay();
  const count=new Date(Date.UTC(state.year,state.month,0)).getUTCDate();
  const dayCells=Array.from({length:Math.ceil((first+count)/7)*7},(_,index)=>{
    const date=new Date(Date.UTC(state.year,state.month-1,index-first+1));
    const y=date.getUTCFullYear(),m=date.getUTCMonth()+1,d=date.getUTCDate();
    const key=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const gz=key===originDay?dayPillar:solar(key+' '+originTime).getLunar().getDayInGanZhiExact();
    const filtered=filter&&branchElement[gz[1]]===filter;
    return `<button type="button" data-period-day="${key}" class="period-day${m!==state.month?' outside':''}${key===originDay?' origin':''}${key===state.selectedDay&&key!==originDay?' selected':''}${filtered?' filtered':''}"><strong>${d}</strong><small>${m===state.month?colored(gz[0],gz[1]):gz}</small></button>`;
  }).join('');
  const monthCells=months.map((item,index)=>{
    const filtered=filter&&branchElement[item.branch]===filter;
    const end=solar(item.end).nextDay(-1).toYmd();
    const relative=index===1?'本月 · 原点':index===0?'上月':index===2?'下月':`+${index-1} 月`;
    return `<button type="button" data-period-month="${index}" class="period-month${index===1?' origin':''}${index===state.selectedMonth?' selected':''}${filtered?' filtered':''}"><strong>${index===1?colored(monthPillar[0],monthPillar[1]):colored(item.stem,item.branch)}月</strong><span>${labelDate(item.start)} – ${labelDate(end)}<small>${item.jie} → ${item.nextJie}</small></span><em class="el-${branchElement[item.branch]}">${branchElement[item.branch]}</em><b>${relative}</b></button>`;
  }).join('');
  return `<div class="period-overlay" id="period-overlay"><section class="period-dialog" role="dialog" aria-modal="true" aria-labelledby="period-title"><div class="period-head"><h2 id="period-title">往来干支</h2><div class="segmented period-tabs"><button type="button" data-period-view="day" class="${state.view==='day'?'selected':''}">日</button><button type="button" data-period-view="month" class="${state.view==='month'?'selected':''}">月</button></div><button type="button" id="period-close" aria-label="关闭">×</button></div><div class="period-filters">${elements.map(el=>`<button type="button" data-period-element="${el}" class="${filter===el?'selected':''}">${el}</button>`).join('')}<small>${filter?state.view==='day'?`${filter}支日已描边`:`${filter}月已亮出`:'点五行筛选'}</small></div><div class="period-content">${state.view==='day'?`<div class="period-month-nav"><button type="button" data-period-shift="-1" aria-label="上个月">‹</button><strong>${state.year}年${state.month}月</strong><button type="button" data-period-shift="1" aria-label="下个月">›</button></div><div class="period-week">${[...'日一二三四五六'].map(x=>`<span>${x}</span>`).join('')}</div><div class="period-days">${dayCells}</div>`:`<div class="period-months">${monthCells}</div>`}</div><div class="period-foot"><p>${detail}</p><button type="button" id="period-done" class="primary">完成</button></div></section></div>`;
}
