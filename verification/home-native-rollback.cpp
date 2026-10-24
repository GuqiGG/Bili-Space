#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <rpcndr.h>
#ifdef __uuidof
#undef __uuidof
#endif
#if defined(__MINGW32__)
#undef MIDL_INTERFACE
#define MIDL_INTERFACE(x) struct __declspec(uuid(x))
#endif
#include <WebView2.h>
#include <atomic>
#include <filesystem>
#include <fstream>
#include <functional>
#include <string>
#include <sstream>
#include "json.hpp"

using json = nlohmann::json;
namespace fs = std::filesystem;
HWND windowHandle{};
ICoreWebView2Controller* controller{};
ICoreWebView2* webview{};
fs::path root, dataPath;
bool testing=false, pip=false, full=false;
RECT savedRect{};
std::wstring injectionId;
bool injectionPending=false, injectionDirty=false;
json config, gm;

std::wstring wide(const std::string& value) {
    if(value.empty()) return {};
    int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,value.data(),int(value.size()),nullptr,0);
    std::wstring s(n,0); if(n) MultiByteToWideChar(CP_UTF8,0,value.data(),int(value.size()),s.data(),n); return s;
}
std::string utf8(const std::wstring& s) {
    int n=WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),nullptr,0,nullptr,nullptr);
    std::string v(n,0); if(n) WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),v.data(),n,nullptr,nullptr); return v;
}
std::string read(const fs::path& path) {std::ifstream f(path,std::ios::binary); return {std::istreambuf_iterator<char>(f),{}};}
void log(const std::string& line) { std::ofstream(dataPath/L"runtime.log",std::ios::app)<<line<<'\n'; }
void execute(const std::string& s) {if(webview) webview->ExecuteScript(wide(s).c_str(),nullptr);}

template<class T, class... Args> class Handler final : public T {
    std::atomic<ULONG> refs{1}; std::function<HRESULT(Args...)> fn;
public:
    explicit Handler(std::function<HRESULT(Args...)> f):fn(std::move(f)){}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** p) override {
        if(!p) return E_POINTER; *p=nullptr;
        if(iid==IID_IUnknown||iid==__uuidof(T)){*p=static_cast<T*>(this);AddRef();return S_OK;}return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override{return ++refs;}
    ULONG STDMETHODCALLTYPE Release() override{auto n=--refs;if(!n) delete this;return n;}
    HRESULT STDMETHODCALLTYPE Invoke(Args... args) override {return fn(args...);}
};
template<class T, class... Args, class F> T* callback(F fn){return new Handler<T,Args...>(std::move(fn));}

json defaults(){return {{"theme","dark"},{"accent","#fb7299"},{"progressColor","#fb7299"},{"progressHeight",4},{"progressRadius",6},{"progressAlways",false},{"progressThumb",true},{"showChannels",true},{"hideAds",true},{"btr",true},{"font",true},{"zoom",100},{"srMode","off"},{"srScale",2},{"headerHome",true},{"headerDynamic",true},{"headerHistory",true},{"headerBrand",true},{"headerSearch",true},{"headerMessages",true},{"headerAccount",true},{"headerBack",true}};}
void save(){
    auto tmp=dataPath/L"settings.tmp";
    {std::ofstream f(tmp,std::ios::binary);f<<json({{"config",config},{"gm",gm}}).dump(2);if(!f){log("settings write failed");return;}}
    if(!MoveFileExW(tmp.c_str(),(dataPath/L"settings.json").c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))log("settings atomic rename failed");
}
bool color(const json& v){ if(!v.is_string())return false;auto s=v.get<std::string>();return s.size()==7&&s[0]=='#'&&s.find_first_not_of("0123456789abcdefABCDEF",1)==std::string::npos; }
void mergeConfig(const json& next){
    if(!next.is_object())return;
    for(auto& [key,value]:next.items()){
        if(!config.contains(key))continue;
        if(key=="theme"&&value.is_string()&&(value=="dark"||value=="light"||value=="system"))config[key]=value;
        else if((key=="accent"||key=="progressColor")&&color(value))config[key]=value;
        else if(key=="srMode"&&value.is_string()&&(value=="off"||value=="performance"||value=="quality"))config[key]=value;
        else if(value.is_boolean()&&defaults()[key].is_boolean())config[key]=value;
        else if(value.is_number_integer()){
            int n=value.get<int>();
            if((key=="progressHeight"&&n>=1&&n<=12)||(key=="progressRadius"&&n>=0&&n<=12)||(key=="zoom"&&n>=75&&n<=150)||(key=="srScale"&&n>=1&&n<=3))config[key]=n;
        }
    }
}
bool trusted(const std::wstring& uri){
    for(auto host:{L"https://www.bilibili.com/",L"https://search.bilibili.com/",L"https://space.bilibili.com/",L"https://live.bilibili.com/",L"https://t.bilibili.com/",L"https://passport.bilibili.com/",L"https://account.bilibili.com/",L"https://message.bilibili.com/"})if(uri.rfind(host,0)==0)return true;
    return testing&&uri.rfind(L"https://bili-space.local/",0)==0;
}
std::string script(){
    std::string s="(()=>{if(window.top!==window)return; const host=location.hostname;if(!(['www.bilibili.com','search.bilibili.com','space.bilibili.com','live.bilibili.com','t.bilibili.com','passport.bilibili.com','account.bilibili.com','message.bilibili.com'].includes(host)";
    if(testing)s+="||host==='bili-space.local'";
    s+="))return;\nconst INITIAL="+config.dump()+";const GM_INITIAL="+gm.dump()+";\n";
    auto settings=read(root/L"assets/settings.svg"), sparkles=read(root/L"assets/sparkles.svg");
    s+="const ICON_SETTINGS="+json(settings).dump()+", ICON_SPARKLES="+json(sparkles).dump()+", ICON_MESSAGE="+json(read(root/L"assets/message-square-more.svg")).dump()+";\n";
    s+=read(root/L"assets/bridge.js");
    s+="\nif(INITIAL.btr){(()=>{\n"+read(root/L"assets/btr.user.js")+"\n})();}\n";
    // Upstream only executes on bilibili.com; fixture policy tests load it separately.
    s+="if(host==='www.bilibili.com'){(()=>{\n"+read(root/L"assets/blocker.home.user.js")+"\n})();}\n";
    s+=read(root/L"assets/enhance.js");return s+"\n})();";
}
void refreshInjection(){
    if(!webview)return;
    if(injectionPending){injectionDirty=true;return;}
    injectionPending=true;injectionDirty=false;
    if(!injectionId.empty())webview->RemoveScriptToExecuteOnDocumentCreated(injectionId.c_str());
    injectionId.clear();
    auto h=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([](HRESULT hr,LPCWSTR id){injectionPending=false;if(SUCCEEDED(hr)&&id)injectionId=id;else log("injection failed");if(injectionDirty)refreshInjection();return S_OK;});
    webview->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),h);h->Release();
}
void fit(){if(controller){RECT rc;GetClientRect(windowHandle,&rc);controller->put_Bounds(rc);}}
void togglePip(bool on){
    if(on==pip)return;
    if(on){if(full)return;GetWindowRect(windowHandle,&savedRect);ShowWindow(windowHandle,SW_RESTORE);pip=true;
        SetWindowPos(windowHandle,HWND_TOPMOST,GetSystemMetrics(SM_CXSCREEN)-520,GetSystemMetrics(SM_CYSCREEN)-340,480,270,SWP_FRAMECHANGED|SWP_SHOWWINDOW);
    }else{pip=false;SetWindowPos(windowHandle,HWND_NOTOPMOST,savedRect.left,savedRect.top,savedRect.right-savedRect.left,savedRect.bottom-savedRect.top,SWP_FRAMECHANGED|SWP_SHOWWINDOW);}
    fit();execute(std::string("window.BiliSpace?.setPip(")+(pip?"true":"false")+")");log(pip?"PIP entered: borderless, topmost":"PIP restored");
}
void toggleFull(bool on){
    if(on==full||pip)return;
    if(on){GetWindowRect(windowHandle,&savedRect);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(MonitorFromWindow(windowHandle,MONITOR_DEFAULTTONEAREST),&mi);full=true;
        SetWindowPos(windowHandle,HWND_TOP,mi.rcMonitor.left,mi.rcMonitor.top,mi.rcMonitor.right-mi.rcMonitor.left,mi.rcMonitor.bottom-mi.rcMonitor.top,SWP_FRAMECHANGED);
    }else{full=false;SetWindowPos(windowHandle,nullptr,savedRect.left,savedRect.top,savedRect.right-savedRect.left,savedRect.bottom-savedRect.top,SWP_FRAMECHANGED|SWP_NOZORDER);}
    fit();execute(std::string("window.BiliSpace?.setFullscreen(")+(full?"true":"false")+")");
}
void receive(ICoreWebView2WebMessageReceivedEventArgs* args){
    LPWSTR origin{},body{};args->get_Source(&origin);args->get_WebMessageAsJson(&body);
    std::wstring uri=origin?origin:L"";std::string raw=body?utf8(body):"";CoTaskMemFree(origin);CoTaskMemFree(body);
    if(!trusted(uri)||raw.size()>256*1024)return;
    try{
        auto m=json::parse(raw);auto type=m.value("type",std::string{});
        if(type=="window"){
            auto action=m.value("action",std::string{});
            if(action=="close")PostMessageW(windowHandle,WM_CLOSE,0,0);
            else if(action=="minimize")ShowWindow(windowHandle,SW_MINIMIZE);
            else if(action=="maximize"){if(pip)togglePip(false);else ShowWindow(windowHandle,IsZoomed(windowHandle)?SW_RESTORE:SW_MAXIMIZE);}
            else if(action=="drag"){ReleaseCapture();SendMessageW(windowHandle,WM_NCLBUTTONDOWN,HTCAPTION,0);}
            else if(action=="back")webview->GoBack();
            else if(action=="reload")webview->Reload();
            else if(action=="pip")togglePip(!pip);
            else if(action=="fullscreen")toggleFull(!full);
        }else if(type=="navigate"){
            auto uri=wide(m.value("url",std::string{}));
            if(uri.size()<=4096&&uri.rfind(L"https://search.bilibili.com/all?keyword=",0)==0)webview->Navigate(uri.c_str());
        }else if(type=="config"){
            mergeConfig(m.at("value"));save();controller->put_ZoomFactor(config["zoom"].get<double>()/100.0);refreshInjection();
            log("config saved: "+m.at("value").dump());
            execute("window.BiliSpace?.acceptConfig("+config.dump()+","+std::to_string(m.value("revision",0))+")");
        }else if(type=="gm-set"){
            auto key=m.value("key",std::string{});
            if((key=="sync"||key=="local")&&m.contains("value")){gm[key]=m["value"];save();refreshInjection();}
        }else if(type=="diagnostic")log(m.value("message",std::string{}));
    }catch(const std::exception& e){log(std::string("message rejected: ")+e.what());}
}
LRESULT CALLBACK proc(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp){
    switch(msg){
    case WM_NCCALCSIZE:if(wp)return 0;break;
    case WM_NCHITTEST:{
        RECT r;GetWindowRect(hwnd,&r);int x=GET_X_LPARAM(lp),y=GET_Y_LPARAM(lp),b=IsZoomed(hwnd)||full?0:6;
        bool l=x<r.left+b,t=y<r.top+b,rr=x>=r.right-b,bb=y>=r.bottom-b;
        if(t&&l)return HTTOPLEFT;if(t&&rr)return HTTOPRIGHT;if(bb&&l)return HTBOTTOMLEFT;if(bb&&rr)return HTBOTTOMRIGHT;
        if(l)return HTLEFT;if(rr)return HTRIGHT;if(t)return HTTOP;if(bb)return HTBOTTOM;return HTCLIENT;
    }
    case WM_GETMINMAXINFO:{auto p=reinterpret_cast<MINMAXINFO*>(lp);p->ptMinTrackSize={pip?240:880,pip?135:560};return 0;}
    case WM_SIZE:fit();return 0;
    case WM_CLOSE:if(pip){togglePip(false);return 0;}DestroyWindow(hwnd);return 0;
    case WM_DESTROY:if(controller){controller->Close();controller->Release();controller=nullptr;}if(webview){webview->Release();webview=nullptr;}PostQuitMessage(0);return 0;
    }
    return DefWindowProcW(hwnd,msg,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR command,int){
    using DpiAwareness=BOOL(WINAPI*)(HANDLE);
    auto dpi=reinterpret_cast<DpiAwareness>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"SetProcessDpiAwarenessContext"));
    if(dpi)dpi(reinterpret_cast<HANDLE>(-4));
    wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);root=fs::path(exe).parent_path();
    testing=std::wstring(command).find(L"--test")!=std::wstring::npos;
    PWSTR local{};SHGetKnownFolderPath(FOLDERID_LocalAppData,0,nullptr,&local);dataPath=testing?root/L".appdata":fs::path(local?local:L".")/L"BetterBiliSpace";CoTaskMemFree(local);
    fs::create_directories(dataPath);config=defaults();gm=json::object();
    try{auto stored=json::parse(read(dataPath/L"settings.json"));mergeConfig(stored.value("config",json::object()));if(stored.contains("gm")&&stored["gm"].is_object())gm=stored["gm"];}catch(...){}
    if(testing)SetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",L"--remote-debugging-port=9223");
    CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    WNDCLASSW wc{};wc.lpfnWndProc=proc;wc.hInstance=instance;wc.lpszClassName=L"BetterBiliSpace";wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.hbrBackground=CreateSolidBrush(RGB(20,20,22));RegisterClassW(&wc);
    windowHandle=CreateWindowExW(0,wc.lpszClassName,testing?L"Better Bili Space [test]":L"Better Bili Space",WS_POPUP|WS_THICKFRAME|WS_MINIMIZEBOX|WS_MAXIMIZEBOX,100,80,1380,880,nullptr,nullptr,instance,nullptr);
    BOOL dark=TRUE;DwmSetWindowAttribute(windowHandle,20,&dark,sizeof(dark));int corner=2;DwmSetWindowAttribute(windowHandle,33,&corner,sizeof(corner));
    ShowWindow(windowHandle,SW_SHOW);UpdateWindow(windowHandle);
    auto dll=LoadLibraryW((root/L"WebView2Loader.dll").c_str());
    using Create=HRESULT(STDAPICALLTYPE*)(PCWSTR,PCWSTR,ICoreWebView2EnvironmentOptions*,ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
    auto create=dll?reinterpret_cast<Create>(GetProcAddress(dll,"CreateCoreWebView2EnvironmentWithOptions")):nullptr;
    if(!create){MessageBoxW(windowHandle,L"WebView2Loader.dll 缺失，请使用完整 dist 目录。",L"启动失败",MB_OK|MB_ICONERROR);return 1;}
    auto envHandler=callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,HRESULT,ICoreWebView2Environment*>([](HRESULT hr,ICoreWebView2Environment* env){
        if(FAILED(hr)||!env){log("WebView2 environment failed: "+std::to_string(hr));MessageBoxW(windowHandle,L"请安装 Microsoft Edge WebView2 Evergreen Runtime 后重试。",L"启动失败",MB_OK);DestroyWindow(windowHandle);return S_OK;}
        auto h=callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,HRESULT,ICoreWebView2Controller*>([](HRESULT hr,ICoreWebView2Controller* c){
            if(FAILED(hr)||!c){log("controller creation failed");DestroyWindow(windowHandle);return S_OK;}
            controller=c;controller->AddRef();controller->get_CoreWebView2(&webview);fit();controller->put_ZoomFactor(config["zoom"].get<double>()/100.0);
            ICoreWebView2Settings* settings{};webview->get_Settings(&settings);settings->put_AreDefaultContextMenusEnabled(TRUE);settings->put_IsStatusBarEnabled(FALSE);settings->put_AreDevToolsEnabled(testing);settings->Release();
            ICoreWebView2_3* v3{};
            if(SUCCEEDED(webview->QueryInterface(__uuidof(ICoreWebView2_3),reinterpret_cast<void**>(&v3)))){v3->SetVirtualHostNameToFolderMapping(L"bili-space.local",(root/L"assets").c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);v3->Release();}
            EventRegistrationToken token;
            auto mh=callback<ICoreWebView2WebMessageReceivedEventHandler,ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs*>([](ICoreWebView2*,auto args){receive(args);return S_OK;});webview->add_WebMessageReceived(mh,&token);mh->Release();
            auto nh=callback<ICoreWebView2NavigationStartingEventHandler,ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*>([](ICoreWebView2*,auto args){
                LPWSTR u{};args->get_Uri(&u);std::wstring uri=u?u:L"";CoTaskMemFree(u);
                bool local=testing&&uri.rfind(L"https://bili-space.local/",0)==0;
                bool site=false;for(auto host:{L"www.bilibili.com",L"search.bilibili.com",L"space.bilibili.com",L"passport.bilibili.com",L"account.bilibili.com",L"live.bilibili.com",L"t.bilibili.com",L"message.bilibili.com"})if(uri.rfind(std::wstring(L"https://")+host+L"/",0)==0)site=true;
                if(!local&&!site){args->put_Cancel(TRUE);if(uri.rfind(L"https://",0)==0)ShellExecuteW(nullptr,L"open",uri.c_str(),nullptr,nullptr,SW_SHOWNORMAL);}
                else execute("window.BiliSpace?.setLoading(true)");
                return S_OK;
            });webview->add_NavigationStarting(nh,&token);nh->Release();
            auto ph=callback<ICoreWebView2NewWindowRequestedEventHandler,ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*>([](ICoreWebView2*,auto args){LPWSTR uri{};args->get_Uri(&uri);args->put_Handled(TRUE);if(uri){webview->Navigate(uri);CoTaskMemFree(uri);}return S_OK;});webview->add_NewWindowRequested(ph,&token);ph->Release();
            auto fh=callback<ICoreWebView2ContainsFullScreenElementChangedEventHandler,ICoreWebView2*,IUnknown*>([](ICoreWebView2*,IUnknown*){BOOL on{};webview->get_ContainsFullScreenElement(&on);toggleFull(on);return S_OK;});webview->add_ContainsFullScreenElementChanged(fh,&token);fh->Release();
            auto ready=callback<ICoreWebView2NavigationCompletedEventHandler,ICoreWebView2*,ICoreWebView2NavigationCompletedEventArgs*>([](ICoreWebView2*,auto args){BOOL success{};args->get_IsSuccess(&success);execute(success?"window.BiliSpace?.setLoading(false)":"window.BiliSpace?.setLoading(false,true)");log(success?"navigation completed":"navigation failed");return S_OK;});webview->add_NavigationCompleted(ready,&token);ready->Release();
            auto injected=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([](HRESULT hr,LPCWSTR id){if(SUCCEEDED(hr)){injectionId=id;webview->Navigate(testing?L"https://bili-space.local/fixture.html":L"https://www.bilibili.com/");}else{log("initial injection failed");DestroyWindow(windowHandle);}return S_OK;});
            webview->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),injected);injected->Release();return S_OK;
        });env->CreateCoreWebView2Controller(windowHandle,h);h->Release();return S_OK;
    });
    auto hr=create(nullptr,(dataPath/L"WebView2").c_str(),nullptr,envHandler);envHandler->Release();
    if(FAILED(hr)){log("environment start failed: "+std::to_string(hr));DestroyWindow(windowHandle);return 2;}
    MSG msg;while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}CoUninitialize();return 0;
}
