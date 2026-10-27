const test=require('node:test'),assert=require('node:assert/strict'),{app}=require('./ui-harness.cjs');
test('first ArrowUp selects the last official history item, then wraps correctly',async()=>{
 const a=app({source:process.env.HOTFIX_UI||'assets/enhance.js',officialHistory:['one','two','three'].map(value=>({value,timestamp:1}))});
 try{const s=a.w.document.querySelector('#bili-space-root').shadowRoot,input=s.querySelector('.search input');input.focus();await new Promise(r=>setTimeout(r,40));
 const key=k=>input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,composed:true}));
 key('ArrowUp');assert.equal(s.querySelector('#'+input.getAttribute('aria-activedescendant')).dataset.query,'three');key('ArrowDown');assert.equal(s.querySelector('#'+input.getAttribute('aria-activedescendant')).dataset.query,'one');
 }finally{a.close();}
});
