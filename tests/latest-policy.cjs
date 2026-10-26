const {app}=require('./ui-harness.cjs');
const fs=require('fs');const path=process.argv[2]||'assets/enhance.js';
const a=app({source:path}),w=a.w,s=w.document.querySelector('#bili-space-root').shadowRoot;
const before=[...s.querySelectorAll('#header-categories a:not([hidden])')].length;
w.BiliSpace.update({categorySelection:[0,2,5]});
const names=[...s.querySelectorAll('#header-categories a:not([hidden])')].map(a=>a.textContent);
console.log(JSON.stringify({categoriesBefore:before,categoriesAfter:names,centeredChevron:!!s.querySelector('.back svg'),categorySettings:!!s.querySelector('[data-tab=categories]'),networkSettings:!!s.querySelector('[data-tab=network]'),localAI:fs.readFileSync(path,'utf8').includes('class AIScaler'),adaptiveZoom:w.BiliSpace.state.prefs.autoZoom??false,hiddenScrollbar:fs.readFileSync(path,'utf8').includes('scrollbar-width:none!important}html::-webkit-scrollbar'),wheelInertia:fs.readFileSync(path,'utf8').includes('function installWheelInertia')}));a.close();
