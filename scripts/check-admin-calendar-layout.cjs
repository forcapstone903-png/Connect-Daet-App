// Standalone Edge layout regression check; synthetic data, no auth bypass.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
async function main() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'calendar-layout-'));
  const browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${temp}/profile`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    const portFile = path.join(temp, 'profile/DevToolsActivePort');
    for (let i=0; i<100 && !fs.existsSync(portFile); i++) await delay(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json();
    const tab = tabs.find(tab => tab.type === 'page' && tab.url === 'about:blank') || tabs.find(tab => tab.type === 'page');
    if (!tab) throw new Error('No browser page target available');
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen=resolve; ws.onerror=reject; });
    let id=0;
    const pending = new Map();
    ws.onmessage = ({data}) => {
      const m=JSON.parse(data), p=pending.get(m.id);
      if (p) {pending.delete(m.id); if(m.error)p.reject(m.error);else p.resolve(m.result);}
    };
    const send = (method, params={}) => new Promise((resolve,reject) => {
      pending.set(++id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
    });
    const evaluate = async expression => {
      const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    await send('Page.enable');
    for(const page of ['dashboard','events']) {
      await send('Page.navigate',{url:`http://localhost:3000/admin/${page}`}); await delay(2000);
      console.log('Actual page:',await evaluate('({url:location.href,calendarPresent:!!document.querySelector(".fc-view")})'));
    }
    const globalPath=path.join(root,'src/app/globals.css');
    const result=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync(globalPath,'utf8'),{from:globalPath});
    const css=result.css+fs.readFileSync(path.join(root,'src/app/components/admin/AdminCalendar.css'),'utf8');
    const scripts=['core','daygrid','timegrid','interaction'].map(n=>`<script>${fs.readFileSync(path.join(root,'node_modules/@fullcalendar',n,'index.global.min.js'),'utf8')}</script>`).join('');
    for(const page of ['dashboard','events']) {
      const source=fs.readFileSync(path.join(root,'src/app/admin',page,'page.js'),'utf8');
      const height=Number(source.match(/height=\{(\d+)\}/)[1]);
      const grid=source.match(/className="(grid grid-cols-1 lg:grid-cols-\[minmax[^"]+)"/)[1];
      const html=`<!doctype html><meta charset="utf-8"><style>${css}</style><body class="admin-page-shell"><main style="padding:24px"><div class="${grid}"><section class="admin-events-calendar admin-panel min-w-0 p-3 sm:p-5"><h2>Event calendar</h2><div class="admin-events-calendar-scroll"><div id="calendar"></div></div><p>Festival / Workshop</p></section><aside class="admin-panel min-w-0 p-3 sm:p-5">Upcoming Events</aside></div></main>${scripts}<script>window.calendar=new FullCalendar.Calendar(document.getElementById('calendar'),{initialView:'dayGridMonth',initialDate:'2026-09-18',height:${height},fixedWeekCount:true,dayMaxEvents:3,headerToolbar:{left:'title',right:'prev,next today dayGridMonth,timeGridWeek'},events:[{title:'Workshop',start:'2026-09-18T09:00:00',end:'2026-09-18T11:00:00'}]});calendar.render();</script>`;
      const fixture=path.join(temp,page+'.html'); fs.writeFileSync(fixture,html);
      await send('Page.navigate',{url:require('node:url').pathToFileURL(fixture).href}); await delay(500);
      await check(page,send,evaluate);
    }
    console.log('Synthetic browser layout checks passed. Authenticated pages are not bypassed.');
  } finally {if(ws)ws.close();browser.kill();}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function check(page,send,evaluate) {
  for(const width of [1440,1024,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate('calendar.changeView("dayGridMonth");calendar.updateSize()'); await delay(200);
    const month=await evaluate(`(() => {
      const rect=el=>{const r=el.getBoundingClientRect();return {height:r.height,x:r.x,y:r.y,width:r.width}};
      let el=document.querySelector('.fc-view');const chain=[];
      while(el&&chain.length<5){chain.push({class:el.className,...rect(el),computedHeight:getComputedStyle(el).height});el=el.parentElement}
      return {chain,calendar:rect(document.querySelector('.fc')),panel:rect(document.querySelector('section')),aside:rect(document.querySelector('aside')),days:document.querySelectorAll('.fc-daygrid-day').length};
    })()`);
    assert.ok(month.chain[0].height>500,'month body must not collapse');
    assert.equal(month.days,42);
    if(width>=1024){assert.equal(month.panel.y,month.aside.y);assert.ok(month.aside.x>month.panel.x,'desktop cards side by side');}
    else assert.ok(month.aside.y>month.panel.y,'mobile cards stacked');
    await evaluate('calendar.changeView("timeGridWeek");calendar.updateSize()');await delay(200);
    const week=await evaluate(`(() => {
      const scroller=[...document.querySelectorAll('.fc-scroller')].find(el=>el.scrollHeight>el.clientHeight+100);
      const before=scroller?.scrollTop;if(scroller)scroller.scrollTop=before+100;
      return {height:document.querySelector('.fc').getBoundingClientRect().height,bodyHeight:document.querySelector('.fc-view').getBoundingClientRect().height,scrollable:!!scroller&&scroller.scrollTop!==before,eventHeight:document.querySelector('.fc-timegrid-event')?.getBoundingClientRect().height,slotHeight:document.querySelector('.fc-timegrid-slot').getBoundingClientRect().height};
    })()`);
    assert.equal(week.height,month.calendar.height,'equal month/week heights');
    assert.ok(week.bodyHeight>500);assert.ok(week.scrollable,'weekly timeline scrolls');
    assert.ok(week.eventHeight>week.slotHeight*3,'two-hour event spans four half-hour slots');
    console.log(JSON.stringify({page,width,month,week}));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
