from pathlib import Path
r=Path.cwd();p=r/'assets/enhance.js';s=p.read_text(encoding='utf8')
s=s.replace('/* Better Bili Space','/* Bili-Space').replace("diagnostic('Better Bili Space ready')","diagnostic('Bili-Space ready')")
s=s.replace('const DEFAULTS = {','const APP_META=typeof APP_INFO!==\'undefined\'?APP_INFO:{name:\'Bili-Space\',version:\'0.1.34\',author:\'未署名\'};\nconst DEFAULTS = {autoCheckUpdates:true,',1)
s=s.replace("plugins:['扩展插件','plugins']};","plugins:['扩展插件','plugins'],about:['关于与更新','plugins']};")
insert='''let clientUpdate={status:'idle',message:'尚未检查更新'};
function renderUpdatePanel(){
  if(!shadow)return;const line=$('#client-update-status',shadow);if(!line)return;
  $('#app-version',shadow).textContent=APP_META.version;$('#app-author',shadow).textContent=APP_META.author;
  line.textContent=clientUpdate.message||'';$('#update-version',shadow).textContent=clientUpdate.available?'新版本 '+clientUpdate.version:'';
  const list=$('#update-notes',shadow);list.replaceChildren(...(clientUpdate.changelog||[]).map(text=>{const li=document.createElement('li');li.textContent=String(text);return li;}));
  $$('[data-update=check],[data-update=download]',shadow).forEach(b=>b.disabled=!!clientUpdate.busy);
  $('[data-update=download]',shadow).hidden=!clientUpdate.available||!!clientUpdate.ready;
  $('[data-update=ignore]',shadow).hidden=!clientUpdate.available||!!clientUpdate.required||!!clientUpdate.ignored;
  $('[data-update=open-folder]',shadow).hidden=!clientUpdate.ready;
}
function acceptUpdateStatus(value){
  clientUpdate={...value};renderUpdatePanel();
  const trigger=$('#settings-trigger',shadow);if(trigger){trigger.dataset.update=String(!!value.available&&!value.ignored);trigger.title=value.available&&!value.ignored?'发现新版本 · 客户端设置':'客户端设置 · Ctrl+,';}
}
'''
s=s.replace('function tabContent(){',insert+'''function tabContent(){
  if(currentTab==='about')return `<h2>Bili-Space</h2><p class="subtitle">留出空间，专注喜欢。</p><div class="row"><span>版本号</span><strong id="app-version"></strong></div><div class="row"><span>作者</span><strong id="app-author"></strong></div>${toggle('autoCheckUpdates','启动时检查更新','仅连接 bili.gvqi.top；检查失败不会阻止使用。已检测到的强制更新不能忽略。')}<div class="section-label">更新 / UPDATES</div><p id="client-update-status" role="status" aria-live="polite"></p><strong id="update-version"></strong><ul id="update-notes"></ul><div class="actions"><button class="link" data-update="check">检查更新</button><button class="link" data-update="download" hidden>下载更新包（校验）</button><button class="link" data-update="ignore" hidden>忽略此版本</button><button class="link" data-update="open-folder" hidden>打开更新包目录</button><button class="link" data-update="log">查看检查日志</button></div><div class="note">普通更新可以忽略；网站标记强制更新或最低支持版本高于当前版本时，需更新后才能继续使用。下载后校验 SHA256；请退出客户端、解压替换旧版并重启。更新日志由网站清单提供。</div>`;
''',1)
s=s.replace('panel.innerHTML=tabContent();','panel.innerHTML=tabContent();renderUpdatePanel();',1)
s=s.replace('<div class="brand">Bili <b>Space</b></div>','<div class="brand">Bili-<b>Space</b></div>')
s=s.replace('<b>Better Bili Space</b>0.1.33','<b>Bili-Space</b>${APP_META.version}')
s=s.replace("const b=e.target.closest('button');","const b=e.target.closest('button');\n    if(b?.dataset.update){native('updates',{action:b.dataset.update});return;}",1)
s=s.replace('window.BiliSpace={videoLinkCopied','window.BiliSpace={acceptUpdateStatus,videoLinkCopied',1)
s=s.replace('  loadOfficialSearchHistory();','  native(\'updates\',{action:\'status\'});\n  loadOfficialSearchHistory();')
# visible, unobtrusive update indicator
s=s.replace('const tabs={',"const updateStyle=document.createElement('style');updateStyle.textContent='';\nconst tabs={",1) if False else s
# insert CSS into shellCss template by using existing footer selector? append through shadow after HTML
s=s.replace('  document.documentElement.append(root);',"  const updateCss=document.createElement('style');updateCss.textContent='#settings-trigger[data-update=true]::after{content: \"\";position:absolute;right:7px;top:7px;width:7px;height:7px;border-radius:50%;background:#fb7299}#update-notes{padding-left:20px;line-height:1.9;overflow-wrap:anywhere;max-height:220px;overflow:auto}';shadow.append(updateCss);\n  document.documentElement.append(root);",1)
p.write_text(s,encoding='utf8',newline='\n')
p=r/'tests/ui-harness.cjs';s=p.read_text();s=s.replace('const INITIAL=${JSON.stringify','const APP_INFO=${JSON.stringify(JSON.parse(fs.readFileSync(\'assets/app-info.json\',\'utf8\')))};const INITIAL=${JSON.stringify',1);p.write_text(s,encoding='utf8',newline='\n')
