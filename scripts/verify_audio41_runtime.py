"""Measure generated tones through real WebAudio; final output is muted, no user media/profile."""
import asyncio,ctypes,json,subprocess,urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from smoke import CDP
R=Path(__file__).resolve().parents[1];V=R/'verification'
async def main():
 config=R/'dist/.appdata/settings.json';saved=config.read_bytes() if config.exists() else None
 p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist');result={}
 try:
  for _ in range(100):
   try:
    pages=json.load(urllib.request.urlopen('http://127.0.0.1:9223/json/list',timeout=1));target=next(x for x in pages if 'bili-space.local' in x.get('url',''));break
   except Exception:await asyncio.sleep(.2)
  async with connect(target['webSocketDebuggerUrl'],max_size=20*1024*1024) as ws:
   c=CDP(ws);await c.call('Runtime.enable');await c.call('Page.enable')
   for _ in range(100):
    if await c.js('Boolean(window.BiliSpace?.state.soundBalance)'):break
    await asyncio.sleep(.2)
   result['setup']=await c.js(r'''(async()=>{
    document.querySelectorAll('video,audio').forEach(v=>{v.pause();v.remove()});
    const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(target,...args){if(target instanceof AudioDestinationNode){const analyser=this.context.createAnalyser(),mute=this.context.createGain();analyser.fftSize=2048;mute.gain.value=0;connect.call(this,analyser);connect.call(analyser,mute);connect.call(mute,target);window.__out=analyser;return target;}return connect.call(this,target,...args);};
    window.makeTone=a=>{const n=48000*2,b=new ArrayBuffer(44+n*2),d=new DataView(b);const str=(at,s)=>[...s].forEach((c,i)=>d.setUint8(at+i,c.charCodeAt()));str(0,'RIFF');d.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,48000,true);d.setUint32(28,96000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,n*2,true);for(let i=0;i<n;i++)d.setInt16(44+i*2,Math.sin(i*440*2*Math.PI/48000)*a*32767,true);return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));};
    window.__tone=document.createElement('video');__tone.loop=true;__tone.muted=true;__tone.volume=1;__tone.src=makeTone(.5);document.querySelector('.bpx-player-video-wrap').append(__tone);await new Promise(r=>__tone.addEventListener('loadedmetadata',r,{once:true}));BiliSpace.update({soundBalance:true,volumeBoost:100});return {src:__tone.src};})()''')
   for _ in range(30):
    if await c.js("document.querySelector('video').dataset.bsBalance==='active'&&!!window.__out"):break
    await asyncio.sleep(.1)
   await c.js('__tone.muted=false;__tone.play()');await asyncio.sleep(.3)
   measure="(()=>{const a=new Float32Array(__out.fftSize);__out.getFloatTimeDomainData(a);return {rms:Math.sqrt(a.reduce((n,v)=>n+v*v,0)/a.length),balance:BiliSpace.state.soundBalance,mediaVolume:__tone.volume};})()"
   await c.js('BiliSpace.update({soundBalance:false})');await asyncio.sleep(.8);result['raw_loud']=await c.js(measure)
   await c.js('BiliSpace.update({soundBalance:true})');await asyncio.sleep(2.5);result['balanced_loud']=await c.js(measure)
   await c.js('__tone.src=makeTone(.05);__tone.play()');await asyncio.sleep(3.5);result['balanced_quiet']=await c.js(measure)
   await c.js('BiliSpace.update({soundBalance:false})');await asyncio.sleep(.8);result['raw_quiet']=await c.js(measure)
   await c.js('BiliSpace.update({soundBalance:true})');await asyncio.sleep(2.5);result['quiet_full_volume']=await c.js(measure)
   await c.js('__tone.volume=.25');await asyncio.sleep(2.5);result['manual_quarter_volume']=await c.js(measure)
   assert result['raw_loud']['rms']>0 and result['raw_quiet']['rms']>0,result
   raw=result['raw_loud']['rms']/result['raw_quiet']['rms'];balanced=max(result['balanced_loud']['rms'],result['balanced_quiet']['rms'])/min(result['balanced_loud']['rms'],result['balanced_quiet']['rms'])
   result['ratios']={'before':raw,'after':balanced,'manual_volume_ratio':result['manual_quarter_volume']['rms']/result['quiet_full_volume']['rms']}
   assert raw>8 and balanced<raw/2,result
   assert result['ratios']['manual_volume_ratio']<.6,result
   assert result['balanced_quiet']['balance']['gainDb']>0 and result['balanced_loud']['balance']['gainDb']<0,result
   await c.js("BiliSpace.acceptUpdateStatus({available:true,prompt:true,version:'0.1.99',changelog:['测试更新提示']})")
   result['popup']=await c.js("!!document.querySelector('#bili-space-root').shadowRoot.querySelector('[role=alertdialog]')");assert result['popup']
   await c.shot('audio41-update-popup-native.png')
   result['runtime_exceptions']=[e for e in c.events if e.get('method')=='Runtime.exceptionThrown'];assert not result['runtime_exceptions']
 finally:
  user=ctypes.windll.user32;callback=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
  def close(hwnd,_):
   pid=ctypes.c_ulong();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
   if pid.value==p.pid:user.PostMessageW(hwnd,0x10,0,0)
   return True
  user.EnumWindows(callback(close),0);p.wait(timeout=15)
  if saved is not None:config.write_bytes(saved)
  (V/'audio41-runtime.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=True))
asyncio.run(main())
