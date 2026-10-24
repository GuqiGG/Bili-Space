const fs=require('node:fs'),{app}=require('./ui-harness.cjs');
const source=process.argv[2],html=fs.readFileSync('tests/fixtures/client-polish.html','utf8');
const a=app({source,html}),d=a.w.document,s=d.querySelector('#bili-space-root').shadowRoot;
const ad=d.querySelector('.recommended-swipe'),trigger=s.querySelector('.back');trigger.click();
const report={promotionDisplay:a.w.getComputedStyle(ad).display,promotionFlattened:ad.dataset.bsFeed==='wrapper',navHidden:s.querySelector('nav').hidden,categoryFont:s.querySelector('style').textContent.match(/\.category-links a\{[^}]*font-size:([^;]+)/)?.[1]||null,prefetchMargin:d.querySelector('[data-bs-feed=grid]')?.dataset.bsPrefetch||null,bannerMotionLayers:d.querySelectorAll('.animated-banner .layer').length};a.close();
const m=app({source,html,url:'https://message.bilibili.com/#/whisper'});report.messageBackground=m.w.getComputedStyle(m.w.document.querySelector('.message-bgc')).backgroundColor;report.messageRgb=m.w.getComputedStyle(m.w.document.documentElement).getPropertyValue('--bg1_rgb').trim();m.close();console.log(JSON.stringify(report));
