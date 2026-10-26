from pathlib import Path
import json
r=Path.cwd()
def edit(p,a,b):
 p=r/p;s=p.read_text(encoding='utf8');assert a in s,(p,a[:90]);p.write_text(s.replace(a,b),encoding='utf8',newline='\n')
meta={'name':'Bili-Space','version':'0.1.34','author':'未署名','platform':'windows-x64','updateUrl':'https://bili.gvqi.top/updates/windows-x64.json'}
(r/'assets/app-info.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8')
(r/'src/app_info.hpp').write_text('#pragma once\nconstexpr char appVersion[]="0.1.34";\nconstexpr char appAuthor[]="未署名";\n',encoding='utf8')
p=r/'package.json';d=json.loads(p.read_text());d.update(name='bili-space',version='0.1.34');p.write_text(json.dumps(d,indent=2)+'\n')
edit('CMakeLists.txt','VERSION 0.1.33','VERSION 0.1.34');edit('CMakeLists.txt','mfreadwrite mfuuid)','mfreadwrite mfuuid bcrypt)');edit('CMakeLists.txt','add_executable(BetterBiliSpace WIN32 src/main.cpp src/app.rc)','add_executable(BetterBiliSpace WIN32 src/main.cpp src/app.rc)\nset_target_properties(BetterBiliSpace PROPERTIES OUTPUT_NAME "Bili-Space")')
edit('scripts/build.ps1','-lmfuuid -o','-lmfuuid -lbcrypt -o')
for p in (r/'scripts').glob('*'):
 if p.suffix in ['.py','.ps1']:
  s=p.read_text(encoding='utf8');s=s.replace('Bili-Space.exe','Bili-Space.exe').replace('Bili-Space [test]','Bili-Space [test]');p.write_text(s,encoding='utf8',newline='\n')
edit('scripts/package.py',"f'BetterBiliSpace-{version}-win64.zip'","f'Bili-Space-{version}-win64.zip'")
edit('scripts/package.py',"Path('BetterBiliSpace')","Path('Bili-Space')")
edit('scripts/package.py',"'BetterBiliSpace/Bili-Space.exe'","'Bili-Space/Bili-Space.exe'")
edit('scripts/package.py',"ROOT/'THIRD_PARTY_NOTICES.md']","ROOT/'THIRD_PARTY_NOTICES.md',ROOT/'UPDATE-SITE.md']")
edit('assets/bridge.js',"scriptHandler:'Better Bili Space',version:'0.1.33'","scriptHandler:'Bili-Space',version:'0.1.34'")
edit('assets/startup.html','Bili Space','Bili-Space')
edit('src/main.cpp','#include <winhttp.h>','#include <winhttp.h>\n#include <bcrypt.h>\n#include "app_info.hpp"')
edit('src/main.cpp','L"Bili Space · 双击打开"','L"Bili-Space · 双击打开"')
edit('src/main.cpp','L"Bili-Space [test]":L"Better Bili Space"','L"Bili-Space [test]":L"Bili-Space"')
edit('src/main.cpp','FindWindowW(L"BetterBiliSpace",L"Better Bili Space")','FindWindowW(L"BetterBiliSpace",nullptr)')
edit('src/main.cpp','json defaults(){return {{"theme"','json defaults(){return {{"autoCheckUpdates",true},{"theme"')
# updater after save/merge helpers and before trusted/script
edit('src/main.cpp','bool trusted(const std::wstring& uri){','#include "update_service.hpp"\nbool trusted(const std::wstring& uri){')
edit('src/main.cpp','const INITIAL="+config.dump()','const APP_INFO="+appInfo().dump()+";const INITIAL="+config.dump()')
edit('src/main.cpp','if(!trusted(uri)||raw.size()>256*1024)return;','if(raw.size()>256*1024)return;\n    if(updateRequired){if(uri!=L"about:blank")return;try{auto m=json::parse(raw);if(m.value("type",std::string{})=="updates")updateAction(m.value("action",std::string{}));}catch(...){}return;}\n    if(!trusted(uri))return;')
edit('src/main.cpp','if(type=="window"){','if(type=="updates"){updateAction(m.value("action",std::string{}));\n        }else if(type=="window"){')
edit('src/main.cpp','case downloadReplyMessage:{','case updateReplyMessage:{std::unique_ptr<json> result(reinterpret_cast<json*>(lp));if(result)acceptUpdate(*result);return 0;}\n    case downloadReplyMessage:{')
edit('src/main.cpp','case WM_CLOSE:if(pip)','case WM_CLOSE:if(updateRequired){DestroyWindow(hwnd);return 0;}if(pip)')
edit('src/main.cpp','if(testing)log("test navigation starting: "+utf8(uri.substr(0,60)));','if(updateRequired&&uri!=L"about:blank"){args->put_Cancel(TRUE);return S_OK;}\n                if(testing)log("test navigation starting: "+utf8(uri.substr(0,60)));')
edit('src/main.cpp','bool local=(!startupTarget.empty()','bool local=(updateRequired&&uri==L"about:blank")||(!startupTarget.empty()')
edit('src/main.cpp','if(SUCCEEDED(hr)){injectionId=id;','if(SUCCEEDED(hr)){injectionId=id;if(loadRequiredUpdate()){showRequiredUpdate();return S_OK;}')
(r/'src/app.rc').write_text('''1 ICON "assets/branding/bili-space.ico"
1 VERSIONINFO
 FILEVERSION 0,1,34,0
 PRODUCTVERSION 0,1,34,0
 FILEOS 0x40004
 FILETYPE 1
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904b0"
  BEGIN
   VALUE "FileDescription", "Bili-Space\\0"
   VALUE "ProductName", "Bili-Space\\0"
   VALUE "FileVersion", "0.1.34\\0"
   VALUE "ProductVersion", "0.1.34\\0"
   VALUE "OriginalFilename", "Bili-Space.exe\\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x409, 1200
 END
END
''',encoding='utf8')
