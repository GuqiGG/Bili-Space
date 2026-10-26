from pathlib import Path
p=Path('assets/bridge.js');s=p.read_text(encoding='utf8');s+='''
// Install before website scripts: Shadow DOM retargeting must not leak typing into player shortcuts.
for(const type of ['keydown','keypress','keyup'])window.addEventListener(type,event=>{
  if(!event.composed)return;const path=event.composedPath(),shell=document.querySelector('#bili-space-root');
  if(!shell||!path.includes(shell))return;const editor=path.find(el=>el?.matches?.('input,textarea,select,[contenteditable=true],[role=textbox]'));if(!editor)return;
  event.stopImmediatePropagation();
  if(type==='keydown'&&event.ctrlKey&&event.key===','){event.preventDefault();window.BiliSpace?.openSettings();return;}
  if(type==='keydown'&&event.key==='F5'){event.preventDefault();native('window',{action:'reload'});return;}
  const local=new KeyboardEvent(type,{key:event.key,code:event.code,location:event.location,repeat:event.repeat,ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey,isComposing:event.isComposing,bubbles:true,cancelable:true,composed:false});
  if(!editor.dispatchEvent(local))event.preventDefault();
},true);
''';p.write_text(s,encoding='utf8')
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8')
s=s.replace("  if(location.hostname==='search.bilibili.com')return 'search';", "  if(location.hostname==='space.bilibili.com')return 'space';\n  if(location.hostname==='search.bilibili.com')return 'search';",1)
s=s.replace("query=$('.search input',shadow).value.trim();searchSuggestions", "query=$('.search input',shadow).value;searchSuggestions",1)
s=s.replace("renderSearchPanel();if(!query)return;", "renderSearchPanel();if(!query.trim()){searchSuggestStatus='输入关键词，获取官方搜索联想';renderSearchPanel();return;}",1)
old="    const params=new URLSearchParams({term:query,main_ver:'v1',func:'suggest',suggest_type:'accurate',sub_type:'tag',tag_num:'8'});\n    const response=await fetch('https://s.search.bilibili.com/main/suggest?'+params,{credentials:'include',signal:controller.signal});if(!response.ok)throw Error('suggestion unavailable');const data=await response.json();if(data.code!==0||!Array.isArray(data.result?.tag))throw Error('invalid suggestions');if(revision!==searchSuggestRevision)return;\n    searchSuggestions=sanitizeSearchHistory(data.result.tag.map(item=>item.value||item.term)).slice(0,8);"
new="    const term=query.toWellFormed?query.toWellFormed():Array.from(query).map(c=>c.length===1&&/[\\uD800-\\uDFFF]/.test(c)?'�':c).join(''),params='highlight=0&term='+encodeURIComponent(term)+'&spmid=333.1007';\n    const response=await fetch('https://api.bilibili.com/x/web-interface/suggest?'+params,{credentials:'include',signal:controller.signal});if(!response.ok)throw Error('suggestion unavailable');const data=await response.json(),payload=data.data||data;if(data.code!==0)throw Error('suggestion unavailable');const tags=payload.result?.tag??[];if(!Array.isArray(tags))throw Error('invalid suggestions');if(revision!==searchSuggestRevision)return;\n    searchSuggestions=sanitizeSearchHistory(tags.map(item=>item.value||item.term)).slice(0,8);"
assert old in s;s=s.replace(old,new)
s=s.replace("html,body,#app{background-color:${dark?'#161618':'#fafafa'}!important}", "html,body${location.hostname==='space.bilibili.com'?'':',#app'}{background-color:${dark?'#161618':'#fafafa'}!important}",1)
idx=s.index('html[data-bs-theme=light]{');s=s[:idx]+'''/* Space backgrounds deliberately use negative layers; isolate them above the document surface. */
html[data-bs-page=space] #app{isolation:isolate;background-color:transparent!important}html[data-bs-page=space] .space-header{isolation:isolate;background-color:transparent!important}html[data-bs-page=space] .space-theme-bg{pointer-events:none}html[data-bs-page=space] .header-toutu{display:block!important}
''' +s[idx:]
p.write_text(s,encoding='utf8')
p=Path('src/main.cpp');s=p.read_text(encoding='utf8').replace("style.textContent='html,body,#app{background-color:'", "style.textContent='html,body'+(location.hostname==='space.bilibili.com'?'':',#app')+'{background-color:'",1);p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.23','0.1.24'),encoding='utf8')
p=Path('tests/search20.test.cjs');s=p.read_text(encoding='utf8').replace(r"/^https:\/\/s.search.bilibili.com\/main\/suggest\?/",r"/^https:\/\/api.bilibili.com\/x\/web-interface\/suggest\?/");p.write_text(s,encoding='utf8')
