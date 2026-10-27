const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{app}=require('./ui-harness.cjs');
test('verified update offers in-app installation, not an external folder',()=>{
 const a=app();try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot;s.querySelector('[data-tab=about]').click();
 a.w.BiliSpace.acceptUpdateStatus({available:true,ready:true,changelog:['安装并重启'],version:'0.1.39'});
 assert.equal(s.querySelector('[data-update=install]').hidden,false);assert.equal(s.querySelector('[data-update=open-folder]'),null);
 s.querySelector('[data-update=install]').click();assert.ok(a.messages.some(m=>m.type==='updates'&&m.action==='install'));
 a.w.BiliSpace.acceptUpdateStatus({available:true,ready:true,busy:true});assert.equal(s.querySelector('[data-update=install]').disabled,true);
 assert.doesNotMatch(s.querySelector('#settings').textContent,/解压替换/);
 }finally{a.close();}
});
test('mandatory screen supports installation without offering ignore',()=>{
 const {JSDOM}=require('jsdom'),d=new JSDOM(fs.readFileSync('assets/update-required.html','utf8'),{runScripts:'dangerously'});
 try{d.window.renderUpdate({ready:true,busy:false,version:'0.1.39',changelog:[]});assert.equal(d.window.document.querySelector('[data-action=install]').hidden,false);assert.equal(d.window.document.querySelector('[data-action=ignore]'),null);d.window.renderUpdate({ready:true,busy:true,changelog:[]});assert.equal(d.window.document.querySelector('[data-action=install]').disabled,true);}finally{d.window.close();}
});
test('installer helper waits for the app, verifies twice, and keeps user data',()=>{
 const s=fs.readFileSync('src/update_install.hpp','utf8');assert.match(s,/WaitForSingleObject\(parent,60000\)/);assert.match(s,/updateFileHash\(package\)/);
 assert.match(s,/VERYSILENT/);assert.match(s,/metadata.at\("version"\)!=job.at\("version"\)/);assert.match(s,/install-result.json/);assert.doesNotMatch(s,/remove_all|settings\.json|WebView2\//);
 assert.match(fs.readFileSync('src/main.cpp','utf8'),/runUpdateWorker\(command\)/);
});
