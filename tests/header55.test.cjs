const test=require('node:test'),assert=require('node:assert/strict'),{app}=require('./ui-harness.cjs');

test('the current nav item carries a refresh icon and label without changing its text',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,home=s.querySelector('.primary-nav a[data-route=home]'),dynamic=s.querySelector('.primary-nav a[data-route=dynamic]');
  assert.equal(home.textContent,'首页');assert(home.querySelector('.route-text'));assert(home.querySelector('svg.route-refresh'));
  assert.equal(home.getAttribute('aria-current'),'page');assert.equal(home.getAttribute('aria-label'),'刷新首页');assert.equal(dynamic.getAttribute('aria-label'),null);
  const css=s.querySelector('style').textContent;assert.match(css,/@media\(hover:hover\)\{\.primary-nav a\[aria-current=page\]:hover \.route-text\{opacity:0/);
 }finally{a.close();}
});

test('a restored brand state that already matches keeps the logo visible',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,slot=s.querySelector('.brand-slot'),label=s.querySelector('.brand-label');
  slot.hidden=true;label.hidden=true;a.w.BiliSpace.update({headerBrand:true});assert.equal(slot.hidden,false);assert.equal(label.hidden,false);
 }finally{a.close();}
});

test('header motion decided before the page is revealed waits on its first frame',()=>{
 const fs=require('node:fs'),js=fs.readFileSync('assets/enhance.js','utf8');
 assert.match(js,/function holdForReveal\(m\)\{if\(typeof RUNTIME!=='undefined'&&!headerSurfaceReady&&m\?\.pause\)\{m\.pause\(\);revealMotion\.push\(m\);\}return m;\}/);
 assert.match(js,/const held=revealMotion\.splice\(0\);held\.forEach\(m=>\{try\{m\.play\(\);\}catch\{\}\}\);/);
 for(const site of ['brandMotion=[size,text].map(holdForReveal)','categoryMotion=[size,icon].map(holdForReveal)','const size=holdForReveal(group.animate('])assert(js.includes(site),site);
});
