from pathlib import Path
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8');idx=s.index('let audioContext,audioVideo;')
s=s[:idx]+'''let volumeDrag=null;const volumeWatched=new WeakSet();
function playerVolumePercent(){const video=$('video');return video?Math.round((video.muted?0:video.volume)*Math.max(1,Math.min(2,Number(PREFS.volumeBoost||100)/100))*100):0;}
function syncNativeVolume(){
  const host=$('.bpx-player-ctrl-volume');if(!host)return;const percent=playerVolumePercent(),number=$('.bpx-player-ctrl-volume-number',host),track=$('.bui-track',host),bar=$('.bui-bar-normal',host),thumb=$('.bui-thumb',host);host.dataset.bsMaxVolume='200';if(number&&number.textContent!==String(percent))number.textContent=String(percent);
  if(track){track.setAttribute('role','slider');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','200');track.setAttribute('aria-valuenow',String(percent));track.setAttribute('aria-label','音量，最高200%');const height=track.getBoundingClientRect().height||48,ratio=percent/200;const fill='scaleY('+ratio+')',pos='translateY('+(-height*ratio)+'px)';if(bar&&bar.style.transform!==fill)bar.style.transform=fill;if(thumb&&thumb.style.transform!==pos)thumb.style.transform=pos;}
}
function setPlayerVolume(percent,persist=false){
  const video=$('video');if(!video)return;percent=Math.max(0,Math.min(200,Math.round(Number(percent)||0)));PREFS.volumeBoost=Math.max(100,percent);video.volume=Math.min(1,percent/100);video.muted=percent===0;applyAudioBoost();syncNativeVolume();if(persist)update({volumeBoost:PREFS.volumeBoost});
}
function installPlayerInteractions(){
  document.addEventListener('click',e=>{const button=e.target.closest?.('.bpx-player-ctrl-pip,.bilibili-player-video-btn-pip');if(!button||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();requestPip();},true);
  const change=e=>{const track=volumeDrag?.track;if(!track)return;const rect=track.getBoundingClientRect();if(rect.height>0)setPlayerVolume((rect.bottom-e.clientY)/rect.height*200);};
  document.addEventListener('pointerdown',e=>{const slider=e.target.closest?.('.bpx-player-ctrl-volume-progress');if(!slider||e.button!==0)return;const track=$('.bui-track',slider)||slider;e.preventDefault();e.stopImmediatePropagation();volumeDrag={track,pointer:e.pointerId};track.setPointerCapture?.(e.pointerId);change(e);},true);
  document.addEventListener('pointermove',e=>{if(!volumeDrag||volumeDrag.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();change(e);},true);
  const end=e=>{if(!volumeDrag||volumeDrag.pointer!==e.pointerId)return;const track=volumeDrag.track;track.releasePointerCapture?.(e.pointerId);volumeDrag=null;update({volumeBoost:PREFS.volumeBoost});};document.addEventListener('pointerup',end,true);document.addEventListener('pointercancel',end,true);
  document.addEventListener('mousedown',e=>{if(e.target.closest?.('.bpx-player-ctrl-volume-progress')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('wheel',e=>{if(!e.target.closest?.('.bpx-player-ctrl-volume-progress')||e.ctrlKey)return;e.preventDefault();e.stopImmediatePropagation();setPlayerVolume(playerVolumePercent()+(e.deltaY<0?5:-5),true);},{capture:true,passive:false});
}
''' +s[idx:]
s=s.replace("  const video=$('video');if(!video)return;\n  const amount=Math.max(1", "  const video=$('video');if(!video)return;\n  if(!volumeWatched.has(video)){volumeWatched.add(video);video.addEventListener('volumechange',()=>{if(Number(PREFS.volumeBoost)>100&&video.volume<.999){PREFS.volumeBoost=100;const graph=audioGraphs.get(video);if(graph)graph.gain.gain.value=1;}syncNativeVolume();});}syncNativeVolume();\n  const amount=Math.max(1",1)
s=s.replace("  prepareShell();installWheelInertia();", "  prepareShell();installWheelInertia();installPlayerInteractions();",1)
s=s.replace("window.BiliSpace={acceptSearchHistory", "window.BiliSpace={setPlayerVolume,acceptSearchHistory",1)
s=s.replace("  native('window',{action:'pip'});\n}\nfunction syncPlayerAppearance", "  const enter=()=>native('window',{action:'pip'});if(document.fullscreenElement)document.exitFullscreen().then(enter).catch(()=>toast('请先退出全屏后进入画中画'));else enter();\n}\nfunction syncPlayerAppearance",1)
p.write_text(s,encoding='utf8')
p=Path('src/main.cpp');s=p.read_text(encoding='utf8').replace('void togglePip(bool on){','void toggleFull(bool on);\nvoid togglePip(bool on){',1).replace('if(on){if(full)return;GetWindowRect(windowHandle,&savedRect);','if(on){if(full)toggleFull(false);GetWindowRect(windowHandle,&savedRect);',1);p.write_text(s,encoding='utf8')
