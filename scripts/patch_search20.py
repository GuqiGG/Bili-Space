from pathlib import Path
p=Path('src/main.cpp');s=p.read_text(encoding='utf8').replace('json config, gm;','json config, gm, searchHistory=json::array();')
s=s.replace('{{"config",config},{"gm",gm}}','{{"config",config},{"gm",gm},{"searchHistory",searchHistory}}')
a=s.index('void save(){');s=s[:a]+'''json cleanSearchHistory(const json& values){
    json result=json::array();if(!values.is_array())return result;
    for(const auto& value:values){if(!value.is_string())continue;auto term=value.get<std::string>();if(term.empty()||term.size()>400||term.find_first_of("\\r\\n\\t")!=std::string::npos||term.find('\\0')!=std::string::npos)continue;if(std::find(result.begin(),result.end(),value)==result.end())result.push_back(value);if(result.size()>=20)break;}return result;
}
'''+s[a:]
s=s.replace('const INITIAL="+config.dump()+";const GM_INITIAL="+gm.dump()+";const RUNTIME=', 'const SEARCH_HISTORY_INITIAL="+searchHistory.dump()+";const INITIAL="+config.dump()+";const GM_INITIAL="+gm.dump()+";const RUNTIME=')
s=s.replace('if(stored.contains("gm")&&stored["gm"].is_object())gm=stored["gm"];', 'if(stored.contains("gm")&&stored["gm"].is_object())gm=stored["gm"];searchHistory=cleanSearchHistory(stored.value("searchHistory",json::array()));')
s=s.replace('        }else if(type=="surface-ready")', '''        }else if(type=="search-history"){
            const auto action=m.value("action",std::string{});auto term=m.value("term",std::string{});bool changed=false;
            if(action=="clear"){searchHistory=json::array();changed=true;}
            else if(action=="add"||action=="delete"){
                auto valid=cleanSearchHistory(json::array({term}));if(!valid.empty()){json next=json::array();if(action=="add")next.push_back(term);for(const auto& old:searchHistory)if(old!=term)next.push_back(old);searchHistory=cleanSearchHistory(next);changed=true;}
            }
            if(changed){save();refreshInjection();}
            execute("window.BiliSpace?.acceptSearchHistory("+searchHistory.dump()+")");
        }else if(type=="surface-ready")''',1)
# std::find is explicitly included, rather than relying on json's transitive includes.
s=s.replace('#include <atomic>','#include <atomic>\n#include <algorithm>');p.write_text(s,encoding='utf8')
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8');a=s.index('function submitSearch(){')
s=s[:a]+'''let searchHistory=typeof SEARCH_HISTORY_INITIAL!=='undefined'?sanitizeSearchHistory(SEARCH_HISTORY_INITIAL):[],searchSuggestions=[],searchSuggestTimer,searchSuggestRequest,searchSuggestRevision=0,searchActive=-1,searchComposing=false,searchSuggestStatus='';
function sanitizeSearchHistory(items){return Array.isArray(items)?[...new Set(items.filter(x=>typeof x==='string'&&x.trim()&&x.length<=100&&!/[\\r\\n\\t\\0]/.test(x)).map(x=>x.trim()))].slice(0,20):[];}
function acceptSearchHistory(items){searchHistory=sanitizeSearchHistory(items);if(shadow&&!$('#search-panel',shadow).hidden)renderSearchPanel();}
function changeSearchHistory(action,term){if(action==='add')searchHistory=sanitizeSearchHistory([term,...searchHistory]);else if(action==='delete')searchHistory=searchHistory.filter(x=>x!==term);else searchHistory=[];native('search-history',{action,term});}
function closeSearchPanel(){if(!shadow)return;$('#search-panel',shadow).hidden=true;$('.search input',shadow).setAttribute('aria-expanded','false');$('.search input',shadow).removeAttribute('aria-activedescendant');clearTimeout(searchSuggestTimer);searchSuggestRequest?.abort();searchSuggestRevision++;searchActive=-1;}
function renderSearchPanel(){
  const panel=$('#search-panel',shadow),input=$('.search input',shadow);panel.replaceChildren();searchActive=-1;input.removeAttribute('aria-activedescendant');
  const heading=(label)=>{const h=document.createElement('h2');h.textContent=label;panel.append(h);return h;};
  const choice=(term,history)=>{const row=document.createElement('div');row.className='search-row';const button=document.createElement('button');button.type='button';button.className='search-choice';button.dataset.query=term;button.textContent=term;button.id='search-option-'+panel.querySelectorAll('[data-query]').length;button.setAttribute('role','option');button.tabIndex=-1;row.append(button);if(history){const remove=document.createElement('button');remove.type='button';remove.className='search-remove';remove.dataset.remove=term;remove.textContent='×';remove.setAttribute('aria-label','删除搜索历史：'+term);row.append(remove);}panel.append(row);};
  if(searchHistory.length){const h=heading('搜索历史'),clear=document.createElement('button');clear.type='button';clear.className='search-clear';clear.dataset.clear='true';clear.textContent='清空';clear.setAttribute('aria-label','清空搜索历史');h.append(clear);searchHistory.forEach(term=>choice(term,true));}
  else{heading('搜索历史');const empty=document.createElement('p');empty.textContent='暂无搜索历史';panel.append(empty);}
  heading('猜你想搜 · B站官方');searchSuggestions.forEach(term=>choice(term,false));if(!searchSuggestions.length){const status=document.createElement('p');status.setAttribute('role','status');status.textContent=searchSuggestStatus||'输入关键词，获取官方搜索联想';panel.append(status);}
}
function openSearchPanel(){if(!shadow)return;$('#search-panel',shadow).hidden=false;$('.search input',shadow).setAttribute('aria-expanded','true');renderSearchPanel();queueSearchSuggestions();}
function queueSearchSuggestions(){
  clearTimeout(searchSuggestTimer);searchSuggestRequest?.abort();const revision=++searchSuggestRevision,query=$('.search input',shadow).value.trim();searchSuggestions=[];searchSuggestStatus=query?'正在获取官方联想…':'';renderSearchPanel();if(!query)return;
  searchSuggestTimer=setTimeout(async()=>{const controller=new AbortController();searchSuggestRequest=controller;const timeout=setTimeout(()=>controller.abort(),5000);try{
    const params=new URLSearchParams({term:query,main_ver:'v1',func:'suggest',suggest_type:'accurate',sub_type:'tag',tag_num:'8'});
    const response=await fetch('https://s.search.bilibili.com/main/suggest?'+params,{credentials:'include',signal:controller.signal});if(!response.ok)throw Error('suggestion unavailable');const data=await response.json();if(data.code!==0||!Array.isArray(data.result?.tag))throw Error('invalid suggestions');if(revision!==searchSuggestRevision)return;
    searchSuggestions=sanitizeSearchHistory(data.result.tag.map(item=>item.value||item.term)).slice(0,8);searchSuggestStatus=searchSuggestions.length?'':'暂无官方联想';
  }catch{if(revision!==searchSuggestRevision)return;searchSuggestions=[];searchSuggestStatus='官方联想暂时不可用';}finally{clearTimeout(timeout);if(revision===searchSuggestRevision&&!$('#search-panel',shadow).hidden)renderSearchPanel();}},180);
}
function chooseSearch(term){$('.search input',shadow).value=term;submitSearch();}
function installSearchPanel(){
  const form=$('.search',shadow),input=$('input',form),panel=$('#search-panel',shadow);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','search-panel');input.setAttribute('aria-expanded','false');
  input.addEventListener('focus',openSearchPanel);input.addEventListener('click',()=>{if(panel.hidden)openSearchPanel();});input.addEventListener('input',e=>{if(e.isComposing||searchComposing)return;panel.hidden=false;input.setAttribute('aria-expanded','true');queueSearchSuggestions();});
  input.addEventListener('compositionstart',()=>searchComposing=true);input.addEventListener('compositionend',()=>{searchComposing=false;openSearchPanel();});
  input.addEventListener('keydown',e=>{if(e.isComposing||searchComposing)return;const options=$$('[data-query]',panel);if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();closeSearchPanel();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();if(panel.hidden)openSearchPanel();const choices=$$('[data-query]',panel);if(!choices.length)return;searchActive=(searchActive+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices.forEach((el,i)=>{el.classList.toggle('selected',i===searchActive);el.setAttribute('aria-selected',String(i===searchActive));});input.setAttribute('aria-activedescendant',choices[searchActive].id);choices[searchActive].scrollIntoView?.({block:'nearest'});}else if(e.key==='Enter'&&!panel.hidden&&options[searchActive]){e.preventDefault();e.stopPropagation();chooseSearch(options[searchActive].dataset.query);}});
  panel.addEventListener('pointerdown',e=>e.preventDefault());panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.remove!==undefined){changeSearchHistory('delete',b.dataset.remove);renderSearchPanel();}else if(b.dataset.clear){changeSearchHistory('clear');renderSearchPanel();}else if(b.dataset.query!==undefined)chooseSearch(b.dataset.query);});
  form.addEventListener('focusout',e=>{if(!form.contains(e.relatedTarget))closeSearchPanel();});document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(form))closeSearchPanel();},{passive:true});
}
''' +s[a:]
s=s.replace("  if(!query)return;\n  const url='https://search.bilibili.com/all?keyword='", "  if(!query||searchComposing)return;\n  changeSearchHistory('add',query);closeSearchPanel();\n  const url='https://search.bilibili.com/all?keyword='")
s=s.replace("<span class=\"sr-only\" id=\"search-status\" role=\"status\" aria-live=\"polite\"></span></form>","<span class=\"sr-only\" id=\"search-status\" role=\"status\" aria-live=\"polite\"></span><section id=\"search-panel\" class=\"search-panel\" aria-label=\"搜索历史和官方联想\" hidden></section></form>")
s=s.replace("  $('.search',shadow).addEventListener('submit'", "  installSearchPanel();\n  $('.search',shadow).addEventListener('submit'",1)
s=s.replace("window.BiliSpace={beginNavigation", "window.BiliSpace={acceptSearchHistory,beginNavigation",1)
s=s.replace("  if(document.readyState==='complete')window.__bsPaintReady?.();", "  native('search-history',{action:'get'});\n  if(document.readyState==='complete')window.__bsPaintReady?.();",1)
s=s.replace('.search button{','.search > button{').replace('.search[aria-busy=true] button', '.search[aria-busy=true] > button')
idx=s.index('.sr-only{');s=s[:idx]+'''.search-panel{position:absolute;top:calc(100% + 9px);left:0;right:0;max-height:min(460px,calc(100vh - var(--bs-header-height,58px) - 24px));overflow:auto;overscroll-behavior:contain;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:12px;box-shadow:0 12px 32px #0004;pointer-events:auto;text-align:left}.search-panel[hidden]{display:none}.search-panel h2{position:relative;display:flex;justify-content:space-between;align-items:center;gap:8px;margin:5px 0 9px;font-size:12px;color:var(--muted);font-weight:500}.search-panel p{font-size:12px;color:var(--muted);margin:12px 2px}.search-row{display:flex;align-items:center;min-width:0;border-radius:7px}.search-panel button{border:0;background:none;color:var(--ink);font:inherit;cursor:pointer}.search-panel .search-choice{flex:1;min-width:0;text-align:left;padding:9px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;border-radius:7px}.search-choice:hover,.search-choice.selected{background:var(--field);color:var(--accent)}.search-panel .search-remove{flex:none;width:28px;height:28px;color:var(--muted);font-size:19px;border-radius:6px}.search-remove:hover,.search-panel .search-clear:hover{color:var(--accent);background:var(--field)}.search-panel .search-clear{padding:3px 5px;color:var(--muted);font-size:11px}
''' +s[idx:]
p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.19','0.1.20'),encoding='utf8')
