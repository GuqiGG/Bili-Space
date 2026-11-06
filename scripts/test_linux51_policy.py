"""Run the actual GTK policy method without requiring a desktop or GI bindings."""
import ast
from pathlib import Path
from types import SimpleNamespace as Obj
from urllib.parse import urlparse

source=(Path(__file__).resolve().parents[1]/'src/linux_main.py').read_text(encoding='utf-8')
tree=ast.parse(source)
app=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='App')
policy=next(n for n in app.body if isinstance(n,ast.FunctionDef) and n.name=='policy')
opened=[]
scope={'urlparse':urlparse,'is_page':lambda uri:False,'WebKit2':Obj(PolicyDecisionType=Obj(NAVIGATION_ACTION=0,NEW_WINDOW_ACTION=1),NavigationType=Obj(BACK_FORWARD=2)),
       'Gio':Obj(AppInfo=Obj(launch_default_for_uri=lambda *args:opened.append(args)))}
exec(compile(ast.Module(body=[policy],type_ignores=[]),'<linux-policy>','exec'),scope)
instance=Obj(testing=False,web=object(),cached_loading=None)
for kind in [0,1]:
    for uri in ['https://www.bilibili.com/video/BV1cjHK6GEJE','https://s1.hdslb.com/bfs/seed/jinkela/short/cols/iframe.html','https://passport.bilibili.com/crossDomain','about:blank','blob:https://www.bilibili.com/test']:
        result=[]
        decision=Obj(get_navigation_action=lambda:Obj(get_navigation_type=lambda:0),get_request=lambda uri=uri:Obj(get_uri=lambda:uri),use=lambda:result.append('use'),ignore=lambda:result.append('ignore'))
        assert scope['policy'](instance,instance.web,decision,kind)
        assert result==['use'],(kind,uri,result)
assert not opened,'iframe navigation must never launch the system browser'
assert 'Gtk.HeaderBar(' not in source and 'set_decorated(False)' in source
assert 'UserContentInjectedFrames.TOP_FRAME' in source
print('Linux cross-origin iframe policy and frameless header regressions passed')
