from pathlib import Path
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8')
s=s.replace("let searchHistory=typeof SEARCH_HISTORY_INITIAL!=='undefined'?sanitizeSearchHistory(SEARCH_HISTORY_INITIAL):[]", "let searchHistory=[]")
a=s.index('function changeSearchHistory(');b=s.index('\nfunction closeSearchPanel',a)
s=s[:a]+'''const OFFICIAL_HISTORY_URL='https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html',OFFICIAL_HISTORY_ORIGIN='https://s1.hdslb.com',OFFICIAL_HISTORY_KEY='search_history:search_history';
let officialHistoryFrame,officialHistoryReady,officialHistoryQueue=Promise.resolve(),officialHistoryStatus='';
async function historyFrame(){
  if(officialHistoryReady)return officialHistoryReady;
  officialHistoryReady=new Promise((resolve,reject)=>{const start=()=>{officialHistoryFrame=$('iframe[src="'+OFFICIAL_HISTORY_URL+'"]');if(officialHistoryFrame){resolve(officialHistoryFrame);return;}const frame=document.createElement('iframe');officialHistoryFrame=frame;frame.hidden=true;frame.src=OFFICIAL_HISTORY_URL;frame.setAttribute('aria-hidden','true');const timer=setTimeout(()=>reject(Error('history frame timeout')),5000);frame.addEventListener('load',()=>{clearTimeout(timer);resolve(frame);},{once:true});document.body.append(frame);};if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});}).catch(error=>{officialHistoryReady=null;throw error;});return officialHistoryReady;
}
async function officialHistoryRequest(type,value,key=OFFICIAL_HISTORY_KEY){const frame=await historyFrame();return new Promise((resolve,reject)=>{const id='bili-space-history-'+crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('official history unavailable'));},2000);function receive(e){if(e.origin!==OFFICIAL_HISTORY_ORIGIN||e.source!==frame.contentWindow||e.data?.type!=='COLS_RES'||e.data.id!==id||e.data.key!==key)return;clearTimeout(timer);window.removeEventListener('message',receive);resolve(e.data.value);}window.addEventListener('message',receive);frame.contentWindow.postMessage({type,key,id,...(type==='COLS_SET'?{value}:{})},OFFICIAL_HISTORY_ORIGIN);});}
function officialRecords(raw){try{const values=JSON.parse(raw||'[]');if(!Array.isArray(values))return [];const seen=new Set();return values.filter(x=>x&&typeof x.value==='string'&&x.value.trim()&&x.value.length<=100&&!seen.has(x.value)&&seen.add(x.value)).slice(0,20);}catch{return [];}}
async function readOfficialSearchHistory(){let raw=await officialHistoryRequest('COLS_GET');if(raw===null||raw===undefined){const legacy=localStorage.getItem('search_history');if(legacy){raw=legacy;await officialHistoryRequest('COLS_SET',JSON.stringify(officialRecords(raw)));}}return officialRecords(raw);}
async function loadOfficialSearchHistory(){try{const records=await readOfficialSearchHistory();officialHistoryStatus='';acceptSearchHistory(records.map(x=>x.value));}catch{officialHistoryStatus='B站搜索历史暂时不可用';if(shadow&&!$('#search-panel',shadow).hidden)renderSearchPanel();}}
function changeSearchHistory(action,term){const operation=officialHistoryQueue.then(async()=>{let records=await readOfficialSearchHistory();if(action==='add')records=[{value:term,timestamp:Date.now()},...records.filter(x=>x.value!==term)].slice(0,20);else if(action==='delete')records=records.filter(x=>x.value!==term);else records=[];await officialHistoryRequest('COLS_SET',JSON.stringify(records));await officialHistoryRequest('COLS_SET','1','search_history:migrated');officialHistoryStatus='';acceptSearchHistory(records.map(x=>x.value));});officialHistoryQueue=operation.catch(()=>{officialHistoryStatus='B站搜索历史暂时不可用';toast('无法更新B站搜索历史，请稍后重试。');if(shadow&&!$('#search-panel',shadow).hidden)renderSearchPanel();});return officialHistoryQueue;}
''' +s[b:]
s=s.replace("const row=document.createElement('div');row.className='search-row';", "const row=document.createElement('div');row.className=history?'search-history-chip':'search-row';")
s=s.replace("panel.append(row);};", "(history?$('.search-history-chips',panel):panel).append(row);};",1)
s=s.replace("h.append(clear);searchHistory.forEach", "h.append(clear);const chips=document.createElement('div');chips.className='search-history-chips';panel.append(chips);searchHistory.forEach",1)
s=s.replace("empty.textContent='暂无搜索历史'", "empty.textContent=officialHistoryStatus||'暂无搜索历史'")
s=s.replace("heading('猜你想搜 · B站官方')", "heading('猜你想搜')")
s=s.replace("renderSearchPanel();queueSearchSuggestions();}", "renderSearchPanel();loadOfficialSearchHistory();queueSearchSuggestions();}",1)
s=s.replace("function submitSearch(){", "async function submitSearch(){",1)
s=s.replace("  changeSearchHistory('add',query);closeSearchPanel();\n  const url=", "  closeSearchPanel();\n  const url=",1)
s=s.replace("  beginNavigation(url);native('navigate',{url});", "  beginNavigation(url);await changeSearchHistory('add',query);native('navigate',{url});",1)
s=s.replace("  native('search-history',{action:'get'});", "  loadOfficialSearchHistory();",1)
s=s.replace(".search-row{display:flex;", ".search-history-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}.search-history-chip{display:inline-flex;align-items:center;max-width:100%;min-width:0;background:var(--field);border-radius:6px}.search-history-chip .search-choice{flex:0 1 auto!important;max-width:200px;padding:6px 8px!important;font-size:12px!important}.search-history-chip .search-remove{width:22px!important;height:24px!important;font-size:16px!important}.search-row{display:flex;",1)
# No native client-history store is read by the UI anymore.
p.write_text(s,encoding='utf8')
p=Path('src/main.cpp');s=p.read_text(encoding='utf8');a=s.index('        }else if(type=="search-history"){');b=s.index('        }else if(type=="surface-ready")',a);s=s[:a]+s[b:];s=s.replace('const SEARCH_HISTORY_INITIAL="+searchHistory.dump()+";','');p.write_text(s,encoding='utf8')
