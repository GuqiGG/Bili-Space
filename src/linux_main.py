#!/usr/bin/env python3
"""Native GTK/WebKit host. Browser profiles stay in per-user WebKit data directories."""
import base64, hashlib, json, os, re, secrets, sys, uuid, threading, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import unquote, urlparse
from web_cache import WebCache, is_page
import gi
gi.require_version('Gtk','3.0')
gi.require_version('WebKit2','4.1')
gi.require_foreign('cairo')
from gi.repository import Gtk, Gdk, Gio, GLib, WebKit2, Soup

ALLOWED={'www.bilibili.com','search.bilibili.com','space.bilibili.com','t.bilibili.com','passport.bilibili.com','account.bilibili.com','message.bilibili.com','live.bilibili.com','manga.bilibili.com'}
def trusted(url):
    value=urlparse(url or '')
    return value.scheme=='https' and value.hostname in ALLOWED

class App(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='org.guqi.BiliSpace',flags=Gio.ApplicationFlags.NON_UNIQUE)
        self.testing='--self-test' in sys.argv
        self.resources=Path(os.environ.get('BILI_SPACE_RESOURCES',Path(__file__).resolve().parent))
        self.directory=Path(GLib.get_user_data_dir())/'bili-space'
        if self.testing:self.directory=Path(GLib.dir_make_tmp('bili-space-test-XXXXXX'))
        self.directory.mkdir(parents=True,exist_ok=True,mode=0o700);self.directory.chmod(0o700)
        self.state=self.read(self.directory/'state.json');defaults=self.read(self.resources/'defaults.json');defaults.update(self.state.get('config',{}));self.state['config']=defaults
        self.state.setdefault('gm',{});self.state.setdefault('profiles',[])
        self.category_visible=False;self.navigation_visible=0;self.header_route='';self.header_brand_shown=False;self.pending_add=None
        if self.state.get('pendingAccountID'):self.state['activeID']=self.state.pop('pendingAccountID')
        self.renderer=(self.resources/'renderer.js').read_text(encoding='utf-8');self.web=None;self.pending='';self.popups=[]
        self.frame_policy_seen=False;self.last_clipboard='';self.connect('activate',self.activate)
    @staticmethod
    def read(path):
        try:
            value=json.loads(path.read_text(encoding='utf-8'))
            return value if isinstance(value,dict) else {}
        except (OSError,ValueError):return {}
    def save(self):
        if self.testing:return
        temporary=self.directory/'state.tmp';temporary.write_text(json.dumps(self.state,ensure_ascii=False),encoding='utf-8');temporary.chmod(0o600);temporary.replace(self.directory/'state.json')
    def current(self):return next((p for p in self.state['profiles'] if p['id']==self.state.get('activeID')),None)
    def send(self,method,value):self.js('window.BiliSpace?.'+method+'('+json.dumps(value,ensure_ascii=False)+')')
    def js(self,source):
        if self.web:self.web.run_javascript(source,None,None,None)
    def navigation_state(self):self.js('window.__bsAcceptNavigationState?.('+json.dumps({'back':self.web.can_go_back(),'forward':self.web.can_go_forward(),'visible':self.navigation_visible,'categoryVisible':self.category_visible,'route':self.header_route})+')')
    def account_state(self,event='',message=''):
        items=[{key:p.get(key,'') for key in ['mid','uname','face']} for p in self.state['profiles'] if p.get('mid')]
        self.send('acceptAccountState',{'items':items,'active':(self.current() or {}).get('mid',''),'busy':False,'event':event,'message':message})
    def activate(self,*_):
        Gtk.Settings.get_default().set_property('gtk-application-prefer-dark-theme',self.state['config'].get('theme')=='dark')
        self.window=Gtk.ApplicationWindow(application=self);self.window.set_title('Bili-Space');self.window.set_default_size(1440,940)
        self.window.set_size_request(520,420);self.window.set_decorated(False)
        self.stack=Gtk.Box();self.window.add(self.stack)
        self.window.connect('focus-in-event',self.clipboard_focus)
        self.window.connect('delete-event',lambda *_:self.save() or False)
        self.open_profile(self.state.get('activeID'))
        self.window.show_all()
        if self.testing:GLib.timeout_add_seconds(45,self.test_timeout)
    def clipboard_focus(self,*_):
        if not self.testing and self.web and not self.web.is_loading() and self.state['config'].get('clipboardAutoOpen',True):
            Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).request_text(self.clipboard_text,None)
        return False
    def clipboard_text(self,clipboard,text,*_):
        if not self.state['config'].get('clipboardAutoOpen',True):return
        if text and len(text)<=16384 and re.search(r'BV[A-Za-z0-9]{10}|b23\.tv/',text,re.I):
            if text!=self.last_clipboard:self.send('offerClipboardVideo',text)
            self.last_clipboard=text
        else:self.last_clipboard=''
    def open_profile(self,identifier=None,event=''):
        if not identifier:identifier=str(uuid.uuid4())
        profile=next((p for p in self.state['profiles'] if p['id']==identifier),None)
        if profile is None:profile={'id':identifier};self.state['profiles'].append(profile)
        self.state['activeID']=identifier;self.pending=event;self.save();self.token=secrets.token_urlsafe(32)
        directory=self.directory/'profiles'/identifier;directory.mkdir(parents=True,exist_ok=True,mode=0o700);directory.chmod(0o700)
        manager=WebKit2.WebsiteDataManager(base_data_directory=str(directory/'data'),base_cache_directory=str(directory/'cache'))
        self.web_cache=WebCache(self.resources,directory);self.cached_loading=None
        self.context=WebKit2.WebContext.new_with_website_data_manager(manager)
        self.context.register_uri_scheme('bili-space',self.scheme,None)
        security=self.context.get_security_manager();security.register_uri_scheme_as_secure('bili-space');security.register_uri_scheme_as_cors_enabled('bili-space')
        self.cookies=self.context.get_cookie_manager();self.cookies.set_persistent_storage(str(directory/'cookies.sqlite'),WebKit2.CookiePersistentStorage.SQLITE)
        content=WebKit2.UserContentManager();content.register_script_message_handler('native');content.connect('script-message-received::native',self.message)
        payload={'appInfo':self.read(self.resources/'assets/app-info.json'),'config':self.state['config'],'gm':self.state['gm'],'runtime':{'platform':'linux','testing':self.testing,'running':False,'mediaFixtures':{name:base64.b64encode((self.resources/'assets/media-probe'/name).read_bytes()).decode() for name in ['avc-aac.mp4','avc-mse.mp4']} if self.testing else {}}}
        bridge="(()=>{if(window.top!==window)return;const token="+json.dumps(self.token)+";window.__BILI_NATIVE__="+json.dumps(payload,ensure_ascii=False)+";window.chrome=window.chrome||{};window.chrome.webview={postMessage:m=>window.webkit.messageHandlers.native.postMessage(JSON.stringify({token,message:m}))};})();\n"
        script=WebKit2.UserScript.new(bridge+self.renderer,WebKit2.UserContentInjectedFrames.TOP_FRAME,WebKit2.UserScriptInjectionTime.START,None,None);content.add_script(script)
        if self.web:self.stack.remove(self.web);self.web.destroy()
        self.web=WebKit2.WebView(web_context=self.context,user_content_manager=content)
        settings=self.web.get_settings();settings.set_enable_developer_extras(self.testing);settings.set_media_playback_requires_user_gesture(False);settings.set_enable_mediasource(True);settings.set_user_agent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 BiliSpace/0.1.59')
        self.web.add_events(Gdk.EventMask.BUTTON_PRESS_MASK|Gdk.EventMask.POINTER_MOTION_MASK)
        self.web.connect('button-press-event',self.resize_press);self.web.connect('motion-notify-event',self.resize_motion)
        self.web.connect('resource-load-started',self.resource_started)
        self.web.get_back_forward_list().connect('changed',lambda *_:self.navigation_state())
        self.web.connect('decide-policy',self.policy);self.web.connect('create',self.popup);self.web.connect('load-changed',self.loaded)
        self.stack.add(self.web);self.web.show();self.web.load_html((self.resources/'assets/fixture.html').read_text(encoding='utf-8').replace('</head>','<link rel="stylesheet" href="bili-space://assets/cache-probe.css"><script src="bili-space://assets/cache-probe.js"></script></head>'),'https://www.bilibili.com/') if self.testing else self.web.load_uri('https://www.bilibili.com/')
    def resize_edge(self,event):
        if self.window.is_maximized():return None
        w,h=self.window.get_size();x,y=event.x,event.y
        left,right,top,bottom=x<6,x>w-6,y<6,y>h-6
        name=('NORTH' if top else 'SOUTH' if bottom else '')+('_' if (top or bottom) and (left or right) else '')+('WEST' if left else 'EAST' if right else '')
        return getattr(Gdk.WindowEdge,name,None) if name else None
    def resize_press(self,web,event):
        edge=self.resize_edge(event)
        if event.button==1 and edge is not None:self.window.begin_resize_drag(edge,1,int(event.x_root),int(event.y_root),event.time);return True
        return False
    def resize_motion(self,web,event):
        edge=self.resize_edge(event);names={Gdk.WindowEdge.NORTH:'n-resize',Gdk.WindowEdge.SOUTH:'s-resize',Gdk.WindowEdge.EAST:'e-resize',Gdk.WindowEdge.WEST:'w-resize',Gdk.WindowEdge.NORTH_WEST:'nw-resize',Gdk.WindowEdge.NORTH_EAST:'ne-resize',Gdk.WindowEdge.SOUTH_WEST:'sw-resize',Gdk.WindowEdge.SOUTH_EAST:'se-resize'}
        if web.get_window():web.get_window().set_cursor(Gdk.Cursor.new_from_name(web.get_display(),names[edge]) if edge is not None else None)
        return False
    def scheme(self,request,*_):
        try:
            root=(self.resources/'assets').resolve();path=(root/unquote(urlparse(request.get_uri()).path).lstrip('/')).resolve();path.relative_to(root)
            if not path.exists() and unquote(urlparse(request.get_uri()).path).lstrip('/').startswith('web-copy/'):
                relative=unquote(urlparse(request.get_uri()).path).lstrip('/')[9:];host=relative.split('/')[0]
                if host.endswith('.hdslb.com') and re.search(r'\.(m?js|css|woff2?|ttf|wasm)$',relative):self.static_fallback(request,'https://'+relative);return
            data=path.read_bytes();mime={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png','.json':'application/json','.mp4':'video/mp4'}.get(path.suffix,'application/octet-stream')
            stream=Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data));response=WebKit2.URISchemeResponse.new(stream,len(data));response.set_content_type(mime)
            headers=Soup.MessageHeaders.new(Soup.MessageHeadersType.RESPONSE);headers.append('Access-Control-Allow-Origin','*');response.set_http_headers(headers);request.finish_with_response(response)
        except (OSError,ValueError) as error:request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(),str(error),Gio.IOErrorEnum.NOT_FOUND))
    def static_fallback(self,request,url):
        target=self.directory/'web-static'/(hashlib.sha256(url.encode()).hexdigest()+'.bin');mime='application/javascript' if re.search(r'\.m?js$',url) else 'text/css' if url.endswith('.css') else 'application/wasm' if url.endswith('.wasm') else 'font/woff2'
        def fetch():
            try:
                if target.exists():data=target.read_bytes()
                else:
                    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=12) as response:
                        if not urlparse(response.geturl()).hostname.endswith('.hdslb.com'):raise ValueError('invalid asset redirect')
                        data=response.read(8*1024*1024+1)
                    if len(data)>8*1024*1024:raise ValueError('asset too large')
                    target.parent.mkdir(exist_ok=True,mode=0o700);target.write_bytes(data)
                def finish():
                    try:
                        stream=Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data));response=WebKit2.URISchemeResponse.new(stream,len(data));response.set_content_type(mime);headers=Soup.MessageHeaders.new(Soup.MessageHeadersType.RESPONSE);headers.append('Access-Control-Allow-Origin','*');response.set_http_headers(headers);request.finish_with_response(response)
                    except GLib.Error:pass
                    return False
                GLib.idle_add(finish)
            except Exception:
                def failed():
                    try:request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(),'Asset unavailable',Gio.IOErrorEnum.NOT_FOUND))
                    except GLib.Error:pass
                    return False
                GLib.idle_add(failed)
        threading.Thread(target=fetch,daemon=True).start()
    def resource_started(self,web,resource,request):
        if not is_page(request.get_uri()):return
        cache=self.web_cache;from_cache=self.cached_loading==request.get_uri()
        def finished(resource):
            if from_cache:return
            def data_ready(resource,result,*_):
                try:
                    data=resource.get_data_finish(result)
                    if isinstance(data,tuple):data=data[0]
                    cache.store(resource.get_uri(),bytes(data))
                except (GLib.Error,OSError,TypeError,ValueError):pass
            resource.get_data(None,data_ready,None)
        resource.connect('finished',finished)
    def policy(self,web,decision,kind):
        if kind not in (WebKit2.PolicyDecisionType.NAVIGATION_ACTION,WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION):return False
        url=decision.get_request().get_uri();scheme=urlparse(url).scheme
        action=decision.get_navigation_action()
        if web is self.web and is_page(url) and self.cached_loading!=url and action.get_navigation_type()!=WebKit2.NavigationType.BACK_FORWARD:
            cached=self.web_cache.get(url)
            if cached:
                decision.ignore();self.cached_loading=url;GLib.idle_add(lambda:web.load_html(self.web_cache.offline(cached),url) or False);return True
        if self.testing and urlparse(url).hostname=='s1.hdslb.com':self.frame_policy_seen=True
        # This signal also covers cross-origin iframes, not just main-frame links.
        if scheme in ('https','about','blob','data') or (self.testing and scheme=='bili-space'):decision.use()
        else:
            decision.ignore()
        return True
    def popup(self,web,action):
        url=action.get_request().get_uri()
        if trusted(url) and urlparse(url).hostname!='passport.bilibili.com':self.web.load_uri(url);return None
        child=WebKit2.WebView(related_view=self.web,user_content_manager=WebKit2.UserContentManager());window=Gtk.Window(title='登录 · '+(urlparse(url).hostname or 'B站'));window.set_transient_for(self.window);window.set_default_size(760,720);window.add(child);self.popups.append(window)
        child.connect('decide-policy',self.policy);child.connect('create',self.popup);child.connect('ready-to-show',lambda *_:window.show_all());child.connect('close',lambda *_:window.destroy());return child
    def loaded(self,web,event):
        if web is not self.web:return
        if event!=WebKit2.LoadEvent.FINISHED:return
        self.cached_loading=None
        self.js('window.BiliSpace?.surfaceRevealed?.();window.BiliSpace?.setLoading(false)')
        if self.window.is_active():self.clipboard_focus()
        if self.testing:
            code="(()=>{const s=document.querySelector('#bili-space-root')?.shadowRoot;return window.__biliCachedScriptLoaded&&getComputedStyle(document.documentElement).getPropertyValue('--bili-cached-style-loaded').trim()==='yes'&&location.origin==='https://www.bilibili.com'&&!!window.BiliSpace&&!!s?.querySelector('.account-switch')&&s.querySelector('.lights').hidden&&!s.querySelector('.window-actions').hidden})()"
            def complete(view,result,*_):
                try:ok=view.run_javascript_finish(result).get_js_value().to_boolean()
                except GLib.Error:ok=False
                if not ok or self.window.get_decorated():print('Linux frameless renderer self-test: failed',flush=True);os._exit(1)
                web.run_javascript("(()=>{const f=document.createElement('iframe');f.hidden=true;f.src='https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html';document.body.append(f)})()",None,None,None)
                def frames_done():
                    ok=self.frame_policy_seen
                    if not ok:print('iframe regression failed',flush=True);os._exit(1)
                    def media_done(view,result,*_):
                        try:view.run_javascript_finish(result)
                        except GLib.Error as e:print('Linux media error',str(e),flush=True);os._exit(1)
                    web.run_javascript("void window.BiliMediaProbe.run().then(x=>chrome.webview.postMessage({type:'media-probe-result',ok:true,result:x})).catch(e=>chrome.webview.postMessage({type:'media-probe-result',ok:false,error:e.message}))",None,media_done,None)
                GLib.timeout_add_seconds(3,frames_done)
            web.run_javascript(code,None,complete,None)
    def test_timeout(self):print('Linux WebKit renderer self-test timed out',flush=True);os._exit(2)
    def message(self,content,result):
        try:
            wrapper=json.loads(result.get_js_value().to_string())
            if wrapper.get('token')!=self.token:return
            if not trusted(self.web.get_uri()) and not(self.testing and urlparse(self.web.get_uri()).scheme=='bili-space'):return
            m=wrapper['message'];kind=m.get('type');action=m.get('action')
            if kind=='config' and isinstance(m.get('value'),dict):self.state['config'].update(m['value']);self.save()
            elif kind=='navigation-state':
                if action=='visibility':self.navigation_visible=int(m.get('visible',0))&3
                elif action=='category-visibility':self.category_visible=bool(m.get('visible'))
                elif action=='route' and m.get('route') in ('home','dynamic','history','video','other'):self.header_route=m['route']
                else:self.navigation_state()
            elif kind=='header-brand':
                if action=='read':self.js('window.__bsAcceptBrandState?.('+json.dumps(self.header_brand_shown)+')')
                elif action=='write' and isinstance(m.get('shown'),bool):self.header_brand_shown=m['shown']
            elif kind=='gm-set':self.state['gm'][m['key']]=m.get('value');self.save()
            elif kind=='media-probe-result' and self.testing:print('Linux media decode self-test:',json.dumps(m),flush=True);os._exit(0 if m.get('ok') else 1)
            elif kind=='accounts':self.accounts(m)
            elif kind=='navigate' and trusted(m.get('url')):self.web.load_uri(m['url'])
            elif kind=='open-external' and urlparse(m.get('url','')).scheme=='https':Gio.AppInfo.launch_default_for_uri(m['url'],None)
            elif kind=='window':
                if action=='back':self.web.go_back()
                elif action=='forward':self.web.go_forward()
                elif action=='reload':self.web.reload()
                elif action=='minimize':self.window.iconify()
                elif action=='maximize':self.window.unmaximize() if self.window.is_maximized() else self.window.maximize()
                elif action=='close':self.window.close()
                elif action=='drag':self.window.begin_move_drag(1,int(m.get('screenX',0)),int(m.get('screenY',0)),Gdk.CURRENT_TIME)
            elif kind=='copy-video-link':
                from gi.repository import Gdk
                Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text(m.get('url',''),-1);self.send('videoLinkCopied',{'url':m.get('url',''),'ok':True})
            elif kind=='updates':self.send('acceptUpdateStatus',{'available':False,'message':'Linux 版本请从 GitHub Release 更新'})
        except (ValueError,KeyError,GLib.Error,TypeError):pass
    def accounts(self,m):
        action=m.get('action')
        if action=='list':event=self.pending;self.pending='';self.account_state(event)
        elif action=='remember':
            profile=self.current();metadata=m.get('profile',{})
            def captured(manager,result,*_):
                try:
                    cookies=manager.get_cookies_finish(result)
                    if any(c.get_name()=='DedeUserID' and c.get_value()==str(metadata.get('mid')) for c in cookies):
                        profile.update({k:str(metadata.get(k,'')) for k in ['mid','uname','face']});self.save()
                        if self.pending_add:
                            previous=self.pending_add;self.pending_add=None;self.state.pop('pendingAccountID',None);self.open_profile(previous,event='added')
                        else:self.account_state('saved')
                except GLib.Error:self.account_state('error','账号保存失败，请重试')
            self.cookies.get_cookies('https://www.bilibili.com/',None,captured,None)
        elif action=='add':
            self.pending_add=self.state.get('activeID');self.state['pendingAccountID']=self.pending_add;self.save();self.open_profile(event='login-add')
        elif action=='cancel-add':
            previous=self.pending_add or self.state.get('pendingAccountID');self.pending_add=None;self.state.pop('pendingAccountID',None)
            if previous:self.open_profile(previous,event='add-restored')
        elif action=='switch':
            profile=next((p for p in self.state['profiles'] if p.get('mid')==m.get('mid')),None)
            if profile:self.open_profile(profile['id'],'switched')
            else:self.account_state('error','账号不存在，请重新登录')
        elif action=='logout':
            old=self.state['activeID'];manager=self.context.get_website_data_manager()
            def cleared(manager,result,*_):
                try:manager.clear_finish(result)
                except GLib.Error:self.account_state('error','退出失败，请重试');return
                self.state['profiles']=[p for p in self.state['profiles'] if p['id']!=old];self.open_profile(event='signed-out')
            manager.clear(WebKit2.WebsiteDataTypes.COOKIES,0,None,cleared,None)

if __name__=='__main__':sys.exit(App().run([sys.argv[0]]))
