from pathlib import Path
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8');s=s.replace("const watchedLoadingVideos=new WeakSet(),videoLoadingEvents=[];", "const watchedLoadingVideos=new WeakSet(),videoLoadingEvents=[],loadingAutoplay=new WeakMap();")
a=s.index("  recordVideoLoading('enter');layer=document.createElement('div');");b=s.index('\n}',a)
s=s[:a]+"  recordVideoLoading('enter');layer=document.createElement('div');layer.id='bs-video-loading';layer.dataset.key=key;layer.setAttribute('role','status');layer.setAttribute('aria-live','polite');layer.innerHTML='<div>'+ICON_TV+'<p>正在打开视频…</p></div>';document.documentElement.append(layer);"+s[b:]
a=s.index('function settleVideoLoading(');b=s.index('\nfunction setLoading(',a)
s=s[:a]+'''function autoplayLoadingVideo(video,layer){
  if(!video||video.readyState<1||!video.paused||video.ended||video.error)return;
  let state=loadingAutoplay.get(video);if(!state||state.key!==layer.dataset.key){state={key:layer.dataset.key,attempts:0,last:-Infinity,pending:false};loadingAutoplay.set(video,state);}
  if(state.pending||state.attempts>=3||performance.now()-state.last<750)return;
  state.attempts++;state.last=performance.now();state.pending=true;video.autoplay=true;
  try{Promise.resolve(video.play()).catch(error=>{state.error=error?.name||'PlaybackError';}).finally(()=>state.pending=false);}catch(error){state.error=error?.name||'PlaybackError';state.pending=false;}
}
function settleVideoLoading(failed=false){
  const layer=$('#bs-video-loading');if(!layer)return;if(failed){toast('页面加载失败，请检查网络后重试。');finishVideoLoading();return;}
  if(layer.dataset.waiting)return;layer.dataset.waiting='true';const start=performance.now();
  const wait=()=>{
    if($('#bs-video-loading')!==layer||layer.classList.contains('leaving'))return;if(layer.dataset.key!==videoLoadingKey()){videoWaitTimer=setTimeout(wait,100);return;}const video=$('video');
    autoplayLoadingVideo(video,layer);
    if(video?.readyState>=2&&!video.paused){
      layer.dataset.frameWaiting='true';const shown=()=>{if($('#bs-video-loading')===layer&&video.readyState>=2&&!video.paused)finishVideoLoading();else{delete layer.dataset.frameWaiting;videoWaitTimer=setTimeout(wait,100);}};
      if(video.requestVideoFrameCallback){loadFrameOwner=video;loadFrameHandle=video.requestVideoFrameCallback(shown);videoWaitTimer=setTimeout(shown,300);}else requestAnimationFrame(shown);return;
    }
    if(video?.error||performance.now()-start>12000){toast('视频暂时无法自动播放，请检查网络或原生播放器提示。');finishVideoLoading();return;}
    $('p',layer).textContent=video?.readyState>=1?'正在自动播放…':'正在加载视频…';
    videoWaitTimer=setTimeout(wait,100);
  };wait();
}
''' +s[b:]
s=s.replace("#bs-video-loading button{color:inherit;background:transparent;border:1px solid #8886;border-radius:8px;padding:6px 12px;cursor:pointer}#bs-video-loading[data-await-play=true] svg{animation-play-state:paused}#bs-video-loading button[hidden]{display:none}", "")
p.write_text(s,encoding='utf8')
p=Path('src/main.cpp');s=p.read_text(encoding='utf8').replace('    if(proxyEnabled)browserArgs+=', '    browserArgs+=L" --autoplay-policy=no-user-gesture-required";\n    if(proxyEnabled)browserArgs+=',1);p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.18','0.1.19'),encoding='utf8')
p=Path('tests/polish16.test.cjs');s=p.read_text(encoding='utf8').replace("video loader waits for renderable frames and retains an explicit escape hatch", "video loader waits for renderable frames and autoplays without overlay buttons").replace("assert.match(s,/bs-load-dismiss/);assert.match(s,/delete layer.dataset.waiting/);", "assert.doesNotMatch(s,/bs-load-dismiss|bs-load-play/);assert.match(s,/autoplayLoadingVideo/);");p.write_text(s,encoding='utf8')
