const fs=require('node:fs');
const {app}=require('./ui-harness.cjs');
const a=app({source:process.argv[2],html:fs.readFileSync('tests/fixtures/home-nested.html','utf8'),config:{showChannels:false}}),d=a.w.document,s=d.querySelector('#bili-space-root').shadowRoot;
const b=d.querySelector('.bili-header__banner');
const report={bannerDisplay:a.w.getComputedStyle(b).display,bannerBrand:d.querySelector('.bs-banner-brand')?.textContent||null,headerBrand:s.querySelector('.brand').textContent,unifiedFeed:!!d.querySelector('[data-bs-feed="grid"]'),categoryTrigger:s.querySelector('.back').getAttribute('aria-controls'),categoryLabels:[...s.querySelectorAll('#header-categories a')].map(e=>e.textContent)};
const cpp=fs.readFileSync(process.argv[3]||'src/main.cpp','utf8');report.mangaNative=cpp.includes('L"https://manga.bilibili.com/"')&&cpp.includes("'manga.bilibili.com'].includes")&&cpp.includes('L"manga.bilibili.com"');
s.querySelector('.back').click();report.expanded=s.querySelector('.back').getAttribute('aria-expanded');report.nativeBack=a.messages.some(m=>m.type==='window'&&m.action==='back');
console.log(JSON.stringify(report));a.close();
