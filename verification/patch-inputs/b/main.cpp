#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <commdlg.h>
#include <winhttp.h>
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
constexpr UINT trayMessage=WM_APP+71;
NOTIFYICONDATAW trayIcon{};bool trayReady=false;
UINT taskbarCreated=RegisterWindowMessageW(L"TaskbarCreated");
void restoreFromTray(){ShowWindow(windowHandle,IsIconic(windowHandle)?SW_RESTORE:SW_SHOW);SetForegroundWindow(windowHandle);}
void installTray(){
    trayIcon={};trayIcon.cbSize=sizeof(trayIcon);trayIcon.hWnd=windowHandle;trayIcon.uID=1;
    trayIcon.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP;trayIcon.uCallbackMessage=trayMessage;
    trayIcon.hIcon=LoadIconW(GetModuleHandleW(nullptr),MAKEINTRESOURCEW(1));
    lstrcpynW(trayIcon.szTip,L"Bili Space · 双击打开",128);
    trayReady=Shell_NotifyIconW(NIM_ADD,&trayIcon)!=FALSE;
}

std::wstring injectionId;
bool injectionPending=false, injectionDirty=false;
json config, gm;
void save();
HANDLE proxyProcess{},proxyJob{};int proxyPort{},proxyControlPort{};std::string proxyStatus="代理已关闭",proxySecret;
bool proxyEnabled=false,proxyRunning=false;

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
int freePort(){SOCKET s=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(s==INVALID_SOCKET)return 0;sockaddr_in a{};a.sin_family=AF_INET;a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);if(bind(s,reinterpret_cast<sockaddr*>(&a),sizeof(a))){closesocket(s);return 0;}int size=sizeof(a);getsockname(s,reinterpret_cast<sockaddr*>(&a),&size);int p=ntohs(a.sin_port);closesocket(s);return p;}
void stopProxy(){proxyRunning=false;if(proxyJob){CloseHandle(proxyJob);proxyJob=nullptr;}if(proxyProcess){WaitForSingleObject(proxyProcess,3000);CloseHandle(proxyProcess);proxyProcess=nullptr;}}

/* Blocking loopback call to the bundled core; the control port is bound to 127.0.0.1 only. */
std::string coreApi(const std::wstring& verb,const std::wstring& path,const std::string& body={}){
    if(!proxyRunning||!proxyControlPort||proxySecret.empty())return {};
    auto session=WinHttpOpen(L"BetterBiliSpace/1",WINHTTP_ACCESS_TYPE_NO_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(!session)return {};
    WinHttpSetTimeouts(session,600,600,1500,1500);
    auto connection=WinHttpConnect(session,L"127.0.0.1",INTERNET_PORT(proxyControlPort),0);
    auto request=connection?WinHttpOpenRequest(connection,verb.c_str(),path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,0):nullptr;
    std::string out;
    if(request){
        auto headers=wide("Authorization: Bearer "+proxySecret+"\r\nContent-Type: application/json\r\n");
        void* payload=body.empty()?nullptr:(void*)body.data();
        if(WinHttpSendRequest(request,headers.c_str(),DWORD(-1),payload,DWORD(body.size()),DWORD(body.size()),0)&&WinHttpReceiveResponse(request,nullptr)){
            DWORD code{},size=sizeof(code);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&code,&size,nullptr)||code<200||code>=300){WinHttpCloseHandle(request);WinHttpCloseHandle(connection);WinHttpCloseHandle(session);return {}; }
            DWORD available=0;
            while(WinHttpQueryDataAvailable(request,&available)&&available){
                std::string chunk(available,0);DWORD got=0;
                if(!WinHttpReadData(request,chunk.data(),available,&got)||!got)break;
                out.append(chunk.data(),got);
            }
            if(out.empty())out="{}";
        }
    }
    if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);WinHttpCloseHandle(session);
    return out;
}
json proxyState(){
    json nodes=json::array(),current=json();
    if(proxyRunning){
        try{auto info=json::parse(coreApi(L"GET",L"/proxies/CLIENT"));for(auto& name:info.value("all",json::array()))nodes.push_back(name);current=info.value("now",json());}catch(...){}
    }
    return {{"enabled",proxyEnabled},{"running",proxyRunning},{"message",proxyStatus},{"port",proxyPort},{"node",current},{"nodes",nodes}};
}
void pushProxy(){execute("window.BiliSpace?.proxyState("+proxyState().dump()+")");}

json proxyConfig(){
    auto source=dataPath/L"mihomo/proxy-source.yaml";
    json rules=json::array({"DOMAIN-SUFFIX,bilibili.com,CLIENT","DOMAIN-SUFFIX,bilivideo.com,CLIENT","DOMAIN-SUFFIX,bilivideo.cn,CLIENT","DOMAIN-SUFFIX,hdslb.com,CLIENT","DOMAIN-SUFFIX,biliimg.com,CLIENT","DOMAIN-SUFFIX,biliapi.net,CLIENT","DOMAIN-SUFFIX,bilibili.tv,CLIENT"});
    rules.push_back(config.value("proxyAll",false)?"MATCH,CLIENT":"MATCH,DIRECT");
    return {{"mixed-port",proxyPort},{"allow-lan",false},{"bind-address","127.0.0.1"},{"mode","rule"},{"log-level","warning"},{"ipv6",false},{"external-controller","127.0.0.1:"+std::to_string(proxyControlPort)},{"secret",proxySecret},{"tun",{{"enable",false}}},{"dns",{{"enable",false}}},{"profile",{{"store-selected",true}}},{"proxy-providers",{{"Imported",{{"type","file"},{"path",utf8(source.wstring())},{"health-check",{{"enable",false}}}}}}},{"proxy-groups",json::array({{{"name","CLIENT"},{"type","select"},{"use",json::array({"Imported"})}}})},{"rules",rules}};
}
bool startProxy(){
    if(!proxyEnabled)return true;
    auto source=dataPath/L"mihomo/proxy-source.yaml";
    if(!fs::exists(source)){proxyStatus="节点配置缺失；未启用代理";return false;}
    proxyPort=freePort();proxyControlPort=freePort();
    if(!proxyPort||!proxyControlPort||proxyPort==proxyControlPort){proxyStatus="无法分配本地端口";return false;}
    GUID id{};wchar_t secret[40]{};if(FAILED(CoCreateGuid(&id))||!StringFromGUID2(id,secret,40)){proxyStatus="无法生成控制口令";return false;}proxySecret=utf8(secret);
    fs::create_directories(dataPath/L"mihomo");auto path=dataPath/L"mihomo/client.json";{std::ofstream f(path);f<<proxyConfig().dump(2);}
    std::wstring cmd=L"\""+(root/L"runtime/mihomo.exe").wstring()+L"\" -d \""+(dataPath/L"mihomo").wstring()+L"\" -f \""+path.wstring()+L"\"";
    STARTUPINFOW si{sizeof(si)};si.dwFlags=STARTF_USESHOWWINDOW;si.wShowWindow=SW_HIDE;PROCESS_INFORMATION pi{};
    if(!CreateProcessW(nullptr,cmd.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW|CREATE_SUSPENDED,nullptr,root.c_str(),&si,&pi)){proxyStatus="代理内核启动失败";return false;}
    proxyProcess=pi.hProcess;proxyJob=CreateJobObjectW(nullptr,nullptr);JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};limit.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if(!proxyJob||!SetInformationJobObject(proxyJob,JobObjectExtendedLimitInformation,&limit,sizeof(limit))||!AssignProcessToJobObject(proxyJob,proxyProcess)){TerminateProcess(proxyProcess,1);CloseHandle(pi.hThread);stopProxy();proxyStatus="无法管理代理进程";return false;}
    ResumeThread(pi.hThread);CloseHandle(pi.hThread);
    auto session=WinHttpOpen(L"BetterBiliSpace/1",WINHTTP_ACCESS_TYPE_NO_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
    if(session)WinHttpSetTimeouts(session,300,300,300,300);bool ready=false;
    for(int i=0;i<40&&!ready;i++){
        if(WaitForSingleObject(proxyProcess,0)==WAIT_OBJECT_0)break;
        auto connection=session?WinHttpConnect(session,L"127.0.0.1",INTERNET_PORT(proxyControlPort),0):nullptr;
        auto request=connection?WinHttpOpenRequest(connection,L"GET",L"/version",nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,0):nullptr;
        auto auth=wide("Authorization: Bearer "+proxySecret+"\r\n");DWORD code{},n=sizeof(code);
        if(request&&WinHttpSendRequest(request,auth.c_str(),DWORD(-1),nullptr,0,0,0)&&WinHttpReceiveResponse(request,nullptr)&&WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&code,&n,nullptr))ready=code==200;
        if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);if(!ready)Sleep(100);
    }
    if(session)WinHttpCloseHandle(session);
    if(!ready){stopProxy();proxyStatus="代理内核未就绪（节点配置无效？）";return false;}
    proxyRunning=true;
    auto wanted=config.value("proxyNode",std::string{});
    if(!wanted.empty())coreApi(L"PUT",L"/proxies/CLIENT",json({{"name",wanted}}).dump());
    proxyStatus="代理运行中 · 仅本客户端 · 出口端口 "+std::to_string(proxyPort);log(proxyStatus);return true;
}
void relaunch(const std::string& resume){
    wchar_t exe[32768];GetModuleFileNameW(nullptr,exe,32768);
    std::wstring cmd=L"\""+std::wstring(exe)+L"\" "+(testing?L"--test ":L"");
    if(!resume.empty()&&resume.size()<=4096&&resume.find_first_of("\"\r\n")==std::string::npos&&resume.rfind("https://",0)==0)cmd+=L"--resume=\""+wide(resume)+L"\" ";
    cmd+=L"--wait-parent="+std::to_wstring(GetCurrentProcessId());
    STARTUPINFOW si{sizeof(si)};si.dwFlags=STARTF_USESHOWWINDOW;si.wShowWindow=SW_HIDE;PROCESS_INFORMATION pi{};
    if(CreateProcessW(nullptr,cmd.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,root.c_str(),&si,&pi)){CloseHandle(pi.hThread);CloseHandle(pi.hProcess);DestroyWindow(windowHandle);}
}
void proxyAction(const std::string& action,const std::string& value,const std::string& resume){
    auto source=dataPath/L"mihomo/proxy-source.yaml";fs::create_directories(dataPath/L"mihomo");
    if(action=="enable"||action=="disable"){
        fs::remove(dataPath/L"proxy-enabled");
        config["proxy"]=(action=="enable");
        if(action=="enable"&&!fs::exists(source)){
            auto bundled=root/L"runtime/free-candidates.yaml";
            if(fs::exists(bundled))fs::copy_file(bundled,source,fs::copy_options::overwrite_existing);
        }
        save();
        proxyStatus=action=="enable"?"正在重启客户端以启用代理…":"正在重启客户端以关闭代理…";
        pushProxy();relaunch(resume);return;
    }
    if(action=="import"){
        wchar_t file[32768]{};OPENFILENAMEW ofn{sizeof(ofn)};ofn.hwndOwner=windowHandle;ofn.lpstrFile=file;ofn.nMaxFile=32768;ofn.lpstrFilter=L"Clash 配置 (*.yaml;*.yml;*.json)\0*.yaml;*.yml;*.json\0";ofn.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST;
        if(!GetOpenFileNameW(&ofn))return;
        if(fs::file_size(file)>4*1024*1024){MessageBoxW(windowHandle,L"配置不得超过 4MB。",L"未导入",MB_OK);return;}
        fs::copy_file(file,source,fs::copy_options::overwrite_existing);
        config["proxy"]=true;save();proxyStatus="配置已导入，正在重启…";pushProxy();relaunch(resume);return;
    }
    if(action=="free"){
        auto bundled=root/L"runtime/free-candidates.yaml";
        if(!fs::exists(bundled)){proxyStatus="内置免费节点缺失";execute("window.BiliSpace?.proxyToast("+json(proxyStatus).dump()+")");return;}
        fs::copy_file(bundled,source,fs::copy_options::overwrite_existing);
        config["proxy"]=true;config["proxyNode"]=std::string{};save();
        proxyStatus="已切换到内置免费节点，正在重启…";pushProxy();relaunch(resume);return;
    }
    if(action=="select"&&!value.empty()){
        auto reply=coreApi(L"PUT",L"/proxies/CLIENT",json({{"name",value}}).dump());
        if(!reply.empty()){config["proxyNode"]=value;save();}
        proxyStatus=reply.empty()?"切换节点失败：代理未运行":"已切换节点";
    }
    if(action=="reload"&&proxyRunning){
        auto path=dataPath/L"mihomo/client.json";{std::ofstream f(path);f<<proxyConfig().dump(2);}
        auto reply=coreApi(L"PUT",L"/configs?force=true",json({{"path",utf8(path.wstring())}}).dump());
        proxyStatus=reply.empty()?"分流方式将在下次启动生效":"分流方式已更新";
    }
    if(action=="nodes"){pushProxy();return;}
    if(action=="restart"){relaunch(resume);return;}
    pushProxy();
}

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

json defaults(){return {{"theme","dark"},{"accent","#fb7299"},{"progressColor","#fb7299"},{"progressHeight",4},{"progressRadius",6},{"progressAlways",false},{"progressThumb",true},{"showChannels",true},{"hideAds",true},{"btr",true},{"font",true},{"zoom",100},{"srMode","off"},{"srScale",2},{"srFps",60},{"closeAction","tray"},{"fiMode","off"},{"fiFps",60},{"fiFlowScale",50},{"headerHome",true},{"headerDynamic",true},{"headerHistory",true},{"headerBrand",true},{"headerSearch",true},{"headerMessages",true},{"headerAccount",true},{"headerBack",true},{"autoZoom",true},{"autoZoomTarget",1280},{"proxy",false},{"proxyAll",false},{"proxyNode",""},{"categoryPreset",0},{"categorySelection",json::array({0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17})}};}
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
        else if(key=="closeAction"&&value.is_string()&&(value=="tray"||value=="exit"))config[key]=value;
        else if(key=="srMode"&&value.is_string()&&(value=="off"||value=="performance"||value=="quality"))config[key]=value;
        else if(key=="fiMode"&&value.is_string()&&(value=="off"||value=="rife"||value=="blend"))config[key]=value=="blend"?json("rife"):value;
        else if(key=="proxyNode"&&value.is_string()&&value.get<std::string>().size()<=96)config[key]=value;
        else if(key=="categorySelection"&&value.is_array()&&value.size()<=18){json choices=json::array();for(const auto& v:value)if(v.is_number_integer()&&v.get<int>()>=0&&v.get<int>()<18&&std::find(choices.begin(),choices.end(),v)==choices.end())choices.push_back(v);config[key]=choices;}
        else if(value.is_boolean()&&defaults()[key].is_boolean())config[key]=value;
        else if(value.is_number_integer()){
            int n=value.get<int>();
            if((key=="progressHeight"&&n>=1&&n<=12)||(key=="progressRadius"&&n>=0&&n<=12)||(key=="zoom"&&n>=75&&n<=200)||(key=="srScale"&&n>=1&&n<=3)||((key=="fiFps"||key=="srFps")&&(n==60||n==120))||(key=="fiFlowScale"&&(n==25||n==50||n==100))||(key=="autoZoomTarget"&&n>=1100&&n<=1800)||(key=="categoryPreset"&&n>=0&&n<=9))config[key]=n;
        }
    }
}
bool trusted(const std::wstring& uri){
    for(auto host:{L"https://www.bilibili.com/",L"https://search.bilibili.com/",L"https://space.bilibili.com/",L"https://live.bilibili.com/",L"https://t.bilibili.com/",L"https://passport.bilibili.com/",L"https://account.bilibili.com/",L"https://message.bilibili.com/",L"https://manga.bilibili.com/"})if(uri.rfind(host,0)==0)return true;
    return testing&&uri.rfind(L"https://bili-space.local/",0)==0;
}
std::string script(){
    std::string s="(()=>{if(window.top!==window)return; const host=location.hostname;if(!(['www.bilibili.com','search.bilibili.com','space.bilibili.com','live.bilibili.com','t.bilibili.com','passport.bilibili.com','account.bilibili.com','message.bilibili.com','manga.bilibili.com'].includes(host)";
    if(testing)s+="||host==='bili-space.local'";
    s+="))return;\nconst INITIAL="+config.dump()+";const GM_INITIAL="+gm.dump()+";const RUNTIME="+proxyState().dump()+";\n";
    auto settings=read(root/L"assets/settings.svg"), sparkles=read(root/L"assets/sparkles.svg");
    s+="const ICON_SETTINGS="+json(settings).dump()+", ICON_SPARKLES="+json(sparkles).dump()+", ICON_MESSAGE="+json(read(root/L"assets/message-square-more.svg")).dump()+";\n";
    s+="const ICON_FRAMES="+json(read(root/L"assets/frame-interpolation.svg")).dump()+";\n";
    s+="RUNTIME.testing="+std::string(testing?"true":"false")+";\n";
    s+=read(root/L"assets/bridge.js");
    s+="\nif(INITIAL.btr){(()=>{\n"+read(root/L"assets/btr.user.js")+"\n})();}\n";
    // Upstream only executes on bilibili.com; fixture policy tests load it separately.
    s+="if(host==='www.bilibili.com'){(()=>{\n"+read(root/L"assets/blocker.home.user.js")+"\n})();}\n";
    s+=read(root/L"assets/ai/ort.webgpu.min.js");s+="\n";
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
void applyZoom(){
    if(!controller)return;
    RECT r{};GetClientRect(windowHandle,&r);
    using Dpi=UINT(WINAPI*)(HWND);
    auto dpi=reinterpret_cast<Dpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));
    double scale=dpi?dpi(windowHandle)/96.0:1.0;
    double dip=(r.right-r.left)/scale;
    double z=config["zoom"].get<double>()/100.;
    // Windowed layout keeps the user's own zoom; maximized/fullscreen targets a readable CSS width
    // so the UI grows with the screen instead of staying at its 1380px design size.
    if(!pip&&config.value("autoZoom",true)&&(full||IsZoomed(windowHandle))){
        double target=config.value("autoZoomTarget",1280.0);
        if(target<800)target=1280;
        z=std::max(z,std::min(2.5,dip/target));
    }
    controller->put_ZoomFactor(z);
}
void fit(){if(controller){RECT rc;GetClientRect(windowHandle,&rc);controller->put_Bounds(rc);applyZoom();}}
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
        }else if(type=="proxy"){proxyAction(m.value("action",std::string{}),m.value("node",std::string{}),m.value("url",std::string{}));
        }else if(type=="config"){
            mergeConfig(m.at("value"));save();applyZoom();refreshInjection();
            if(m.at("value").contains("proxyAll"))proxyAction("reload","","");
            log("config saved: "+m.at("value").dump());
            execute("window.BiliSpace?.acceptConfig("+config.dump()+","+std::to_string(m.value("revision",0))+")");
        }else if(type=="gm-set"){
            auto key=m.value("key",std::string{});
            if((key=="sync"||key=="local")&&m.contains("value")){gm[key]=m["value"];save();refreshInjection();}
        }else if(type=="diagnostic")log(m.value("message",std::string{}));
    }catch(const std::exception& e){log(std::string("message rejected: ")+e.what());}
}
LRESULT CALLBACK proc(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp){
    if(msg==taskbarCreated&&!testing){installTray();return 0;}
    if(msg==trayMessage){
        if(lp==WM_LBUTTONDBLCLK){restoreFromTray();return 0;}
        if(lp==WM_RBUTTONUP||lp==WM_CONTEXTMENU){
            HMENU menu=CreatePopupMenu();AppendMenuW(menu,MF_STRING,1,L"打开 Bili Space");
            AppendMenuW(menu,MF_STRING,2,L"隐藏窗口");AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
            AppendMenuW(menu,MF_STRING,3,L"退出");POINT pt{};GetCursorPos(&pt);SetForegroundWindow(hwnd);
            auto selected=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_RIGHTBUTTON,pt.x,pt.y,0,hwnd,nullptr);DestroyMenu(menu);
            if(selected==1)restoreFromTray();else if(selected==2)ShowWindow(hwnd,SW_HIDE);else if(selected==3)DestroyWindow(hwnd);
            PostMessageW(hwnd,WM_NULL,0,0);return 0;
        }
    }
    switch(msg){
    case WM_NCCALCSIZE:if(full&&wp)return 0;break; // Keep native non-client resize borders outside WebView2.
    case WM_NCHITTEST:{
        RECT r;GetWindowRect(hwnd,&r);int x=GET_X_LPARAM(lp),y=GET_Y_LPARAM(lp),b=IsZoomed(hwnd)||full?0:6;
        bool l=x<r.left+b,t=y<r.top+b,rr=x>=r.right-b,bb=y>=r.bottom-b;
        if(t&&l)return HTTOPLEFT;if(t&&rr)return HTTOPRIGHT;if(bb&&l)return HTBOTTOMLEFT;if(bb&&rr)return HTBOTTOMRIGHT;
        if(l)return HTLEFT;if(rr)return HTRIGHT;if(t)return HTTOP;if(bb)return HTBOTTOM;break;
    }
    case WM_GETMINMAXINFO:{auto p=reinterpret_cast<MINMAXINFO*>(lp);p->ptMinTrackSize={pip?160:480,pip?90:320};return 0;}
    case WM_SIZE:fit();return 0;
    case WM_DPICHANGED:{auto r=reinterpret_cast<RECT*>(lp);SetWindowPos(hwnd,nullptr,r->left,r->top,r->right-r->left,r->bottom-r->top,SWP_NOZORDER|SWP_NOACTIVATE);fit();return 0;}
    case WM_EXITSIZEMOVE:{RECT r{};GetWindowRect(hwnd,&r);log("native edge drag end: "+std::to_string(r.right-r.left)+"x"+std::to_string(r.bottom-r.top));return 0;}
    case WM_CLOSE:if(pip){togglePip(false);return 0;}if(trayReady&&!testing&&config.value("closeAction",std::string("tray"))=="tray"){ShowWindow(hwnd,SW_HIDE);return 0;}DestroyWindow(hwnd);return 0;
    case WM_DESTROY:if(trayReady){Shell_NotifyIconW(NIM_DELETE,&trayIcon);trayReady=false;}stopProxy();if(controller){controller->Close();controller->Release();controller=nullptr;}if(webview){webview->Release();webview=nullptr;}PostQuitMessage(0);return 0;
    }
    return DefWindowProcW(hwnd,msg,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR command,int){
    using DpiAwareness=BOOL(WINAPI*)(HANDLE);
    auto dpi=reinterpret_cast<DpiAwareness>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"SetProcessDpiAwarenessContext"));
    if(dpi)dpi(reinterpret_cast<HANDLE>(-4));
    auto args=std::wstring(command);auto wait=args.find(L"--wait-parent=");if(wait!=std::wstring::npos){DWORD id=wcstoul(args.c_str()+wait+14,nullptr,10);auto parent=OpenProcess(SYNCHRONIZE,FALSE,id);if(parent){WaitForSingleObject(parent,15000);CloseHandle(parent);Sleep(1200);}}
    std::wstring resumeUrl;{auto start=args.find(L"--resume=\"");if(start!=std::wstring::npos){start+=10;auto end=args.find(L'"',start);if(end!=std::wstring::npos)resumeUrl=args.substr(start,end-start);}}
    WSADATA sockets{};WSAStartup(MAKEWORD(2,2),&sockets);
    wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);root=fs::path(exe).parent_path();
    testing=std::wstring(command).find(L"--test")!=std::wstring::npos;
    if(!testing){auto existing=FindWindowW(L"BetterBiliSpace",L"Better Bili Space");if(existing){ShowWindow(existing,SW_RESTORE);SetForegroundWindow(existing);return 0;}}
    PWSTR local{};SHGetKnownFolderPath(FOLDERID_LocalAppData,0,nullptr,&local);dataPath=testing?root/L".appdata":fs::path(local?local:L".")/L"BetterBiliSpace";CoTaskMemFree(local);
    fs::create_directories(dataPath);config=defaults();gm=json::object();
    try{auto stored=json::parse(read(dataPath/L"settings.json"));mergeConfig(stored.value("config",json::object()));if(stored.contains("gm")&&stored["gm"].is_object())gm=stored["gm"];}catch(...){}
    proxyEnabled=config.value("proxy",false);
    if(!proxyEnabled&&fs::exists(dataPath/L"proxy-enabled")){proxyEnabled=true;config["proxy"]=true;}
    if(!startProxy()){
        if(testing){log("proxy unavailable in test mode: "+proxyStatus);proxyEnabled=false;}
        else if(MessageBoxW(nullptr,wide(proxyStatus+"。是否以直连方式启动？选择“否”退出，客户端不会偷偷直连。").c_str(),L"代理未就绪",MB_YESNO|MB_ICONERROR)!=IDYES)return 1;
        else{proxyEnabled=false;config["proxy"]=false;save();}
    }
    std::wstring browserArgs=testing?L"--remote-debugging-port=9223":L"";
    if(proxyEnabled)browserArgs+=L" --proxy-server=http://127.0.0.1:"+std::to_wstring(proxyPort)+L" --proxy-bypass-list=bili-space.local;127.0.0.1;localhost";
    SetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",browserArgs.c_str());
    CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    WNDCLASSW wc{};wc.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(1));wc.lpfnWndProc=proc;wc.hInstance=instance;wc.lpszClassName=L"BetterBiliSpace";wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.hbrBackground=CreateSolidBrush(RGB(20,20,22));RegisterClassW(&wc);
    windowHandle=CreateWindowExW(0,wc.lpszClassName,testing?L"Better Bili Space [test]":L"Better Bili Space",WS_POPUP|WS_THICKFRAME|WS_MINIMIZEBOX|WS_MAXIMIZEBOX,100,80,1380,880,nullptr,nullptr,instance,nullptr);
    BOOL dark=TRUE;DwmSetWindowAttribute(windowHandle,20,&dark,sizeof(dark));int corner=2;DwmSetWindowAttribute(windowHandle,33,&corner,sizeof(corner));
    if(!testing)installTray();
    ShowWindow(windowHandle,SW_SHOW);UpdateWindow(windowHandle);
    auto dll=LoadLibraryW((root/L"WebView2Loader.dll").c_str());
    using Create=HRESULT(STDAPICALLTYPE*)(PCWSTR,PCWSTR,ICoreWebView2EnvironmentOptions*,ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
    auto create=dll?reinterpret_cast<Create>(GetProcAddress(dll,"CreateCoreWebView2EnvironmentWithOptions")):nullptr;
    if(!create){MessageBoxW(windowHandle,L"WebView2Loader.dll 缺失，请使用完整 dist 目录。",L"启动失败",MB_OK|MB_ICONERROR);return 1;}
    auto envHandler=callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,HRESULT,ICoreWebView2Environment*>([resumeUrl](HRESULT hr,ICoreWebView2Environment* env){
        if(FAILED(hr)||!env){log("WebView2 environment failed: "+std::to_string(hr));MessageBoxW(windowHandle,L"请安装 Microsoft Edge WebView2 Evergreen Runtime 后重试。",L"启动失败",MB_OK);DestroyWindow(windowHandle);return S_OK;}
        auto h=callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,HRESULT,ICoreWebView2Controller*>([resumeUrl](HRESULT hr,ICoreWebView2Controller* c){
            if(FAILED(hr)||!c){log("controller creation failed");DestroyWindow(windowHandle);return S_OK;}
            controller=c;controller->AddRef();controller->get_CoreWebView2(&webview);fit();applyZoom();
            EventRegistrationToken acceleratorToken;
            auto accelerator=callback<ICoreWebView2AcceleratorKeyPressedEventHandler,ICoreWebView2Controller*,ICoreWebView2AcceleratorKeyPressedEventArgs*>([](ICoreWebView2Controller*,auto args){
                UINT key{};COREWEBVIEW2_KEY_EVENT_KIND kind{};args->get_VirtualKey(&key);args->get_KeyEventKind(&kind);
                if(key=='W'&&(GetKeyState(VK_CONTROL)&0x8000)&&!(GetKeyState(VK_MENU)&0x8000)&&(kind==COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN||kind==COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN)){args->put_Handled(TRUE);PostMessageW(windowHandle,WM_CLOSE,0,0);}return S_OK;
            });controller->add_AcceleratorKeyPressed(accelerator,&acceleratorToken);accelerator->Release();
            ICoreWebView2Settings* settings{};webview->get_Settings(&settings);settings->put_AreDefaultContextMenusEnabled(TRUE);settings->put_IsStatusBarEnabled(FALSE);settings->put_AreDevToolsEnabled(testing);settings->Release();
            ICoreWebView2_3* v3{};
            if(SUCCEEDED(webview->QueryInterface(__uuidof(ICoreWebView2_3),reinterpret_cast<void**>(&v3)))){v3->SetVirtualHostNameToFolderMapping(L"bili-space.local",(root/L"assets").c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);v3->Release();}
            EventRegistrationToken token;
            auto mh=callback<ICoreWebView2WebMessageReceivedEventHandler,ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs*>([](ICoreWebView2*,auto args){receive(args);return S_OK;});webview->add_WebMessageReceived(mh,&token);mh->Release();
            auto nh=callback<ICoreWebView2NavigationStartingEventHandler,ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*>([](ICoreWebView2*,auto args){
                LPWSTR u{};args->get_Uri(&u);std::wstring uri=u?u:L"";CoTaskMemFree(u);
                bool local=testing&&uri.rfind(L"https://bili-space.local/",0)==0;
                bool site=false;for(auto host:{L"www.bilibili.com",L"search.bilibili.com",L"space.bilibili.com",L"passport.bilibili.com",L"account.bilibili.com",L"live.bilibili.com",L"t.bilibili.com",L"message.bilibili.com",L"manga.bilibili.com"})if(uri.rfind(std::wstring(L"https://")+host+L"/",0)==0)site=true;
                if(!local&&!site){args->put_Cancel(TRUE);if(uri.rfind(L"https://",0)==0)ShellExecuteW(nullptr,L"open",uri.c_str(),nullptr,nullptr,SW_SHOWNORMAL);}
                else execute("window.BiliSpace?.setLoading(true)");
                return S_OK;
            });webview->add_NavigationStarting(nh,&token);nh->Release();
            auto ph=callback<ICoreWebView2NewWindowRequestedEventHandler,ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*>([](ICoreWebView2*,auto args){LPWSTR uri{};args->get_Uri(&uri);args->put_Handled(TRUE);if(uri){webview->Navigate(uri);CoTaskMemFree(uri);}return S_OK;});webview->add_NewWindowRequested(ph,&token);ph->Release();
            auto fh=callback<ICoreWebView2ContainsFullScreenElementChangedEventHandler,ICoreWebView2*,IUnknown*>([](ICoreWebView2*,IUnknown*){BOOL on{};webview->get_ContainsFullScreenElement(&on);toggleFull(on);return S_OK;});webview->add_ContainsFullScreenElementChanged(fh,&token);fh->Release();
            auto ready=callback<ICoreWebView2NavigationCompletedEventHandler,ICoreWebView2*,ICoreWebView2NavigationCompletedEventArgs*>([](ICoreWebView2*,auto args){BOOL success{};args->get_IsSuccess(&success);execute(success?"window.BiliSpace?.setLoading(false)":"window.BiliSpace?.setLoading(false,true)");log(success?"navigation completed":"navigation failed");return S_OK;});webview->add_NavigationCompleted(ready,&token);ready->Release();
            auto injected=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([resumeUrl](HRESULT hr,LPCWSTR id){if(SUCCEEDED(hr)){injectionId=id;std::wstring target=testing?L"https://bili-space.local/fixture.html":L"https://www.bilibili.com/";if(!testing&&trusted(resumeUrl))target=resumeUrl;log("initial navigate: "+utf8(target));webview->Navigate(target.c_str());}else{log("initial injection failed");DestroyWindow(windowHandle);}return S_OK;});
            webview->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),injected);injected->Release();return S_OK;
        });env->CreateCoreWebView2Controller(windowHandle,h);h->Release();return S_OK;
    });
    auto hr=create(nullptr,(dataPath/L"WebView2").c_str(),nullptr,envHandler);envHandler->Release();
    if(FAILED(hr)){log("environment start failed: "+std::to_string(hr));DestroyWindow(windowHandle);return 2;}
    MSG msg;while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}CoUninitialize();return 0;
}
