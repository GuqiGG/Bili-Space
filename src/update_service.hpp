#pragma once
#include "update_policy.hpp"
constexpr UINT updateReplyMessage=WM_APP+82;
bool updateRequired=false,updateChecked=false,updateBusy=false,updateGateShown=false,updateGateNavigationPending=false;
json updateState={{"status","idle"},{"message","尚未检查更新"}};
std::string ignoredUpdateVersion;
fs::path readyUpdatePackage;
bool updateGateOrigin(const std::wstring& uri){return updateGateShown&&(uri==L"about:blank"||uri.rfind(L"data:text/html;charset=utf-8;base64,",0)==0);}
std::string updateFileHash(const fs::path& file);
#ifdef BILI_UPDATE_TEST
INTERNET_PORT updateTestPort=0;
#endif
json appInfo(){return {{"name","Bili-Space"},{"version",appVersion},{"author",appAuthor},{"updateUrl","https://bili.gvqi.top/updates/windows-x64.json"}};}
void updateLog(const std::string& message){
    try{fs::create_directories(dataPath/L"updates");SYSTEMTIME t{};GetSystemTime(&t);char stamp[32];snprintf(stamp,sizeof(stamp),"%04d-%02d-%02dT%02d:%02d:%02dZ",t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond);std::ofstream(dataPath/L"updates/update.log",std::ios::app|std::ios::binary)<<stamp<<" "<<message<<'\n';}catch(...){}
}
void saveUpdateJson(const fs::path& file,const json& value){auto tmp=file;tmp+=L".tmp";{std::ofstream f(tmp,std::ios::binary);f<<value.dump(2);if(!f)throw std::runtime_error("无法保存更新状态");}if(!MoveFileExW(tmp.c_str(),file.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法写入更新状态");}
void pushUpdateState(){execute("window.BiliSpace?.acceptUpdateStatus("+updateState.dump()+");window.renderUpdate?.("+updateState.dump()+")");}
void showRequiredUpdate(){
    if(!webview||updateGateShown)return;updateGateShown=true;startupTarget.clear();KillTimer(windowHandle,73);cancelDownload();execute("document.querySelectorAll('video,audio').forEach(v=>v.pause())");
    auto html=read(root/L"assets/update-required.html"),payload=updateState.dump();size_t pos=0;while((pos=payload.find('<',pos))!=std::string::npos){payload.replace(pos,1,"\\u003c");pos+=6;}
    html+="<script>renderUpdate("+payload+");</script>";
    surfaceWaiting=false;KillTimer(windowHandle,75);KillTimer(windowHandle,76);if(controller)controller->put_IsVisible(TRUE);updateGateNavigationPending=true;webview->NavigateToString(wide(html).c_str());
}
bool loadRequiredUpdate(){
    try{fs::create_directories(dataPath/L"updates");try{ignoredUpdateVersion=json::parse(read(dataPath/L"updates/preferences.json")).value("ignoredVersion",std::string{});}catch(...){}
        auto value=validateUpdate(json::parse(read(dataPath/L"updates/required.json")),appVersion);if(value["required"]==true){updateState=value;updateState["status"]="required";updateState["message"]="此版本已停止支持，请更新后继续使用";updateRequired=true;return true;}
        std::error_code ec;fs::remove(dataPath/L"updates/required.json",ec);
    }catch(...){}return false;
}
void updateReply(json result){auto p=new json(std::move(result));if(!PostMessageW(windowHandle,updateReplyMessage,0,reinterpret_cast<LPARAM>(p)))delete p;}
struct UpdateHttp{
    HINTERNET session{},connection{},request{};
    ~UpdateHttp(){if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);}
    void open(const std::string& url){
        const std::string manifest="https://bili.gvqi.top/updates/windows-x64.json";if(url!=manifest&&url!="https://raw.githubusercontent.com/GuqiGG/Bili-Space/master/update-site/public/updates/windows-x64.json"&&!trustedUpdatePackage(url)&&!std::regex_match(url,std::regex(R"(https://github\.com/GuqiGG/Bili-Space/releases/download/v[0-9]+\.[0-9]+\.[0-9]+/Bili-Space-[0-9]+\.[0-9]+\.[0-9]+-Setup\.exe)")))throw std::runtime_error("更新地址不可信");
        session=WinHttpOpen(L"Bili-Space/0.1.40",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);if(!session)throw std::runtime_error("更新网络初始化失败");WinHttpSetTimeouts(session,5000,5000,15000,15000);
        std::wstring next=wide(url);
        for(int hop=0;hop<6;hop++){
            URL_COMPONENTS u{};u.dwStructSize=sizeof(u);u.dwHostNameLength=DWORD(-1);u.dwUrlPathLength=DWORD(-1);u.dwExtraInfoLength=DWORD(-1);u.dwUserNameLength=DWORD(-1);u.dwPasswordLength=DWORD(-1);
            if(!WinHttpCrackUrl(next.c_str(),0,0,&u)||u.nScheme!=INTERNET_SCHEME_HTTPS||u.nPort!=443||u.dwUserNameLength||u.dwPasswordLength)throw std::runtime_error("更新重定向不可信");
            std::wstring host(u.lpszHostName,u.dwHostNameLength),path(u.lpszUrlPath,u.dwUrlPathLength);if(u.dwExtraInfoLength)path.append(u.lpszExtraInfo,u.dwExtraInfoLength);
            if(host!=L"bili.gvqi.top"&&host!=L"raw.githubusercontent.com"&&host!=L"github.com"&&host!=L"release-assets.githubusercontent.com")throw std::runtime_error("更新重定向主机不可信");
            INTERNET_PORT port=443;DWORD flags=WINHTTP_FLAG_SECURE;
#ifdef BILI_UPDATE_TEST
            if(updateTestPort){host=L"127.0.0.1";port=updateTestPort;flags=0;}
#endif
            connection=WinHttpConnect(session,host.c_str(),port,0);if(connection)request=WinHttpOpenRequest(connection,L"GET",path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,flags);if(!request)throw std::runtime_error("更新连接失败");
            DWORD redirects=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirects,sizeof(redirects));
            if(!WinHttpSendRequest(request,L"Cache-Control: no-cache\r\n",DWORD(-1),nullptr,0,0,0)||!WinHttpReceiveResponse(request,nullptr))throw std::runtime_error("无法连接更新服务器");
            DWORD code{},n=sizeof(code);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&code,&n,nullptr))throw std::runtime_error("更新响应无效");
            if(code==200)return;
            if(code!=301&&code!=302&&code!=303&&code!=307&&code!=308)throw std::runtime_error("更新服务器返回 HTTP "+std::to_string(code));
            DWORD size=0;WinHttpQueryHeaders(request,WINHTTP_QUERY_LOCATION,nullptr,nullptr,&size,nullptr);if(!size||size>16384)throw std::runtime_error("更新重定向无效");
            std::vector<wchar_t> location(size/sizeof(wchar_t)+1);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_LOCATION,nullptr,location.data(),&size,nullptr))throw std::runtime_error("更新重定向无效");next=location.data();
            WinHttpCloseHandle(request);request=nullptr;WinHttpCloseHandle(connection);connection=nullptr;
        }
        throw std::runtime_error("更新重定向次数过多");
    }
    void stream(unsigned long long limit,const std::function<void(const char*,DWORD)>& write){char buffer[65536];DWORD n{};unsigned long long count=0;auto start=GetTickCount64();while(true){if(GetTickCount64()-start>30ULL*60*1000)throw std::runtime_error("更新下载超时");if(!WinHttpReadData(request,buffer,sizeof(buffer),&n))throw std::runtime_error("更新数据读取失败");if(!n)break;count+=n;if(count>limit)throw std::runtime_error("更新数据超过声明大小");write(buffer,n);}}
};
struct UpdateHash{
    BCRYPT_ALG_HANDLE alg{};BCRYPT_HASH_HANDLE hash{};std::vector<unsigned char> object;
    ~UpdateHash(){if(hash)BCryptDestroyHash(hash);if(alg)BCryptCloseAlgorithmProvider(alg,0);}
    void start(){DWORD size{},n{};if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0||BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&size),sizeof(size),&n,0)<0)throw std::runtime_error("SHA256 初始化失败");object.resize(size);if(BCryptCreateHash(alg,&hash,object.data(),size,nullptr,0,0)<0)throw std::runtime_error("SHA256 初始化失败");}
    void add(const char* p,DWORD n){if(BCryptHashData(hash,reinterpret_cast<PUCHAR>(const_cast<char*>(p)),n,0)<0)throw std::runtime_error("SHA256 校验失败");}
    std::string finish(){unsigned char digest[32];if(BCryptFinishHash(hash,digest,32,0)<0)throw std::runtime_error("SHA256 校验失败");std::string result;const char hex[]="0123456789abcdef";for(auto b:digest){result+=hex[b>>4];result+=hex[b&15];}return result;}
};
void startUpdateCheck(){
    if(updateBusy)return;updateBusy=true;updateChecked=true;updateState["busy"]=true;updateState["message"]="正在检查更新…";pushUpdateState();updateLog("check started");
    std::thread([]{try{
        json selected;std::string error;bool requiredByAnySource=false;
        for(auto url:{"https://bili.gvqi.top/updates/windows-x64.json","https://raw.githubusercontent.com/GuqiGG/Bili-Space/master/update-site/public/updates/windows-x64.json"}){
            try{UpdateHttp http;http.open(url);std::string bytes;http.stream(256*1024,[&](const char* p,DWORD n){bytes.append(p,n);});auto candidate=validateUpdate(json::parse(bytes),appVersion);requiredByAnySource=requiredByAnySource||candidate.value("required",false);
                if(selected.is_null()||releaseVersion(candidate.at("version"))>releaseVersion(selected.at("version")))selected=candidate;
                else if(candidate.at("version")==selected.at("version")&&!selected.contains("setupUrl")&&candidate.contains("setupUrl")){for(auto key:{"setupUrl","setupSize","setupSha256"})selected[key]=candidate[key];}
            }catch(const std::exception& e){error=e.what();}
        }
        if(selected.is_null())throw std::runtime_error(error.empty()?"更新服务器不可用":error);
        if(requiredByAnySource&&selected.value("available",false)){selected["required"]=true;selected["force"]=true;}
        selected["ready"]=false;
        if(selected.value("available",false)&&selected.contains("setupUrl"))try{
            auto package=dataPath/L"updates"/wide("Bili-Space-"+selected.at("version").get<std::string>()+"-Setup.exe");
            if(fs::is_regular_file(package)&&fs::file_size(package)==selected.at("setupSize").get<unsigned long long>()&&updateFileHash(package)==selected.at("setupSha256").get<std::string>())selected["ready"]=true;
        }catch(...){}
        updateReply({{"event","checked"},{"manifest",selected}});
    }catch(const std::exception& e){updateReply({{"event","error"},{"message",e.what()}});}}).detach();
}
void startUpdateDownload(){
    if(updateBusy||!updateState.value("available",false))return;if(!updateState.contains("setupUrl")){updateState["message"]="此更新源尚未提供软件内安装包，请稍后重新检查";pushUpdateState();return;}auto manifest=updateState;updateBusy=true;updateState["busy"]=true;updateState["message"]="正在下载更新包并校验 SHA256…";pushUpdateState();updateLog("download started "+manifest.value("version",std::string{}));
    std::thread([manifest]{fs::path part;try{
        fs::create_directories(dataPath/L"updates");auto target=dataPath/L"updates"/wide("Bili-Space-"+manifest.at("version").get<std::string>()+"-Setup.exe");part=target;part+=L".part";UpdateHttp http;http.open(manifest.at("setupUrl").get<std::string>());UpdateHash hash;hash.start();unsigned long long count=0,expected=manifest.at("setupSize").get<unsigned long long>();auto last=GetTickCount64();
        {std::ofstream out(part,std::ios::binary|std::ios::trunc);if(!out)throw std::runtime_error("无法创建更新包文件");http.stream(expected,[&](const char* p,DWORD n){out.write(p,n);if(!out)throw std::runtime_error("写入更新包失败");hash.add(p,n);count+=n;if(GetTickCount64()-last>=400){last=GetTickCount64();updateReply({{"event","progress"},{"message","下载更新包 "+std::to_string(count*100/expected)+"%"}});}});}
        if(count!=expected||hash.finish()!=manifest.at("setupSha256").get<std::string>())throw std::runtime_error("更新包大小或 SHA256 不匹配，已拒绝使用");
        if(!MoveFileExW(part.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存更新包");updateReply({{"event","ready"},{"path",utf8(target.wstring())}});
    }catch(const std::exception& e){std::error_code ec;if(!part.empty())fs::remove(part,ec);updateReply({{"event","error"},{"message",e.what()}});}}).detach();
}
void acceptUpdate(const json& reply){
    const auto event=reply.value("event",std::string{});if(event=="progress"){updateState["message"]=reply.value("message",std::string{});pushUpdateState();return;}
    updateBusy=false;updateState["busy"]=false;
    if(event=="checked"){
        auto value=reply.at("manifest");bool required=value.at("required").get<bool>();
        try{if(required)saveUpdateJson(dataPath/L"updates/required.json",value);else{std::error_code ec;fs::remove(dataPath/L"updates/required.json",ec);}}catch(const std::exception& e){updateLog(e.what());}
        const bool wasRequired=updateRequired;updateRequired=required;readyUpdatePackage.clear();updateState=value;updateState["busy"]=false;updateState["ignored"]=!required&&value["version"]==ignoredUpdateVersion;
        updateState["status"]=required?"required":value["available"]==true?"available":"current";
        updateState["message"]=required?"必须更新后才能继续使用":value["available"]==true?(updateState["ignored"]==true?"已忽略此版本，可手动下载":"发现新版本"):"当前已是最新版本";
        if(value.value("ready",false)&&value.value("available",false)){readyUpdatePackage=dataPath/L"updates"/wide("Bili-Space-"+value.at("version").get<std::string>()+"-Setup.exe");updateState["message"]="更新已就绪，点击安装并重启。";}
        updateLog(std::string(required?"required ":"checked ")+value.at("version").get<std::string>());if(required)showRequiredUpdate();else if(wasRequired){updateGateShown=false;if(webview)webview->Navigate(L"https://www.bilibili.com/");}
    }else if(event=="ready"){readyUpdatePackage=wide(reply.at("path").get<std::string>());updateState["ready"]=true;updateState["message"]="更新已就绪，点击安装并重启。";updateLog("download verified "+utf8(readyUpdatePackage.filename().wstring()));}
    else{updateState["message"]=reply.value("message",std::string("更新失败"));updateState["status"]=updateRequired?"required":"error";updateLog("error "+updateState["message"].get<std::string>());}
    pushUpdateState();
}
#include "update_install.hpp"
void updateAction(const std::string& action){
    if(action=="status"){
        if(!updateChecked)try{auto result=json::parse(read(dataPath/L"updates/install-result.json"));if(!result.value("success",false))updateState["message"]="上次更新未完成："+result.value("message",std::string{});}catch(...){}
        pushUpdateState();if(!updateChecked&&!testing)startUpdateCheck();
    }
    else if(action=="check")startUpdateCheck();
    else if(action=="download")startUpdateDownload();
    else if(action=="ignore"&&!updateRequired&&!updateBusy&&updateState.value("available",false)){ignoredUpdateVersion=updateState.at("version").get<std::string>();try{saveUpdateJson(dataPath/L"updates/preferences.json",{{"ignoredVersion",ignoredUpdateVersion}});updateState["ignored"]=true;updateState["message"]="已忽略此版本，后续新版本仍会提醒";updateLog("ignored "+ignoredUpdateVersion);}catch(...){updateState["message"]="保存忽略设置失败";}pushUpdateState();}
    else if(action=="install")startUpdateInstall();
    else if(action=="log"){updateLog("log viewed");ShellExecuteW(windowHandle,L"open",(dataPath/L"updates/update.log").c_str(),nullptr,nullptr,SW_SHOWNORMAL);}
    else if(action=="exit")PostMessageW(windowHandle,WM_CLOSE,0,0);
}
