const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {app}=require('./ui-harness.cjs');
test('clipboard targets accept videos and reject lookalikes, scripts and oversized input',()=>{
 const a=app();try{const parse=a.w.BiliSpace.clipboardVideoTarget;
 assert.equal(parse('BV1cjHK6GEJE'),'https://www.bilibili.com/video/BV1cjHK6GEJE');
 assert.equal(parse('分享 https://www.bilibili.com/video/BV1cjHK6GEJE?t=4.4&spm_id=x'),'https://www.bilibili.com/video/BV1cjHK6GEJE?t=4.4');
 assert.equal(parse('https://b23.tv/AbC123'),'https://b23.tv/AbC123');
 for(const text of ['https://evilbilibili.com/video/BV1cjHK6GEJE','https://evil.com/BV1cjHK6GEJE','https://b23.tv.evil.com/abc','https://user@b23.tv/abc','javascript:alert(1)','BV1cjHK6GEJEx','x'.repeat(16385)])assert.equal(parse(text),null,text);
 }finally{a.close();}
});
test('clipboard prompt requires confirmation, replaces stale links and honors disabled preference',()=>{
 const a=app();try{const api=a.w.BiliSpace,s=a.w.document.querySelector('#bili-space-root').shadowRoot,before=a.w.location.href;
 assert(api.offerClipboardVideo('BV1cjHK6GEJE'));assert.equal(a.w.location.href,before);assert.equal(s.querySelectorAll('#clipboard-video-prompt').length,1);
 api.offerClipboardVideo('https://b23.tv/new123');assert.equal(s.querySelector('#clipboard-video-prompt').dataset.url,'https://b23.tv/new123');
 s.querySelector('[data-dismiss]').click();assert(!s.querySelector('#clipboard-video-prompt'));
 api.offerClipboardVideo('BV1cjHK6GEJE');api.update({clipboardAutoOpen:false});assert(!s.querySelector('#clipboard-video-prompt'));assert.equal(api.offerClipboardVideo('BV1cjHK6GEJE'),false);
 const native=fs.readFileSync('src/main.cpp','utf8').split('void checkClipboardVideo(){')[1].split('// Restore native')[0];assert.match(native,/offerClipboardVideo/);assert(!native.includes('Navigate('));
 }finally{a.close();}
});
test('frost is opt-in, follows theme/accent and can be disabled without changing other preferences',()=>{
 const a=app();try{const api=a.w.BiliSpace,root=a.w.document.querySelector('#bili-space-root');assert.equal(root.dataset.frost,'false');api.update({experimentalFrost:true,theme:'light',accent:'#47aabb'});
 assert.equal(root.dataset.frost,'true');assert.equal(root.dataset.theme,'light');assert.equal(root.style.getPropertyValue('--accent'),'#47aabb');assert.equal(a.w.document.documentElement.dataset.bsFrost,'true');
 api.update({experimentalFrost:false});assert.equal(root.dataset.frost,'false');assert.equal(api.state.prefs.accent,'#47aabb');
 }finally{a.close();}
});
