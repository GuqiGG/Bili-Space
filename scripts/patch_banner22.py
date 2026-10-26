from pathlib import Path
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8');idx=s.index('const OFFICIAL_SPACE_BANNERS=')
s=s[:idx]+'''function profileMd5(text){
  const bytes=new TextEncoder().encode(text),size=(((bytes.length+8)>>>6)+1)*64,buffer=new Uint8Array(size);buffer.set(bytes);buffer[bytes.length]=128;const view=new DataView(buffer.buffer);view.setUint32(size-8,bytes.length*8,true);view.setUint32(size-4,Math.floor(bytes.length/536870912),true);let a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476;const shifts=[[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]];
  for(let offset=0;offset<size;offset+=64){let A=a,B=b,C=c,D=d;for(let i=0;i<64;i++){let f,g;if(i<16){f=(B&C)|(~B&D);g=i;}else if(i<32){f=(D&B)|(~D&C);g=(5*i+1)%16;}else if(i<48){f=B^C^D;g=(3*i+5)%16;}else{f=C^(B|~D);g=(7*i)%16;}const n=(A+f+(Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0)+view.getUint32(offset+g*4,true))|0,r=shifts[i>>>4][i%4],old=D;D=C;C=B;B=(B+((n<<r)|(n>>>(32-r))))|0;A=old;}a=(a+A)|0;b=(b+B)|0;c=(c+C)|0;d=(d+D)|0;}
  const result=new DataView(new ArrayBuffer(16));[a,b,c,d].forEach((n,i)=>result.setInt32(i*4,n,true));return [...new Uint8Array(result.buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function ownSpaceInfoPath(profile){const keys=profile.wbi;if(!keys?.img_url||!keys?.sub_url)return '';try{const raw=[keys.img_url,keys.sub_url].map(x=>new URL(x).pathname.split('/').pop().split('.')[0]).join(''),order=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];if(raw.length!==64)return '';const key=order.map(i=>raw[i]).join('').slice(0,32),params={mid:String(profile.mid),platform:'web',web_location:'1550101',wts:String(Math.floor(Date.now()/1000))},query=Object.keys(params).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(params[k].replace(/[!'()*]/g,''))).join('&');return '/x/space/wbi/acc/info?'+query+'&w_rid='+profileMd5(query+key);}catch{return '';}}
''' +s[idx:]
s=s.replace("Date.now()-accountStatsAt<60000)return;", "Date.now()-accountStatsAt<(accountProfile.banner?60000:5000))return;",1)
s=s.replace("get('/x/space/v2/myinfo')]).then(([stats,up,info,card,space])=>{", "get('/x/space/v2/myinfo'),ownSpaceInfoPath(current)?get(ownSpaceInfoPath(current)):Promise.resolve(null)]).then(([stats,up,info,card,space,official])=>{",1)
s=s.replace("mergeAccountDecorations({...space,...info,top_photo_v2:info?.top_photo_v2||space?.toutu,theme:info?.theme||space?.theme},card||{});", "mergeAccountDecorations({...space,...info,...official,top_photo_v2:official?.top_photo_v2||info?.top_photo_v2||space?.toutu,theme:official?.theme||info?.theme||space?.theme},card||{});",1)
s=s.replace("face:profileMediaUrl(data.face),vip:", "face:profileMediaUrl(data.face),wbi:data.wbi_img||accountProfile.wbi,vip:",1)
s=s.replace("'数据来自 B站；未获取的项目显示 —'", "'数据来自 B站；未获取的项目显示 —'+(!accountProfile.banner?'；主页横幅暂未获取':'')",1)
p.write_text(s,encoding='utf8')
for name in ['package.json','package-lock.json','assets/bridge.js','assets/enhance.js','CMakeLists.txt']:
 p=Path(name);p.write_text(p.read_text(encoding='utf8').replace('0.1.21','0.1.22'),encoding='utf8')
