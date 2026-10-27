#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <commdlg.h>
#include <winhttp.h>
#include <bcrypt.h>
#include "app_info.hpp"
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
#include <tlhelp32.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <future>
#include <mutex>
#include <atomic>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <functional>
#include <memory>
#include <regex>
#include <cmath>
#include <string>
#include <sstream>
#include <cstring>
#include <thread>
#include <vector>
#include "json.hpp"

using json = nlohmann::json;
namespace fs = std::filesystem;
HWND windowHandle{};
ICoreWebView2Controller* controller{};
ICoreWebView2* webview{};
fs::path root, dataPath;
bool testing=false, pip=false, full=false,lifecyclePreview=false;
std::wstring lastClipboardVideo,startupTarget;bool closePending=false;
bool surfaceWaiting=false,surfaceCommitted=false,surfaceDark=true;ULONGLONG surfaceStart{};
RECT savedRect{},closeRect{};ULONGLONG closeStarted{};
constexpr UINT trayMessage=WM_APP+71;
NOTIFYICONDATAW trayIcon{};bool trayReady=false;
UINT taskbarCreated=RegisterWindowMessageW(L"TaskbarCreated");
void execute(const std::string&);
void restoreFromTray(){if(closePending)SetWindowPos(windowHandle,nullptr,closeRect.left,closeRect.top,closeRect.right-closeRect.left,closeRect.bottom-closeRect.top,SWP_NOZORDER|SWP_NOACTIVATE);closePending=false;KillTimer(windowHandle,72);KillTimer(windowHandle,74);execute("document.querySelector('#bs-close-animation')?.remove();window.BiliSpace?.restoreFromTray()");ShowWindow(windowHandle,IsIconic(windowHandle)?SW_RESTORE:SW_SHOW);SetForegroundWindow(windowHandle);}
void installTray(){
    trayIcon={};trayIcon.cbSize=sizeof(trayIcon);trayIcon.hWnd=windowHandle;trayIcon.uID=1;
    trayIcon.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP;trayIcon.uCallbackMessage=trayMessage;
    trayIcon.hIcon=LoadIconW(GetModuleHandleW(nullptr),MAKEINTRESOURCEW(1));
    lstrcpynW(trayIcon.szTip,L"Bili-Space · 双击打开",128);
    trayReady=Shell_NotifyIconW(NIM_ADD,&trayIcon)!=FALSE;
}

std::wstring injectionId;
bool injectionPending=false, injectionDirty=false;
json config, gm, searchHistory=json::array();
void save();
void copyVideoLink(const std::string& value);
bool externalWebUrl(const std::wstring& uri);
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

/* ---------- Built-in streaming downloader; no external process or user cookies ---------- */
constexpr UINT downloadReplyMessage=WM_APP+80;
struct DownloadReply{bool ok;std::string message;};
std::atomic<bool> downloadBusy{false},downloadCancelRequested{false},downloadPeerFailed{false};
std::mutex downloadCommitMutex;bool downloadCommitted=false;
void checkDownloadCancelled(){if(downloadCancelRequested.load())throw std::runtime_error("已取消下载");if(downloadPeerFailed.load())throw std::runtime_error("另一条媒体轨下载失败");}
void finishDownload(bool ok,const std::string& message){auto* reply=new DownloadReply{ok,message};if(!PostMessageW(windowHandle,downloadReplyMessage,0,reinterpret_cast<LPARAM>(reply)))delete reply;}
bool downloadMediaUrl(const std::wstring& url){
#ifdef BILI_DOWNLOAD_TEST
    if(url.rfind(L"http://127.0.0.1:",0)==0)return true;
#endif
    if(url.empty()||url.size()>8192||url.find_first_of(L"\r\n\t ")!=std::wstring::npos||url.find(L'\0')!=std::wstring::npos||url.find(L'#')!=std::wstring::npos)return false;
    URL_COMPONENTS parts{sizeof(parts)};parts.dwHostNameLength=DWORD(-1);parts.dwUserNameLength=DWORD(-1);parts.dwPasswordLength=DWORD(-1);
    if(!WinHttpCrackUrl(url.c_str(),DWORD(url.size()),0,&parts)||parts.nScheme!=INTERNET_SCHEME_HTTPS||parts.dwUserNameLength||parts.dwPasswordLength||!parts.nPort)return false;
    std::wstring host(parts.lpszHostName,parts.dwHostNameLength);std::transform(host.begin(),host.end(),host.begin(),::towlower);
    for(const std::wstring domain:{L"bilivideo.com",L"bilivideo.cn",L"hdslb.com"})if(host==domain||(host.size()>domain.size()&&host.ends_with(L"."+domain)))return true;
    return host==L"upos-hz-mirrorakam.akamaized.net";
}
struct TransferProgress{
    std::mutex reportMutex;
    std::atomic<unsigned long long> received[2]{},expected[2]{};std::atomic<ULONGLONG> last{};ULONGLONG started=GetTickCount64();int tracks=1;
    void report(bool force=false){
        std::lock_guard<std::mutex> lock(reportMutex);
        auto now=GetTickCount64(),previous=last.load();if(!force&&(now-previous<250||!last.compare_exchange_strong(previous,now)))return;if(force)last=now;
        unsigned long long bytes=0,total=0;bool known=true;for(int i=0;i<tracks;i++){bytes+=received[i].load();auto size=expected[i].load();total+=size;known=known&&size>0;}
        double speed=bytes*1000./std::max<ULONGLONG>(1,now-started);json data={{"bytes",bytes},{"total",known?json(total):json(nullptr)},{"bytesPerSecond",speed},{"percent",known?json(std::min(100.,bytes*100./total)):json(nullptr)},{"etaSeconds",known&&speed>0?json(std::max(0.,double(total)-double(bytes))/speed):json(nullptr)}};
        auto* reply=new DownloadReply{true,data.dump()};if(!PostMessageW(windowHandle,downloadReplyMessage,2,reinterpret_cast<LPARAM>(reply)))delete reply;
    }
};
struct DownloadIo{
    HANDLE done=CreateEventW(nullptr,FALSE,FALSE,nullptr),closed=CreateEventW(nullptr,TRUE,FALSE,nullptr);std::atomic<DWORD> status{},error{},bytes{};
    ~DownloadIo(){if(done)CloseHandle(done);if(closed)CloseHandle(closed);}
};
void CALLBACK downloadIoCallback(HINTERNET,DWORD_PTR context,DWORD status,void* info,DWORD length){
    if(!context)return;auto* io=reinterpret_cast<DownloadIo*>(context);
    if(status==WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING){SetEvent(io->closed);return;}
    if(status==WINHTTP_CALLBACK_STATUS_REQUEST_ERROR)io->error=static_cast<WINHTTP_ASYNC_RESULT*>(info)->dwError;
    else if(status==WINHTTP_CALLBACK_STATUS_DATA_AVAILABLE)io->bytes=info&&length>=sizeof(DWORD)?*static_cast<DWORD*>(info):0;
    else if(status==WINHTTP_CALLBACK_STATUS_READ_COMPLETE)io->bytes=length;
    else if(status!=WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE&&status!=WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE)return;
    io->status=status;SetEvent(io->done);
}
void fetchMediaFile(const std::wstring& url,const fs::path& target,TransferProgress* progress=nullptr,int track=0){
    DownloadIo io;if(!io.done||!io.closed)throw std::runtime_error("无法创建下载事件");char buffer[65536];
    HINTERNET session{},connection{},request{};bool callbackReady=false;
    auto close=[&]{if(request){WinHttpCloseHandle(request);request=nullptr;if(callbackReady)WaitForSingleObject(io.closed,INFINITE);}if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);};
    auto operation=[&](auto begin,DWORD expected){checkDownloadCancelled();ResetEvent(io.done);io.status=0;io.error=0;io.bytes=0;if(!begin()&&GetLastError()!=ERROR_IO_PENDING)throw std::runtime_error("下载请求失败（错误 "+std::to_string(GetLastError())+"）");while(WaitForSingleObject(io.done,50)==WAIT_TIMEOUT)checkDownloadCancelled();checkDownloadCancelled();if(io.error||io.status!=expected)throw std::runtime_error("下载连接失败（错误 "+std::to_string(io.error.load())+"）");};
    try{
        checkDownloadCancelled();URL_COMPONENTS parts{sizeof(parts)};parts.dwHostNameLength=DWORD(-1);parts.dwUrlPathLength=DWORD(-1);parts.dwExtraInfoLength=DWORD(-1);
        if(!downloadMediaUrl(url)||!WinHttpCrackUrl(url.c_str(),DWORD(url.size()),0,&parts))throw std::runtime_error("下载地址不被允许");
        session=WinHttpOpen(L"Mozilla/5.0 BetterBiliSpace",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,WINHTTP_FLAG_ASYNC);if(!session)throw std::runtime_error("下载连接失败");WinHttpSetTimeouts(session,10000,15000,30000,30000);
        std::wstring host(parts.lpszHostName,parts.dwHostNameLength),path(parts.lpszUrlPath,parts.dwUrlPathLength);path.append(parts.lpszExtraInfo,parts.dwExtraInfoLength);
        connection=WinHttpConnect(session,host.c_str(),parts.nPort,0);if(!connection)throw std::runtime_error("下载连接失败");
        request=WinHttpOpenRequest(connection,L"GET",path.c_str(),nullptr,L"https://www.bilibili.com/",WINHTTP_DEFAULT_ACCEPT_TYPES,parts.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);if(!request)throw std::runtime_error("下载连接失败");
        DWORD redirect=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect));DWORD_PTR context=reinterpret_cast<DWORD_PTR>(&io);
        if(!WinHttpSetOption(request,WINHTTP_OPTION_CONTEXT_VALUE,&context,sizeof(context))||WinHttpSetStatusCallback(request,downloadIoCallback,WINHTTP_CALLBACK_FLAG_ALL_COMPLETIONS|WINHTTP_CALLBACK_FLAG_HANDLES,0)==WINHTTP_INVALID_STATUS_CALLBACK)throw std::runtime_error("无法初始化异步下载");callbackReady=true;
        operation([&]{return WinHttpSendRequest(request,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,context);},WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE);
        operation([&]{return WinHttpReceiveResponse(request,nullptr);},WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE);
        DWORD status{},size=sizeof(status);WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);if(status!=200)throw std::runtime_error("下载服务器返回 HTTP "+std::to_string(status));
        wchar_t length[64]{};size=sizeof(length);unsigned long long expected=0,total=0;if(WinHttpQueryHeaders(request,WINHTTP_QUERY_CONTENT_LENGTH,nullptr,length,&size,nullptr))expected=_wcstoui64(length,nullptr,10);
        if(progress){progress->expected[track]=expected;progress->report(true);}std::ofstream output(target,std::ios::binary|std::ios::trunc);if(!output)throw std::runtime_error("无法写入保存位置");std::string magic;
        while(true){operation([&]{return WinHttpQueryDataAvailable(request,nullptr);},WINHTTP_CALLBACK_STATUS_DATA_AVAILABLE);DWORD available=io.bytes;if(!available)break;
            operation([&]{return WinHttpReadData(request,buffer,std::min<DWORD>(sizeof(buffer),available),nullptr);},WINHTTP_CALLBACK_STATUS_READ_COMPLETE);DWORD got=io.bytes;if(!got)break;
            if(magic.size()<8)magic.append(buffer,std::min<size_t>(8-magic.size(),got));if(magic.size()==8&&memcmp(magic.data()+4,"ftyp",4)!=0)throw std::runtime_error("服务器未返回 MP4 文件，保存已停止");output.write(buffer,got);if(!output)throw std::runtime_error("磁盘写入失败");total+=got;if(progress){progress->received[track]=total;progress->report();}
        }
        output.close();checkDownloadCancelled();if(!output||total<8||(expected&&expected!=total))throw std::runtime_error("文件未完整下载");if(progress)progress->report(true);
    }catch(...){close();throw;}close();
}

template<class T>struct MediaCom{T* p{};~MediaCom(){if(p)p->Release();}T** out(){return &p;}T* operator->(){return p;}};
void mediaCheck(HRESULT hr){if(FAILED(hr))throw std::runtime_error("本机 MP4 封装失败 (HRESULT "+std::to_string((unsigned long)hr)+")，未覆盖原文件");}
void muxDownloadTracks(const fs::path& video,const fs::path& audio,const fs::path& target){
    mediaCheck(CoInitializeEx(nullptr,COINIT_MULTITHREADED));HRESULT startup=MFStartup(MF_VERSION);if(FAILED(startup)){CoUninitialize();mediaCheck(startup);}
    try{
        MediaCom<IMFAttributes> attr;mediaCheck(MFCreateAttributes(attr.out(),2));mediaCheck(attr->SetUINT32(MF_READWRITE_DISABLE_CONVERTERS,TRUE));
        MediaCom<IMFSourceReader> vr,ar;mediaCheck(MFCreateSourceReaderFromURL(video.c_str(),attr.p,vr.out()));mediaCheck(MFCreateSourceReaderFromURL(audio.c_str(),attr.p,ar.out()));
        mediaCheck(vr->SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS,FALSE));mediaCheck(ar->SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS,FALSE));
        mediaCheck(vr->SetStreamSelection(MF_SOURCE_READER_FIRST_VIDEO_STREAM,TRUE));mediaCheck(ar->SetStreamSelection(MF_SOURCE_READER_FIRST_AUDIO_STREAM,TRUE));
        MediaCom<IMFMediaType> vt,at;mediaCheck(vr->GetNativeMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM,0,vt.out()));mediaCheck(ar->GetNativeMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM,0,at.out()));
        GUID vs{},as{};mediaCheck(vt->GetGUID(MF_MT_SUBTYPE,&vs));mediaCheck(at->GetGUID(MF_MT_SUBTYPE,&as));if(vs!=MFVideoFormat_H264||as!=MFAudioFormat_AAC)throw std::runtime_error("当前内置封装仅支持 AVC + AAC，未覆盖原文件");
        mediaCheck(vr->SetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM,nullptr,vt.p));mediaCheck(ar->SetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM,nullptr,at.p));
        MediaCom<IMFAttributes> options;mediaCheck(MFCreateAttributes(options.out(),1));mediaCheck(options->SetUINT32(MF_SINK_WRITER_DISABLE_THROTTLING,TRUE));
        MediaCom<IMFSinkWriter> writer;mediaCheck(MFCreateSinkWriterFromURL(target.c_str(),nullptr,options.p,writer.out()));DWORD vi{},ai{};
        mediaCheck(writer->AddStream(vt.p,&vi));mediaCheck(writer->AddStream(at.p,&ai));mediaCheck(writer->SetInputMediaType(vi,vt.p,nullptr));mediaCheck(writer->SetInputMediaType(ai,at.p,nullptr));mediaCheck(writer->BeginWriting());
        struct Track{IMFSourceReader* reader;DWORD source,sink;IMFSample* sample=nullptr;LONGLONG time=0;bool end=false;~Track(){if(sample)sample->Release();}};
        Track v{vr.p,MF_SOURCE_READER_FIRST_VIDEO_STREAM,vi},a{ar.p,MF_SOURCE_READER_FIRST_AUDIO_STREAM,ai};
        auto next=[](Track& t){checkDownloadCancelled();if(t.sample){t.sample->Release();t.sample=nullptr;}while(!t.end&&!t.sample){DWORD flags=0;mediaCheck(t.reader->ReadSample(t.source,0,nullptr,&flags,&t.time,&t.sample));if(flags&MF_SOURCE_READERF_ERROR)throw std::runtime_error("媒体轨读取失败");if(flags&MF_SOURCE_READERF_ENDOFSTREAM)t.end=true;if(flags&MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED)throw std::runtime_error("媒体轨编码发生变化");}};
        next(v);next(a);unsigned long long nv=0,na=0;while(v.sample||a.sample){Track& t=!a.sample||(v.sample&&v.time<=a.time)?v:a;mediaCheck(writer->WriteSample(t.sink,t.sample));if(&t==&v)nv++;else na++;next(t);}
        if(!nv||!na)throw std::runtime_error("缺少有效音视频轨，未保存无声文件");checkDownloadCancelled();mediaCheck(writer->Finalize());checkDownloadCancelled();
    }catch(...){MFShutdown();CoUninitialize();throw;}MFShutdown();CoUninitialize();
}
void downloadPhase(const std::string& text){auto* reply=new DownloadReply{true,text};if(!PostMessageW(windowHandle,downloadReplyMessage,1,reinterpret_cast<LPARAM>(reply)))delete reply;}
void runDownloadPlan(std::wstring url,std::wstring audio,fs::path target){
    auto base=target;base+=L".bs-part-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64());auto video=base;video+=L".video.mp4";auto sound=base;sound+=L".audio.mp4";auto mux=base;mux+=L".mux.mp4";bool ok=false;std::string error;
    {std::lock_guard<std::mutex> lock(downloadCommitMutex);downloadCommitted=false;downloadPeerFailed=false;}
    TransferProgress progress;progress.tracks=audio.empty()?1:2;
    try{
        if(audio.empty()){downloadPhase("下载中");fetchMediaFile(url,mux,&progress,0);}else{
            downloadPhase("下载音视频");std::mutex failureMutex;std::exception_ptr failure;
            auto fetchTrack=[&](const std::wstring& source,const fs::path& file,int track){try{fetchMediaFile(source,file,&progress,track);}catch(...){std::lock_guard<std::mutex> lock(failureMutex);if(!failure)failure=std::current_exception();downloadPeerFailed=true;}};
            auto vf=std::async(std::launch::async,[&]{fetchTrack(url,video,0);});auto af=std::async(std::launch::async,[&]{fetchTrack(audio,sound,1);});vf.get();af.get();if(failure)std::rethrow_exception(failure);
            downloadPhase("合并中");muxDownloadTracks(video,sound,mux);
        }
        std::lock_guard<std::mutex> lock(downloadCommitMutex);checkDownloadCancelled();if(!MoveFileExW(mux.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存最终文件");downloadCommitted=true;ok=true;error="已保存 · "+utf8(target.wstring());
    }catch(const std::exception& e){error=downloadCancelRequested?"已取消下载":e.what();}
    std::error_code ec;fs::remove(video,ec);fs::remove(sound,ec);fs::remove(mux,ec);downloadBusy=false;finishDownload(ok,error);
}
void runDownload(std::wstring url,fs::path target){runDownloadPlan(url,{},target);}
void saveDownload(const std::string& url,const std::string& title,const std::string& audio){
    if(!downloadMediaUrl(wide(url))||(!audio.empty()&&!downloadMediaUrl(wide(audio)))){execute("window.BiliSpace?.downloadResult({ok:false,message:'下载地址不是受支持的 B站媒体地址'})");return;}
    if(downloadBusy.exchange(true)){execute("window.BiliSpace?.downloadResult({ok:false,message:'已有下载正在进行'})");return;}
    auto name=wide(title);for(auto& ch:name)if(ch<32||std::wstring(L"<>:\"/\\|?*").find(ch)!=std::wstring::npos)ch=L'_';if(name.size()>100)name.resize(100);if(name.empty())name=L"Bili-video";name+=L".mp4";
    wchar_t file[32768]{};lstrcpynW(file,name.c_str(),32768);OPENFILENAMEW dialog{sizeof(dialog)};dialog.hwndOwner=windowHandle;dialog.lpstrFile=file;dialog.nMaxFile=32768;dialog.lpstrFilter=L"MP4 视频\0*.mp4\0\0";dialog.lpstrDefExt=L"mp4";dialog.lpstrTitle=L"保存视频 · 内置下载器";dialog.Flags=OFN_OVERWRITEPROMPT|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
    if(!GetSaveFileNameW(&dialog)){downloadBusy=false;execute("window.BiliSpace?.downloadResult({ok:false,message:'已取消保存'})");return;}
    {std::lock_guard<std::mutex> lock(downloadCommitMutex);downloadCancelRequested=false;downloadCommitted=false;}execute("window.BiliSpace?.downloadStarted();window.BiliSpace?.downloaderNotice('下载已开始')");std::thread(runDownloadPlan,wide(url),wide(audio),fs::path(file)).detach();
}
void cancelDownload(){std::lock_guard<std::mutex> lock(downloadCommitMutex);if(downloadBusy&&!downloadCommitted)downloadCancelRequested=true;}
void pushDownloaderState(){execute("window.BiliSpace?.downloaderStatus({installed:true,mcp:false,running:false,message:'下载器就绪'})");}

template<class T, class... Args> class Handler final : public T {    std::atomic<ULONG> refs{1}; std::function<HRESULT(Args...)> fn;
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

json defaults(){return {{"theme","dark"},{"accent","#fb7299"},{"progressColor","#fb7299"},{"progressHeight",4},{"progressRadius",6},{"progressAlways",false},{"progressThumb",true},{"showChannels",true},{"hideAds",true},{"btr",true},{"font",true},{"zoom",100},{"volumeBoost",100},{"srMode","off"},{"srScale",2},{"srFps",60},{"closeAction","tray"},{"videoLoadingMode","page"},{"clipboardAutoOpen",true},{"experimentalControlsV1",false},{"fiMode","off"},{"fiFps",60},{"fiFlowScale",50},{"trafficLights",true},{"showClock",false},{"pipDanmaku",true},{"pipDanmakuMinWidth",520},{"headerHome",true},{"headerDynamic",true},{"headerHistory",true},{"headerBrand",true},{"headerSearch",true},{"headerMessages",true},{"headerUpload",true},{"headerAccount",true},{"headerBack",true},{"autoZoom",true},{"autoZoomTarget",1280},{"downloader",true},{"downloaderPath",""},{"proxy",false},{"proxyAll",false},{"proxyNode",""},{"categoryPreset",0},{"categorySelection",json::array({0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17})}};}
json cleanSearchHistory(const json& values){
    json result=json::array();if(!values.is_array())return result;
    for(const auto& value:values){if(!value.is_string())continue;auto term=value.get<std::string>();if(term.empty()||term.size()>400||term.find_first_of("\r\n\t")!=std::string::npos||term.find('\0')!=std::string::npos)continue;if(std::find(result.begin(),result.end(),value)==result.end())result.push_back(value);if(result.size()>=20)break;}return result;
}
void save(){
    auto tmp=dataPath/L"settings.tmp";
    {std::ofstream f(tmp,std::ios::binary);f<<json({{"config",config},{"gm",gm},{"searchHistory",searchHistory}}).dump(2);if(!f){log("settings write failed");return;}}
    if(!MoveFileExW(tmp.c_str(),(dataPath/L"settings.json").c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))log("settings atomic rename failed");
}
bool color(const json& v){ if(!v.is_string())return false;auto s=v.get<std::string>();return s.size()==7&&s[0]=='#'&&s.find_first_not_of("0123456789abcdefABCDEF",1)==std::string::npos; }
void mergeConfig(const json& next){
    if(!next.is_object())return;
    for(auto& [key,value]:next.items()){
        if(!config.contains(key))continue;
        if(key=="theme"&&value.is_string()&&(value=="dark"||value=="light"||value=="system"))config[key]=value;
        else if((key=="accent"||key=="progressColor")&&color(value))config[key]=value;
        else if(key=="videoLoadingMode"&&value.is_string()&&(value=="page"||value=="video"))config[key]=value;
        else if(key=="closeAction"&&value.is_string()&&(value=="tray"||value=="exit"))config[key]=value;
        else if(key=="srMode"&&value.is_string()&&(value=="off"||value=="performance"||value=="quality"))config[key]=value;
        else if(key=="fiMode"&&value.is_string()&&(value=="off"||value=="rife"||value=="blend"))config[key]=value=="blend"?json("rife"):value;
        else if(key=="proxyNode"&&value.is_string()&&value.get<std::string>().size()<=96)config[key]=value;
        else if(key=="categorySelection"&&value.is_array()&&value.size()<=18){json choices=json::array();for(const auto& v:value)if(v.is_number_integer()&&v.get<int>()>=0&&v.get<int>()<18&&std::find(choices.begin(),choices.end(),v)==choices.end())choices.push_back(v);config[key]=choices;}
        else if(value.is_boolean()&&defaults()[key].is_boolean())config[key]=value;
        else if(value.is_number_integer()){
            int n=value.get<int>();
            if((key=="pipDanmakuMinWidth"&&n>=320&&n<=1200)||(key=="volumeBoost"&&n>=100&&n<=200)||(key=="progressHeight"&&n>=1&&n<=12)||(key=="progressRadius"&&n>=0&&n<=12)||(key=="zoom"&&n>=75&&n<=200)||(key=="srScale"&&n>=1&&n<=3)||((key=="fiFps"||key=="srFps")&&(n==60||n==120))||(key=="fiFlowScale"&&(n==25||n==50||n==100))||(key=="autoZoomTarget"&&n>=1100&&n<=1800)||(key=="categoryPreset"&&n>=0&&n<=9))config[key]=n;
        }
    }
}
#include "update_service.hpp"
bool trusted(const std::wstring& uri){
    for(auto host:{L"https://www.bilibili.com/",L"https://search.bilibili.com/",L"https://space.bilibili.com/",L"https://live.bilibili.com/",L"https://t.bilibili.com/",L"https://passport.bilibili.com/",L"https://account.bilibili.com/",L"https://message.bilibili.com/",L"https://manga.bilibili.com/"})if(uri.rfind(host,0)==0)return true;
    return testing&&uri.rfind(L"https://bili-space.local/",0)==0;
}
std::string script(){
    std::string s="(()=>{if(window.top!==window)return; const host=location.hostname;if(!(['www.bilibili.com','search.bilibili.com','space.bilibili.com','live.bilibili.com','t.bilibili.com','passport.bilibili.com','account.bilibili.com','message.bilibili.com','manga.bilibili.com'].includes(host)";
    if(testing)s+="||host==='bili-space.local'";
    s+="))return;\nconst APP_INFO="+appInfo().dump()+";const INITIAL="+config.dump()+";const GM_INITIAL="+gm.dump()+";const RUNTIME="+proxyState().dump()+";\n";
    s+="RUNTIME.testing="+std::string(testing?"true":"false")+";\n";
    s+=R"JS((()=>{const dark=INITIAL.theme==='dark'||(INITIAL.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);const paint=()=>{if(!document.documentElement)return false;document.documentElement.style.setProperty('background-color',dark?'#161618':'#fafafa','important');const style=document.createElement('style');style.id='bs-navigation-surface';style.textContent='html,body'+(location.hostname==='space.bilibili.com'?'':',#app')+'{background-color:'+(dark?'#161618':'#fafafa')+'!important}';document.documentElement.append(style);return true;};if(!paint()){const observer=new MutationObserver(()=>{if(paint())observer.disconnect();});observer.observe(document,{childList:true,subtree:true});}window.__bsPaintReady=()=>setTimeout(()=>{if(document.documentElement&&chrome?.webview){getComputedStyle(document.documentElement).backgroundColor;chrome.webview.postMessage({type:'surface-ready'});}},32);if(RUNTIME.testing){window.__bsSurfaceSamples=[];const sample=()=>{if(document.documentElement)window.__bsSurfaceSamples.push(getComputedStyle(document.documentElement).backgroundColor);if(window.__bsSurfaceSamples.length<12)requestAnimationFrame(sample);};requestAnimationFrame(sample);}})();)JS";
    auto settings=read(root/L"assets/settings.svg"), sparkles=read(root/L"assets/sparkles.svg");
    s+="const ICON_SETTINGS="+json(settings).dump()+", ICON_SPARKLES="+json(sparkles).dump()+", ICON_MESSAGE="+json(read(root/L"assets/message-square-more.svg")).dump()+";\n";
    s+="const ICON_FRAMES="+json(read(root/L"assets/frame-interpolation.svg")).dump()+";\n";
    s+=read(root/L"assets/bridge.js");
    s+="\nif(INITIAL.btr){(()=>{\n"+read(root/L"assets/btr.user.js")+"\n})();}\n";
    // Upstream only executes on bilibili.com; fixture policy tests load it separately.
    s+="if(host==='www.bilibili.com'){(()=>{\n"+read(root/L"assets/blocker.home.user.js")+"\n})();}\n";
    s+=read(root/L"assets/ai/ort.webgpu.min.js");s+="\n";
    s+=read(root/L"assets/ai/anime4k-webgpu.js");s+="\n";
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
void setSurface(bool dark){surfaceDark=dark;if(surfaceWaiting)InvalidateRect(windowHandle,nullptr,FALSE);if(!controller)return;ICoreWebView2Controller2* c{};if(SUCCEEDED(controller->QueryInterface(__uuidof(ICoreWebView2Controller2),reinterpret_cast<void**>(&c)))){COREWEBVIEW2_COLOR color{255,BYTE(dark?22:250),BYTE(dark?22:250),BYTE(dark?24:250)};c->put_DefaultBackgroundColor(color);c->Release();}}

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
void toggleFull(bool on);
void togglePip(bool on){
    if(on==pip)return;
    if(on){if(full)toggleFull(false);GetWindowRect(windowHandle,&savedRect);ShowWindow(windowHandle,SW_RESTORE);pip=true;
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
    if(raw.size()>256*1024)return;
    if(updateRequired){if(!updateGateOrigin(uri))return;try{auto m=json::parse(raw);if(m.value("type",std::string{})=="updates")updateAction(m.value("action",std::string{}));}catch(...){}return;}
    if(!trusted(uri))return;
    try{
        auto m=json::parse(raw);auto type=m.value("type",std::string{});
        if(type=="updates"){updateAction(m.value("action",std::string{}));
        }else if(type=="window"){
            auto action=m.value("action",std::string{});
            if(action=="test-restore"&&testing)restoreFromTray();
            else if(action=="close")PostMessageW(windowHandle,WM_CLOSE,0,0);
            else if(action=="close-ready"&&closePending)PostMessageW(windowHandle,WM_APP+72,0,0);
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
        }else if(type=="app-visibility"){if(!IsWindowVisible(windowHandle))execute("window.BiliSpace?.pauseForTray()");
        }else if(type=="surface-ready"){if(surfaceCommitted){surfaceWaiting=false;if(testing)log("surface visible: document style ready");KillTimer(windowHandle,75);KillTimer(windowHandle,76);if(controller)controller->put_IsVisible(TRUE);InvalidateRect(windowHandle,nullptr,FALSE);execute("window.BiliSpace?.surfaceRevealed?.()");}
        }else if(type=="surface"){if(m.contains("dark")&&m["dark"].is_boolean())setSurface(m["dark"].get<bool>());
        }else if(type=="copy-video-link"){copyVideoLink(m.value("url",std::string{}));
        }else if(type=="open-external"){auto uri=wide(m.value("url",std::string{}));if(externalWebUrl(uri))ShellExecuteW(windowHandle,L"open",uri.c_str(),nullptr,nullptr,SW_SHOWNORMAL);
        }else if(type=="downloader"){
            auto action=m.value("action",std::string{});
            if(action=="status")pushDownloaderState();
            else if(action=="cancel")cancelDownload();
            else if(action=="save")saveDownload(m.value("url",std::string{}),m.value("title",std::string{}),m.value("audioUrl",std::string{}));
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

std::wstring clipboardVideoUrl(std::wstring text){
    if(text.size()>16384)return L"";
    auto start=text.find_first_not_of(L" \r\n\t"),end=text.find_last_not_of(L" \r\n\t");if(start==std::wstring::npos)return L"";text=text.substr(start,end-start+1);
    static const std::wregex plain(L"[Bb][Vv][A-Za-z0-9]{10}");
    static const std::wregex link(LR"((https?://)?(www\.|m\.)?bilibili\.com/video/([Bb][Vv][A-Za-z0-9]{10})(?=[/?#\s<>]|$)([/?#][^\s<>]*)?)",std::regex_constants::icase);
    std::wstring id,query;std::wsmatch match;
    if(std::regex_match(text,plain))id=text;
    else if(std::regex_search(text,match,link)){
        if(match.position()>0){auto c=text[match.position()-1];if(iswalnum(c)||c==L'.'||c==L'/'||c==L'@'||c==L'-')return L"";}
        id=match[3].str();auto tail=match[4].str();static const std::wregex param(LR"([?&](t|p)=([0-9]+(\.[0-9]+)?)(?=&|#|$))");
        for(std::wsregex_iterator it(tail.begin(),tail.end(),param),last;it!=last;++it){if(query.size()>100)break;query+=(query.empty()?L"?":L"&")+(*it)[1].str()+L"="+(*it)[2].str();}
    }else return L"";
    id[0]=L'B';id[1]=L'V';return L"https://www.bilibili.com/video/"+id+query;
}
void copyVideoLink(const std::string& value){
    auto text=wide(value);static const std::wregex allowed(LR"(^https://www\.bilibili\.com/(video/BV[A-Za-z0-9]{10}|bangumi/play/(ep|ss)[0-9]+|list/[A-Za-z0-9]+)(\?[pt]=[0-9]+(\.[0-9]+)?(&[pt]=[0-9]+(\.[0-9]+)?)?)?$)");
    bool ok=false;if(text.size()<2048&&std::regex_match(text,allowed)){
        auto bytes=(text.size()+1)*sizeof(wchar_t);HGLOBAL memory=GlobalAlloc(GMEM_MOVEABLE,bytes);
        if(memory){auto dest=GlobalLock(memory);if(dest){memcpy(dest,text.c_str(),bytes);GlobalUnlock(memory);if(OpenClipboard(windowHandle)){if(EmptyClipboard()&&SetClipboardData(CF_UNICODETEXT,memory)){ok=true;memory=nullptr;lastClipboardVideo=clipboardVideoUrl(text);}CloseClipboard();}}if(memory)GlobalFree(memory);}
    }
    execute("window.BiliSpace?.videoLinkCopied("+json(ok).dump()+","+json(value).dump()+")");
}
bool externalWebUrl(const std::wstring& uri){
    if(uri.size()>4096||uri.find_first_of(L"\r\n\t")!=std::wstring::npos)return false;
    URL_COMPONENTS c{};c.dwStructSize=sizeof(c);c.dwHostNameLength=c.dwUserNameLength=c.dwPasswordLength=DWORD(-1);
    return WinHttpCrackUrl(uri.c_str(),DWORD(uri.size()),0,&c)&&c.dwHostNameLength&&c.dwUserNameLength==0&&c.dwPasswordLength==0&&(c.nScheme==INTERNET_SCHEME_HTTP||c.nScheme==INTERNET_SCHEME_HTTPS);
}
void checkClipboardVideo(){
    if(!webview||!config.value("clipboardAutoOpen",true)||!IsClipboardFormatAvailable(CF_UNICODETEXT)||!OpenClipboard(windowHandle))return;
    std::wstring text;auto data=GetClipboardData(CF_UNICODETEXT);if(data){auto size=GlobalSize(data);if(size&&size<=32770){auto value=static_cast<const wchar_t*>(GlobalLock(data));if(value){const auto count=size/sizeof(wchar_t);size_t n=0;while(n<count&&value[n])n++;if(n<count)text.assign(value,n);GlobalUnlock(data);}}}CloseClipboard();
    auto uri=clipboardVideoUrl(text);if(uri.empty()){lastClipboardVideo.clear();return;}if(uri!=lastClipboardVideo){lastClipboardVideo=uri;webview->Navigate(uri.c_str());}
}

// Restore native WebView focus without changing the DOM's last focused control.
constexpr UINT restoreWebFocusMessage=WM_APP+73;
void restoreWebFocus(){
    if(!controller||closePending||GetForegroundWindow()!=windowHandle||!IsWindowVisible(windowHandle)||IsIconic(windowHandle))return;
    const auto hr=controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
    if(testing)log("web keyboard focus restore: "+std::to_string(hr));
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
            if(selected==1)restoreFromTray();else if(selected==2){execute("window.BiliSpace?.pauseForTray()");ShowWindow(hwnd,SW_HIDE);}else if(selected==3){config["closeAction"]="exit";PostMessageW(hwnd,WM_CLOSE,0,0);}
            PostMessageW(hwnd,WM_NULL,0,0);return 0;
        }
    }
    switch(msg){
    case updateReplyMessage:{std::unique_ptr<json> result(reinterpret_cast<json*>(lp));if(result)acceptUpdate(*result);return 0;}
    case downloadReplyMessage:{
        std::unique_ptr<DownloadReply> reply(reinterpret_cast<DownloadReply*>(lp));
        if(reply&&wp==2){execute("window.BiliSpace?.downloadProgress("+reply->message+")");return 0;}
        if(reply&&wp==1){execute("window.BiliSpace?.downloadPhase("+json(reply->message).dump()+")");return 0;}
        if(reply)execute("window.BiliSpace?.downloadResult("+json({{"ok",reply->ok},{"message",reply->message}}).dump()+")");
        return 0;
    }
    case WM_ACTIVATE:
        if(LOWORD(wp)!=WA_INACTIVE&&!HIWORD(wp))PostMessageW(hwnd,restoreWebFocusMessage,0,0);
        break;
    case WM_SETFOCUS:PostMessageW(hwnd,restoreWebFocusMessage,0,0);return 0;
    case restoreWebFocusMessage:restoreWebFocus();return 0;
    case WM_PAINT:if(surfaceWaiting){PAINTSTRUCT ps{};HDC dc=BeginPaint(hwnd,&ps);RECT r{};GetClientRect(hwnd,&r);auto bg=CreateSolidBrush(surfaceDark?RGB(22,22,24):RGB(250,250,250));FillRect(dc,&r,bg);DeleteObject(bg);SetGraphicsMode(dc,GM_ADVANCED);double a=(GetTickCount64()-surfaceStart)*6.283185307/700.;XFORM transform{FLOAT(cos(a)),FLOAT(sin(a)),FLOAT(-sin(a)),FLOAT(cos(a)),FLOAT((r.right-r.left)/2),FLOAT((r.bottom-r.top)/2)};SetWorldTransform(dc,&transform);auto brush=CreateSolidBrush(RGB(251,114,153));auto pen=CreatePen(PS_SOLID,3,RGB(251,114,153));auto oldBrush=SelectObject(dc,brush),oldPen=SelectObject(dc,pen);RoundRect(dc,-23,-16,23,18,8,8);MoveToEx(dc,-12,-28,nullptr);LineTo(dc,0,-18);LineTo(dc,12,-28);auto white=CreateSolidBrush(RGB(255,255,255));RECT eye1{-12,-4,-8,6},eye2{8,-4,12,6};FillRect(dc,&eye1,white);FillRect(dc,&eye2,white);DeleteObject(white);SelectObject(dc,oldBrush);SelectObject(dc,oldPen);DeleteObject(brush);DeleteObject(pen);ModifyWorldTransform(dc,nullptr,MWT_IDENTITY);EndPaint(hwnd,&ps);return 0;}break;
    case WM_CLIPBOARDUPDATE:if(!testing)checkClipboardVideo();return 0;
    case WM_NCCALCSIZE:
        if(full&&wp)return 0;
        if(wp){
            auto bounds=reinterpret_cast<NCCALCSIZE_PARAMS*>(lp);const LONG top=bounds->rgrc[0].top;
            auto result=DefWindowProcW(hwnd,msg,wp,lp);
            // Keep side/bottom system resize borders, not the raised top frame.
            bounds->rgrc[0].top=top+(IsZoomed(hwnd)?GetSystemMetrics(SM_CYFRAME)+GetSystemMetrics(SM_CXPADDEDBORDER):1);
            return result;
        }break;
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
    case WM_CLOSE:if(updateRequired){DestroyWindow(hwnd);return 0;}if(pip){togglePip(false);return 0;}if(testing&&!lifecyclePreview&&!trayReady){DestroyWindow(hwnd);return 0;}if(!closePending){if(config.value("closeAction",std::string("tray"))=="tray")execute("window.BiliSpace?.pauseForTray()");closePending=true;GetWindowRect(hwnd,&closeRect);closeStarted=GetTickCount64();execute("window.BiliSpace?.beginClose()");SetTimer(hwnd,74,16,nullptr);SetTimer(hwnd,72,280,nullptr);}return 0;
    case WM_TIMER:if(wp==75){if(surfaceWaiting)InvalidateRect(hwnd,nullptr,FALSE);return 0;}if(wp==76){KillTimer(hwnd,75);KillTimer(hwnd,76);surfaceWaiting=false;if(controller)controller->put_IsVisible(TRUE);execute("window.BiliSpace?.surfaceRevealed?.()");return 0;}if(wp==74){if(!closePending){KillTimer(hwnd,74);return 0;}double t=std::min(1.,(GetTickCount64()-closeStarted)/180.);double ease=1.-(1.-t)*(1.-t)*(1.-t);int w=int((closeRect.right-closeRect.left)*(1.-.18*ease)),h=int((closeRect.bottom-closeRect.top)*(1.-.18*ease));SetWindowPos(hwnd,nullptr,(closeRect.left+closeRect.right-w)/2,(closeRect.top+closeRect.bottom-h)/2,w,h,SWP_NOZORDER|SWP_NOACTIVATE);if(t>=1)KillTimer(hwnd,74);return 0;}if(wp==73){KillTimer(hwnd,73);auto target=startupTarget;startupTarget.clear();if(webview&&!target.empty())webview->Navigate(target.c_str());return 0;}if(wp!=72)break;
    case WM_APP+72:if(!closePending)return 0;KillTimer(hwnd,72);KillTimer(hwnd,74);closePending=false;if(trayReady&&config.value("closeAction",std::string("tray"))=="tray"){execute("window.BiliSpace?.pauseForTray()");ShowWindow(hwnd,SW_HIDE);SetWindowPos(hwnd,nullptr,closeRect.left,closeRect.top,closeRect.right-closeRect.left,closeRect.bottom-closeRect.top,SWP_NOZORDER|SWP_NOACTIVATE);execute("document.querySelector('#bs-close-animation')?.remove()");return 0;}DestroyWindow(hwnd);return 0;
    case WM_DESTROY:RemoveClipboardFormatListener(hwnd);if(trayReady){Shell_NotifyIconW(NIM_DELETE,&trayIcon);trayReady=false;}stopProxy();if(controller){controller->Close();controller->Release();controller=nullptr;}if(webview){webview->Release();webview=nullptr;}PostQuitMessage(0);return 0;
    }
    return DefWindowProcW(hwnd,msg,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR command,int){
    if(auto result=runUpdateWorker(command);result>=0)return result;
    using DpiAwareness=BOOL(WINAPI*)(HANDLE);
    auto dpi=reinterpret_cast<DpiAwareness>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"SetProcessDpiAwarenessContext"));
    if(dpi)dpi(reinterpret_cast<HANDLE>(-4));
    auto args=std::wstring(command);auto wait=args.find(L"--wait-parent=");if(wait!=std::wstring::npos){DWORD id=wcstoul(args.c_str()+wait+14,nullptr,10);auto parent=OpenProcess(SYNCHRONIZE,FALSE,id);if(parent){WaitForSingleObject(parent,15000);CloseHandle(parent);Sleep(1200);}}
    std::wstring resumeUrl;{auto start=args.find(L"--resume=\"");if(start!=std::wstring::npos){start+=10;auto end=args.find(L'"',start);if(end!=std::wstring::npos)resumeUrl=args.substr(start,end-start);}}
    WSADATA sockets{};WSAStartup(MAKEWORD(2,2),&sockets);
    wchar_t exe[MAX_PATH];GetModuleFileNameW(nullptr,exe,MAX_PATH);root=fs::path(exe).parent_path();
    testing=std::wstring(command).find(L"--test")!=std::wstring::npos;lifecyclePreview=args.find(L"--lifecycle-preview")!=std::wstring::npos;
    if(!testing){auto existing=FindWindowW(L"BetterBiliSpace",nullptr);if(existing){ShowWindow(existing,SW_RESTORE);SetForegroundWindow(existing);return 0;}}
    PWSTR local{};SHGetKnownFolderPath(FOLDERID_LocalAppData,0,nullptr,&local);dataPath=testing?root/L".appdata":fs::path(local?local:L".")/L"BetterBiliSpace";CoTaskMemFree(local);
    fs::create_directories(dataPath);config=defaults();gm=json::object();
    try{auto stored=json::parse(read(dataPath/L"settings.json"));mergeConfig(stored.value("config",json::object()));if(stored.contains("gm")&&stored["gm"].is_object())gm=stored["gm"];searchHistory=cleanSearchHistory(stored.value("searchHistory",json::array()));}catch(...){}
    proxyEnabled=config.value("proxy",false);
    if(!proxyEnabled&&fs::exists(dataPath/L"proxy-enabled")){proxyEnabled=true;config["proxy"]=true;}
    if(!startProxy()){
        if(testing){log("proxy unavailable in test mode: "+proxyStatus);proxyEnabled=false;}
        else if(MessageBoxW(nullptr,wide(proxyStatus+"。是否以直连方式启动？选择“否”退出，客户端不会偷偷直连。").c_str(),L"代理未就绪",MB_YESNO|MB_ICONERROR)!=IDYES)return 1;
        else{proxyEnabled=false;config["proxy"]=false;save();}
    }
    std::wstring browserArgs=testing?L"--remote-debugging-port=9223 --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion":L"";
    browserArgs+=L" --autoplay-policy=no-user-gesture-required";
    if(proxyEnabled)browserArgs+=L" --proxy-server=http://127.0.0.1:"+std::to_wstring(proxyPort)+L" --proxy-bypass-list=bili-space.local;127.0.0.1;localhost";
    SetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",browserArgs.c_str());
    CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    WNDCLASSW wc{};wc.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(1));wc.lpfnWndProc=proc;wc.hInstance=instance;wc.lpszClassName=L"BetterBiliSpace";wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.hbrBackground=CreateSolidBrush(RGB(20,20,22));RegisterClassW(&wc);
    windowHandle=CreateWindowExW(0,wc.lpszClassName,testing?L"Bili-Space [test]":L"Bili-Space",WS_POPUP|WS_THICKFRAME|WS_MINIMIZEBOX|WS_MAXIMIZEBOX,100,80,1380,880,nullptr,nullptr,instance,nullptr);
    DWORD borderColor=0xFFFFFFFE;DwmSetWindowAttribute(windowHandle,34,&borderColor,sizeof(borderColor));
    BOOL dark=TRUE;DwmSetWindowAttribute(windowHandle,20,&dark,sizeof(dark));int corner=2;DwmSetWindowAttribute(windowHandle,33,&corner,sizeof(corner));
    if(!testing||(testing&&args.find(L"--tray-preview")!=std::wstring::npos))installTray();
    ShowWindow(windowHandle,SW_SHOW);UpdateWindow(windowHandle);
    auto dll=LoadLibraryW((root/L"WebView2Loader.dll").c_str());
    using Create=HRESULT(STDAPICALLTYPE*)(PCWSTR,PCWSTR,ICoreWebView2EnvironmentOptions*,ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
    auto create=dll?reinterpret_cast<Create>(GetProcAddress(dll,"CreateCoreWebView2EnvironmentWithOptions")):nullptr;
    if(!create){MessageBoxW(windowHandle,L"WebView2Loader.dll 缺失，请使用完整 dist 目录。",L"启动失败",MB_OK|MB_ICONERROR);return 1;}
    auto envHandler=callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,HRESULT,ICoreWebView2Environment*>([resumeUrl](HRESULT hr,ICoreWebView2Environment* env){
        if(FAILED(hr)||!env){log("WebView2 environment failed: "+std::to_string(hr));MessageBoxW(windowHandle,L"请安装 Microsoft Edge WebView2 Evergreen Runtime 后重试。",L"启动失败",MB_OK);DestroyWindow(windowHandle);return S_OK;}
        auto h=callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,HRESULT,ICoreWebView2Controller*>([resumeUrl](HRESULT hr,ICoreWebView2Controller* c){
            if(FAILED(hr)||!c){log("controller creation failed");DestroyWindow(windowHandle);return S_OK;}
            controller=c;controller->AddRef();setSurface(config.value("theme",std::string("dark"))!="light");controller->get_CoreWebView2(&webview);fit();applyZoom();PostMessageW(windowHandle,restoreWebFocusMessage,0,0);
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
                if(testing)log("test navigation starting: "+utf8(uri.substr(0,60)));
                const bool gateDocument=updateRequired&&updateGateNavigationPending&&uri.rfind(L"data:text/html;charset=utf-8;base64,",0)==0;
                if(updateRequired&&uri!=L"about:blank"){if(gateDocument)updateGateNavigationPending=false;else{args->put_Cancel(TRUE);return S_OK;}}
                bool local=gateDocument||(updateRequired&&uri==L"about:blank")||(!startupTarget.empty()&&(uri.rfind(L"about:blank",0)==0||uri.rfind(L"data:text/html",0)==0))||(testing&&uri.rfind(L"https://bili-space.local/",0)==0);
                bool site=false;for(auto host:{L"www.bilibili.com",L"search.bilibili.com",L"space.bilibili.com",L"passport.bilibili.com",L"account.bilibili.com",L"live.bilibili.com",L"t.bilibili.com",L"message.bilibili.com",L"manga.bilibili.com"})if(uri.rfind(std::wstring(L"https://")+host+L"/",0)==0)site=true;
                if(!local&&!site){args->put_Cancel(TRUE);if(uri.rfind(L"https://",0)==0)ShellExecuteW(nullptr,L"open",uri.c_str(),nullptr,nullptr,SW_SHOWNORMAL);}
                else{if(site||(testing&&uri.rfind(L"https://bili-space.local/",0)==0)){surfaceCommitted=false;surfaceWaiting=false;}execute("window.BiliSpace?.beginNavigation("+json(utf8(uri)).dump()+")");}
                return S_OK;
            });webview->add_NavigationStarting(nh,&token);nh->Release();
            auto ph=callback<ICoreWebView2NewWindowRequestedEventHandler,ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*>([](ICoreWebView2*,auto args){LPWSTR uri{};args->get_Uri(&uri);args->put_Handled(TRUE);if(uri){webview->Navigate(uri);CoTaskMemFree(uri);}return S_OK;});webview->add_NewWindowRequested(ph,&token);ph->Release();
            auto fh=callback<ICoreWebView2ContainsFullScreenElementChangedEventHandler,ICoreWebView2*,IUnknown*>([](ICoreWebView2*,IUnknown*){BOOL on{};webview->get_ContainsFullScreenElement(&on);toggleFull(on);return S_OK;});webview->add_ContainsFullScreenElementChanged(fh,&token);fh->Release();
            auto ready=callback<ICoreWebView2NavigationCompletedEventHandler,ICoreWebView2*,ICoreWebView2NavigationCompletedEventArgs*>([](ICoreWebView2*,auto args){BOOL success{};args->get_IsSuccess(&success);if(!success){COREWEBVIEW2_WEB_ERROR_STATUS status{};args->get_WebErrorStatus(&status);if(status==COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED)return S_OK;}if(testing&&!success){COREWEBVIEW2_WEB_ERROR_STATUS error{};args->get_WebErrorStatus(&error);log("test navigation error: "+std::to_string(int(error)));}if(!IsWindowVisible(windowHandle))execute("window.BiliSpace?.pauseForTray()");if(success){surfaceCommitted=true;execute("window.__bsPaintReady?.()");}else{surfaceWaiting=false;KillTimer(windowHandle,75);KillTimer(windowHandle,76);controller->put_IsVisible(TRUE);}if(success&&!startupTarget.empty()){LPWSTR source{};webview->get_Source(&source);std::wstring current=source?source:L"";CoTaskMemFree(source);if(current.rfind(L"about:blank",0)==0||current.rfind(L"data:text/html",0)==0)SetTimer(windowHandle,73,lifecyclePreview?1200:450,nullptr);}execute(success?"window.BiliSpace?.setLoading(false)":"window.BiliSpace?.setLoading(false,true)");log(success?"navigation completed":"navigation failed");return S_OK;});webview->add_NavigationCompleted(ready,&token);ready->Release();
            auto injected=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([resumeUrl](HRESULT hr,LPCWSTR id){if(SUCCEEDED(hr)){injectionId=id;if(loadRequiredUpdate()){showRequiredUpdate();return S_OK;}std::wstring target=testing?L"https://bili-space.local/fixture.html":L"https://www.bilibili.com/";if(!testing&&trusted(resumeUrl))target=resumeUrl;log("initial navigate: "+utf8(target));if(testing&&!lifecyclePreview)webview->Navigate(target.c_str());else{startupTarget=target;auto splash=read(root/L"assets/startup.html");if(config.value("theme",std::string("dark"))!="system")splash+=config.value("theme",std::string("dark"))=="light"?"<style>body{background:#fafafa}p{color:#202024}</style>":"<style>body{background:#161618}p{color:#eeeef0}</style>";webview->NavigateToString(wide(splash).c_str());SetTimer(windowHandle,73,2500,nullptr);}if(!testing)AddClipboardFormatListener(windowHandle);}else{log("initial injection failed");DestroyWindow(windowHandle);}return S_OK;});
            webview->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),injected);injected->Release();return S_OK;
        });env->CreateCoreWebView2Controller(windowHandle,h);h->Release();return S_OK;
    });
    auto hr=create(nullptr,(dataPath/L"WebView2").c_str(),nullptr,envHandler);envHandler->Release();
    if(FAILED(hr)){log("environment start failed: "+std::to_string(hr));DestroyWindow(windowHandle);return 2;}
    MSG msg;while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}CoUninitialize();return 0;
}

