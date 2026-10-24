const {app}=require('./ui-harness.cjs');
async function main(){
 const source=process.argv[2];
 const history=app({source,url:'https://www.bilibili.com/account/history',loggedIn:true});
 await new Promise(r=>setTimeout(r,10));
 const hs=history.w.document.querySelector('#bili-space-root').shadowRoot;
 const search=app({source,url:'https://search.bilibili.com/all?keyword=%E8%8B%8F%E4%B8%B9',html:'<div id="app"><div class="search-header"><div class="search-input"><input placeholder="搜索"></div><div>综合 视频 用户</div></div><div class="search-content"><button class="vui_button">更多筛选</button></div></div>'});
 const ss=search.w.document.querySelector('#bili-space-root').shadowRoot;
 const home=app({source,config:{showChannels:false},html:'<div class="bili-feed4-layout"><div class="bili-header__channel"><div class="channel-container">频道</div></div><div class="recommended-container_floor-aside"><div class="container"><div class="recommended-swipe">推广</div><article class="bili-video-card">普通视频</article></div></div></div>'});
 const before=ss.querySelector('.search input').value;
 ss.querySelector('.search input').value='苏丹';ss.querySelector('form.search').dispatchEvent(new search.w.Event('submit',{bubbles:true,cancelable:true}));
 const result={
  activeHistory:hs.querySelector('nav a[aria-current="page"]')?.textContent||null,
  avatar:hs.querySelector('.account img')?.getAttribute('src')||null,
  messages:hs.querySelector('.messages')?.getAttribute('href')||null,
  lightsSvg:hs.querySelectorAll('.lights .light svg').length,
  query:before,
  siteSearch:search.w.getComputedStyle(search.w.document.querySelector('.search-input')).display,
  loading:ss.querySelector('form.search').getAttribute('aria-busy'),
  nativeSearch:search.messages.some(m=>m.type==='navigate'&&m.url.includes('keyword=')),
  channels:home.w.getComputedStyle(home.w.document.querySelector('.channel-container')).display,
  feedColumns:home.w.getComputedStyle(home.w.document.querySelector('.recommended-container_floor-aside>.container')).gridTemplateColumns,
  searchBackground:search.w.getComputedStyle(search.w.document.querySelector('.search-content')).backgroundColor
 };
 history.close();search.close();home.close();console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exit(1)});
