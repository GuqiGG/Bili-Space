#!/usr/bin/env python3
"""Native GTK/WebKit host. Browser profiles stay in per-user WebKit data directories."""
import json, os, re, secrets, sys, uuid
from pathlib import Path
from urllib.parse import unquote, urlparse
import gi
gi.require_version('Gtk','3.0')
gi.require_version('WebKit2','4.1')
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
        self.renderer=(self.resources/'renderer.js').read_text(encoding='utf-8');self.web=None;self.pending='';self.popups=[]
        self.last_clipboard='';self.connect('activate',self.activate)
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
    def account_state(self,event='',message=''):
        items=[{key:p.get(key,'') for key in ['mid','uname','face']} for p in self.state['profiles'] if p.get('mid')]
        self.send('acceptAccountState',{'items':items,'active':(self.current() or {}).get('mid',''),'busy':False,'event':event,'message':message})
    def activate(self,*_):
        Gtk.Settings.get_default().set_property('gtk-application-prefer-dark-theme',self.state['config'].get('theme')=='dark')
        self.window=Gtk.ApplicationWindow(application=self);self.window.set_title('Bili-Space');self.window.set_default_size(1440,940)
        self.window.set_size_request(520,420);header=Gtk.HeaderBar(title='Bili-Space');header.set_show_close_button(True);self.window.set_titlebar(header)
        self.window.connect('focus-in-event',self.clipboard_focus)
        self.window.connect('delete-event',lambda *_:self.save() or False)
        self.open_profile(self.state.get('activeID'))
        if not self.testing:self.window.show_all()
        else:GLib.timeout_add_seconds(30,self.test_timeout)
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
        self.context=WebKit2.WebContext.new_with_website_data_manager(manager)
        self.context.register_uri_scheme('bili-space',self.scheme,None)
        security=self.context.get_security_manager();security.register_uri_scheme_as_secure('bili-space');security.register_uri_scheme_as_cors_enabled('bili-space')
        self.cookies=self.context.get_cookie_manager();self.cookies.set_persistent_storage(str(directory/'cookies.sqlite'),WebKit2.CookiePersistentStorage.SQLITE)
        content=WebKit2.UserContentManager();content.register_script_message_handler('native');content.connect('script-message-received::native',self.message)
        payload={'appInfo':self.read(self.resources/'assets/app-info.json'),'config':self.state['config'],'gm':self.state['gm'],'runtime':{'platform':'linux','testing':self.testing,'running':False}}
        bridge="(()=>{if(window.top!==window)return;const token="+json.dumps(self.token)+";window.__BILI_NATIVE__="+json.dumps(payload,ensure_ascii=False)+";window.chrome=window.chrome||{};window.chrome.webview={postMessage:m=>window.webkit.messageHandlers.native.postMessage(JSON.stringify({token,message:m}))};})();\n"
        script=WebKit2.UserScript.new(bridge+self.renderer,WebKit2.UserContentInjectedFrames.ALL_FRAMES,WebKit2.UserScriptInjectionTime.START,None,None);content.add_script(script)
        if self.web:self.window.remove(self.web);self.web.destroy()
        self.web=WebKit2.WebView(web_context=self.context,user_content_manager=content)
        settings=self.web.get_settings();settings.set_enable_developer_extras(self.testing);settings.set_media_playback_requires_user_gesture(False)
        self.web.connect('decide-policy',self.policy);self.web.connect('create',self.popup);self.web.connect('load-changed',self.loaded)
        self.window.add(self.web);self.web.show();self.web.load_uri('bili-space://assets/fixture.html' if self.testing else 'https://www.bilibili.com/')
    def scheme(self,request,*_):
        try:
            root=(self.resources/'assets').resolve();path=(root/unquote(urlparse(request.get_uri()).path).lstrip('/')).resolve();path.relative_to(root)
            data=path.read_bytes();mime={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png','.json':'application/json'}.get(path.suffix,'application/octet-stream')
            stream=Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data));response=WebKit2.URISchemeResponse.new(stream,len(data));response.set_content_type(mime)
            headers=Soup.MessageHeaders.new(Soup.MessageHeadersType.RESPONSE);headers.append('Access-Control-Allow-Origin','*');response.set_http_headers(headers);request.finish_with_response(response)
        except (OSError,ValueError) as error:request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(),str(error),Gio.IOErrorEnum.NOT_FOUND))
    def policy(self,web,decision,kind):
        if kind not in (WebKit2.PolicyDecisionType.NAVIGATION_ACTION,WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION):return False
        url=decision.get_request().get_uri();scheme=urlparse(url).scheme
        if trusted(url) or (scheme=='https' and urlparse(url).hostname=='b23.tv') or (self.testing and scheme=='bili-space') or url=='about:blank' or (web is not self.web and scheme=='https'):decision.use()
        else:
            decision.ignore()
            if scheme=='https':Gio.AppInfo.launch_default_for_uri(url,None)
        return True
    def popup(self,web,action):
        url=action.get_request().get_uri()
        if trusted(url) and urlparse(url).hostname!='passport.bilibili.com':self.web.load_uri(url);return None
        child=WebKit2.WebView(related_view=self.web,user_content_manager=WebKit2.UserContentManager());window=Gtk.Window(title='登录 · '+(urlparse(url).hostname or 'B站'));window.set_transient_for(self.window);window.set_default_size(760,720);window.add(child);self.popups.append(window)
        child.connect('decide-policy',self.policy);child.connect('create',self.popup);child.connect('ready-to-show',lambda *_:window.show_all());child.connect('close',lambda *_:window.destroy());return child
    def loaded(self,web,event):
        if event!=WebKit2.LoadEvent.FINISHED:return
        self.js('window.BiliSpace?.surfaceRevealed?.();window.BiliSpace?.setLoading(false)')
        if self.window.is_active():self.clipboard_focus()
        if self.testing:
            code="(()=>{const s=document.querySelector('#bili-space-root')?.shadowRoot;return !!window.BiliSpace&&!!s?.querySelector('.account-switch')&&s.querySelector('.lights').hidden&&s.querySelector('.window-actions').hidden})()"
            def complete(view,result,*_):
                try:ok=view.run_javascript_finish(result).get_js_value().to_boolean()
                except GLib.Error:ok=False
                print('Linux WebKit renderer self-test:', 'passed' if ok else 'failed',flush=True);os._exit(0 if ok else 1)
            web.run_javascript(code,None,complete,None)
    def test_timeout(self):print('Linux WebKit renderer self-test timed out',flush=True);os._exit(2)
    def message(self,content,result):
        try:
            wrapper=json.loads(result.get_js_value().to_string())
            if wrapper.get('token')!=self.token:return
            if not trusted(self.web.get_uri()) and not(self.testing and urlparse(self.web.get_uri()).scheme=='bili-space'):return
            m=wrapper['message'];kind=m.get('type');action=m.get('action')
            if kind=='config' and isinstance(m.get('value'),dict):self.state['config'].update(m['value']);self.save()
            elif kind=='gm-set':self.state['gm'][m['key']]=m.get('value');self.save()
            elif kind=='accounts':self.accounts(m)
            elif kind=='navigate' and trusted(m.get('url')):self.web.load_uri(m['url'])
            elif kind=='open-external' and urlparse(m.get('url','')).scheme=='https':Gio.AppInfo.launch_default_for_uri(m['url'],None)
            elif kind=='window':
                if action=='back':self.web.go_back()
                elif action=='reload':self.web.reload()
                elif action=='minimize':self.window.iconify()
                elif action=='maximize':self.window.unmaximize() if self.window.is_maximized() else self.window.maximize()
                elif action=='close':self.window.close()
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
                        profile.update({k:str(metadata.get(k,'')) for k in ['mid','uname','face']});self.save();self.account_state('saved')
                except GLib.Error:self.account_state('error','账号保存失败，请重试')
            self.cookies.get_cookies('https://www.bilibili.com/',None,captured,None)
        elif action=='add':self.open_profile(event='login')
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
