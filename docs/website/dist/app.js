import {RELEASE_PAGE, fetchLatest, cacheRecord, readCache} from './release.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const hero = document.querySelector('[data-parallax="hero"]');
const heroSection = document.querySelector('.hero');
const focus = document.querySelector('.focus-section');
const player = document.querySelector('.focus-player');
const pip = document.querySelector('.pip-window');
const farWord = document.querySelector('.focus-word');
const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
let scheduled = false;
function drawScroll() {
  scheduled = false;
  if (reduced.matches || mobile.matches) {
    for (const element of [hero,player,pip,farWord]) { element.style.removeProperty('transform'); element.style.removeProperty('opacity'); }
    return;
  }
  // Native scroll is never prevented or replaced. Read rectangles once, then write.
  const heroRect = heroSection.getBoundingClientRect();
  const focusRect = focus.getBoundingClientRect();
  const h = innerHeight;
  const hp = clamp(-heroRect.top / heroRect.height);
  const progress = clamp((78-focusRect.top) / Math.max(1,focusRect.height-h+78));
  farWord.style.transform = `translate3d(0,${progress*42}px,0)`;
  hero.style.transform = `translate3d(40px,${30-hp*95}px,0) rotate(${-2+hp*2}deg)`;
  player.style.transform = `translate3d(${-progress*95}px,${35-progress*35}px,0) scale(${1-progress*.08})`;
  player.style.opacity = String(1-progress*.64);
  const reveal = clamp((progress-.12)/.55);
  pip.style.transform = `translate3d(${50-reveal*50}px,${85-reveal*85}px,0)`;
  pip.style.opacity = String(reveal);
}
function requestDraw(){ if (!scheduled) {scheduled=true;requestAnimationFrame(drawScroll);} }
addEventListener('scroll',requestDraw,{passive:true});
addEventListener('resize',requestDraw,{passive:true});
reduced.addEventListener('change',requestDraw);mobile.addEventListener('change',requestDraw);
drawScroll();

if ('IntersectionObserver' in window && !reduced.matches) {
  document.documentElement.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
  },{rootMargin:'0px 0px -25px 0px',threshold:.08});
  document.querySelectorAll('.reveal').forEach(element=>observer.observe(element));
}

const stage = document.querySelector('.theme-stage');
const themeCaption = document.querySelector('#theme-caption');
document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', event => {
  const dark = button.dataset.theme === 'dark';
  // Keyboard state changes are immediate; pointer previews have a small crossfade.
  stage.querySelectorAll('img').forEach(img=>img.style.transitionDuration=event.detail===0?'0ms':'220ms');
  stage.classList.toggle('is-dark',dark);
  document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  stage.querySelector('.theme-light').setAttribute('aria-hidden',String(dark));
  stage.querySelector('.theme-dark').setAttribute('aria-hidden',String(!dark));
  themeCaption.textContent = dark ? '入夜，也很舒服。' : '日间，清清爽爽。';
}));

const CACHE_KEY='bili-space:latest-setup:v1';
const status=document.querySelector('#release-status');
function showInstaller(installer, stale=false) {
  for (const link of document.querySelectorAll('[data-download]')) {
    link.href=installer.url;
    link.setAttribute('aria-label',`下载 Bili-Space ${installer.version} Windows x64 安装版`);
  }
  document.querySelectorAll('[data-download-label]').forEach(el=>el.textContent='下载 Windows 版');
  document.querySelectorAll('[data-version]').forEach(el=>el.textContent=installer.version);
  document.querySelector('[data-package]').textContent=`Setup 安装版${installer.size ? ' · '+(installer.size/1024/1024).toFixed(1)+' MB' : ''}`;
  status.textContent=stale?'暂时无法检查更新，当前为 24 小时内缓存版本。也可查看下方 Release。':'来自 GitHub 最新正式 Release · 安装需要 WebView2 Runtime。';
  document.documentElement.dataset.releaseState=stale?'cached':'live';
}
async function updateDownload() {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),6500);
  try {
    const {release,installer}=await fetchLatest(fetch,controller.signal);
    if (!installer) {
      document.querySelectorAll('[data-download]').forEach(a=>{a.href=RELEASE_PAGE;a.setAttribute('aria-label','前往 GitHub Release 选择下载版本');});
      document.querySelectorAll('[data-download-label]').forEach(el=>el.textContent='查看下载版本');
      status.textContent='最新正式版暂无 x64 Setup 安装包，请在 Release 页面选择下载。';
      document.documentElement.dataset.releaseState='no-installer';return;
    }
    showInstaller(installer);
    try {localStorage.setItem(CACHE_KEY,JSON.stringify(cacheRecord(release)));} catch {}
  } catch {
    let cached=null;try{cached=readCache(localStorage.getItem(CACHE_KEY));}catch{}
    if (cached) showInstaller(cached,true);
    else {
      status.textContent='暂时无法获取最新安装包，下载按钮将带你前往 GitHub Release。';
      document.documentElement.dataset.releaseState='fallback';
    }
  } finally {clearTimeout(timeout);}
}
updateDownload();
