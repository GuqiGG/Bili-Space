#pragma once
// Full access for plugins that ask for it (`// @grant native` or "grant": "native") and that the user approved when
// importing them: HTTP to any address, files anywhere, running programs, opening files or links, and secrets kept with
// Windows' own encryption. Every request runs on a worker thread; its answer goes back to the page views by request id.
constexpr UINT pluginReplyMessage=WM_APP+171;
inline json& nativeApprovals(){if(!pluginData.contains("__native")||!pluginData["__native"].is_array())pluginData["__native"]=json::array();return pluginData["__native"];}
inline bool nativeApproved(const std::string& id){for(const auto& v:nativeApprovals())if(v.is_string()&&v.get<std::string>()==id)return true;return false;}
inline void nativeApprove(const std::string& id,bool on){
    json next=json::array();for(const auto& v:nativeApprovals())if(v.is_string()&&v.get<std::string>()!=id)next.push_back(v);
    if(on)next.push_back(id);pluginData["__native"]=next;
}
// Plugins that look malicious are not run at all. This catches the common, obvious forms (it is a filter, not a proof
// of safety): commands that wreck the system or hide themselves, credential and wallet theft, reading this client's own
// account data, miners, and code hidden behind decoding.
struct RiskRule{const char* pattern;const char* reason;};
inline const std::vector<std::pair<std::regex,std::string>>& riskRules(){
    static const std::vector<std::pair<std::regex,std::string>> rules=[]{
        const RiskRule list[]={
            {R"(powershell[^\n]{0,80}\s-(e|en|enc|encodedcommand)\s)","运行加密隐藏的 PowerShell 命令"},
            {R"(vssadmin\s+delete|wbadmin\s+delete|bcdedit\s|cipher\s+/w|\bformat\s+[a-z]:)","删除系统备份或破坏磁盘"},
            {R"(start menu\\{1,2}programs\\{1,2}startup|currentversion\\{1,2}run|schtasks(\.exe)?\s+/create|\breg(\.exe)?\s+add\b)","把自己加入开机自启或计划任务"},
            {R"(login data|\\{1,2}cookies\b|network\\{1,2}cookies|local state|key4\.db|logins\.json|wallet\.dat|metamask|\\{1,2}\.ssh\\{1,2}|id_rsa)","读取浏览器密码、Cookie、钱包或 SSH 密钥"},
            {R"(accounts50\.json|plugin-secrets|betterbilispace\\{1,2}settings\.json)","读取客户端的账号数据或其他插件的密钥"},
            {R"(stratum\+tcp|coinhive|xmrig|cryptonight|minexmr)","挖矿"},
            {R"((eval|new\s+function|function)\s*\(\s*(atob|unescape|decodeuricomponent)\s*\()","执行解码后隐藏的代码"},
            {R"((rm\s+-rf|rd\s+/s|rmdir\s+/s|del\s+/[sqf]).{0,40}(c:\\{1,2}|%userprofile%|\\{1,2}users\\{1,2}))","删除整个磁盘或用户文件夹"},
        };
        std::vector<std::pair<std::regex,std::string>> out;for(const auto& r:list)out.emplace_back(std::regex(r.pattern,std::regex::icase|std::regex::optimize),r.reason);return out;}();
    return rules;
}
inline std::string lowerAscii(std::string s){for(auto& c:s)if(c>='A'&&c<='Z')c=char(c-'A'+'a');return s;}
// Returns why a plugin is refused, or an empty string.
inline std::string pluginRisk(const std::string& code){
    const auto text=lowerAscii(code);
    for(const auto& [pattern,reason]:riskRules())if(std::regex_search(text,pattern))return reason;
    // A very long run of base64-looking text is how payloads are usually smuggled in.
    size_t run=0;for(char c:code){if(isalnum(static_cast<unsigned char>(c))||c=='+'||c=='/'||c=='='){if(++run>40000)return "包含大段经过编码隐藏的内容";}else run=0;}
    return {};
}
// Checked again when a granted plugin actually acts, so what slipped past the code check still cannot do these.
inline void nativeGuard(const std::string& op,const json& a){
    auto deny=[](const std::string& why){throw std::runtime_error("已拦截危险操作："+why);};
    if(op=="exec"){std::string line=a.value("file",std::string{});if(a.contains("args")&&a["args"].is_array())for(const auto& v:a["args"])if(v.is_string())line+=" "+v.get<std::string>();
        line=lowerAscii(line);for(const auto& [pattern,reason]:riskRules())if(std::regex_search(line,pattern))deny(reason);}
    if(op=="readFile"||op=="writeFile"||op=="remove"||op=="list"){
        const auto raw=a.value("path",std::string{});std::error_code ec;auto full=fs::absolute(fs::path(wide(raw)),ec);if(ec)full=fs::path(wide(raw));
        const auto p=lowerAscii(utf8(full.lexically_normal().wstring()));
        const auto own=lowerAscii(utf8(dataPath.wstring()));
        if(op!="list"&&(p.find("\\login data")!=std::string::npos||p.find("\\cookies")!=std::string::npos||p.find("\\local state")!=std::string::npos||p.find("\\.ssh\\")!=std::string::npos||p.find("wallet")!=std::string::npos))deny("访问浏览器密码、Cookie、钱包或密钥文件");
        if(op!="list"&&p.rfind(own,0)==0&&p.find("\\plugin-files\\")==std::string::npos)deny("访问客户端自己的账号和设置数据");
        if(op=="writeFile"&&(p.find("\\start menu\\programs\\startup")!=std::string::npos||p.find(":\\windows\\")!=std::string::npos||p.find("\\system32\\")!=std::string::npos))deny("写入开机启动目录或系统目录");
        if(op=="remove"){size_t depth=0;for(const auto& part:full.lexically_normal())if(!part.empty()&&part!=full.root_path()&&part.wstring()!=L"\\")depth++;
            if(depth<3||p.find(":\\windows")!=std::string::npos||p.find("\\program files")!=std::string::npos)deny("删除整个磁盘、用户文件夹或系统文件夹");}
    }
}
inline std::string base64Encode(const std::string& bytes){
    if(bytes.empty())return {};DWORD n=0;CryptBinaryToStringA(reinterpret_cast<const BYTE*>(bytes.data()),DWORD(bytes.size()),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&n);
    std::string out(n,'\0');CryptBinaryToStringA(reinterpret_cast<const BYTE*>(bytes.data()),DWORD(bytes.size()),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,out.data(),&n);out.resize(n);return out;
}
inline std::string base64Decode(const std::string& text){
    if(text.empty())return {};DWORD n=0;if(!CryptStringToBinaryA(text.c_str(),DWORD(text.size()),CRYPT_STRING_BASE64,nullptr,&n,nullptr,nullptr))throw std::runtime_error("base64 无效");
    std::string out(n,'\0');CryptStringToBinaryA(text.c_str(),DWORD(text.size()),CRYPT_STRING_BASE64,reinterpret_cast<BYTE*>(out.data()),&n,nullptr,nullptr);out.resize(n);return out;
}
// One HTTP(S) request to any address (redirects followed); the body comes back as text or base64.
inline json nativeHttp(const json& a){
    const auto url=wide(a.value("url",std::string{}));const auto method=wide(a.value("method",std::string("GET")));const auto body=a.value("body",std::string{});
    const int timeout=std::clamp(a.value("timeout",60000),1000,600000);
    URL_COMPONENTS u{};u.dwStructSize=sizeof(u);u.dwHostNameLength=DWORD(-1);u.dwUrlPathLength=DWORD(-1);u.dwExtraInfoLength=DWORD(-1);
    if(!WinHttpCrackUrl(url.c_str(),0,0,&u)||(u.nScheme!=INTERNET_SCHEME_HTTPS&&u.nScheme!=INTERNET_SCHEME_HTTP))throw std::runtime_error("地址无效（只支持 http/https）");
    std::wstring host(u.lpszHostName,u.dwHostNameLength),path(u.lpszUrlPath,u.dwUrlPathLength);if(u.dwExtraInfoLength)path.append(u.lpszExtraInfo,u.dwExtraInfoLength);if(path.empty())path=L"/";
    struct Handles{HINTERNET s{},c{},r{};~Handles(){if(r)WinHttpCloseHandle(r);if(c)WinHttpCloseHandle(c);if(s)WinHttpCloseHandle(s);}}h;
    h.s=WinHttpOpen(L"Bili-Space plugin",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);if(!h.s)throw std::runtime_error("网络初始化失败");
    WinHttpSetTimeouts(h.s,timeout,timeout,timeout,timeout);
    h.c=WinHttpConnect(h.s,host.c_str(),u.nPort,0);if(!h.c)throw std::runtime_error("无法连接 "+utf8(host));
    h.r=WinHttpOpenRequest(h.c,method.c_str(),path.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,u.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);if(!h.r)throw std::runtime_error("无法创建请求");
    std::wstring headers;if(a.contains("headers")&&a["headers"].is_object())for(auto& [k,v]:a["headers"].items())if(v.is_string()&&k.find_first_of("\r\n:")==std::string::npos&&v.get<std::string>().find_first_of("\r\n")==std::string::npos)headers+=wide(k)+L": "+wide(v.get<std::string>())+L"\r\n";
    if(!WinHttpSendRequest(h.r,headers.empty()?WINHTTP_NO_ADDITIONAL_HEADERS:headers.c_str(),headers.empty()?0:DWORD(-1L),body.empty()?WINHTTP_NO_REQUEST_DATA:const_cast<char*>(body.data()),DWORD(body.size()),DWORD(body.size()),0)||!WinHttpReceiveResponse(h.r,nullptr))
        throw std::runtime_error("请求失败（错误 "+std::to_string(GetLastError())+"）");
    DWORD status=0,size=sizeof(status);WinHttpQueryHeaders(h.r,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&status,&size,WINHTTP_NO_HEADER_INDEX);
    DWORD hsize=0;WinHttpQueryHeaders(h.r,WINHTTP_QUERY_RAW_HEADERS_CRLF,WINHTTP_HEADER_NAME_BY_INDEX,WINHTTP_NO_OUTPUT_BUFFER,&hsize,WINHTTP_NO_HEADER_INDEX);
    std::wstring raw(hsize/sizeof(wchar_t),L'\0');if(hsize)WinHttpQueryHeaders(h.r,WINHTTP_QUERY_RAW_HEADERS_CRLF,WINHTTP_HEADER_NAME_BY_INDEX,raw.data(),&hsize,WINHTTP_NO_HEADER_INDEX);
    std::string data;for(;;){DWORD available=0;if(!WinHttpQueryDataAvailable(h.r,&available)||!available)break;if(data.size()+available>64u*1024*1024)throw std::runtime_error("响应超过 64 MB");
        const auto at=data.size();data.resize(at+available);DWORD got=0;if(!WinHttpReadData(h.r,data.data()+at,available,&got))break;data.resize(at+got);}
    const bool binary=a.value("responseType",std::string("text"))=="base64";
    return {{"status",status},{"headers",utf8(raw.c_str())},{binary?"base64":"text",binary?base64Encode(data):data}};
}
inline fs::path nativePath(const json& a,const char* key="path"){const auto p=a.value(key,std::string{});if(p.empty())throw std::runtime_error("缺少路径");return fs::path(wide(p));}
inline json nativeFiles(const std::string& op,const json& a){
    std::error_code ec;
    if(op=="readFile"){const auto p=nativePath(a);if(fs::file_size(p,ec)>256u*1024*1024)throw std::runtime_error("文件超过 256 MB");std::ifstream f(p,std::ios::binary);if(!f)throw std::runtime_error("无法读取文件");
        std::string bytes((std::istreambuf_iterator<char>(f)),std::istreambuf_iterator<char>());return a.value("encoding",std::string("utf8"))=="base64"?json{{"base64",base64Encode(bytes)}}:json{{"text",bytes}};}
    if(op=="writeFile"){const auto p=nativePath(a);if(p.has_parent_path())fs::create_directories(p.parent_path(),ec);
        const auto bytes=a.value("encoding",std::string("utf8"))=="base64"?base64Decode(a.value("data",std::string{})):a.value("data",std::string{});
        HANDLE h=CreateFileW(p.c_str(),a.value("append",false)?FILE_APPEND_DATA:GENERIC_WRITE,FILE_SHARE_READ,nullptr,a.value("append",false)?OPEN_ALWAYS:CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);
        if(h==INVALID_HANDLE_VALUE){const DWORD e=GetLastError();throw std::runtime_error(std::string("无法写入文件（错误 ")+std::to_string(e)+(e==5?"：没有权限，可能被系统的受控文件夹访问拦截":"")+"）");}
        DWORD written=0;const BOOL ok=bytes.empty()||WriteFile(h,bytes.data(),DWORD(bytes.size()),&written,nullptr);CloseHandle(h);if(!ok)throw std::runtime_error("写入文件失败（错误 "+std::to_string(GetLastError())+"）");return {{"bytes",bytes.size()}};}
    if(op=="list"){json items=json::array();for(auto& e:fs::directory_iterator(nativePath(a),ec)){if(items.size()>=5000)break;std::error_code e2;items.push_back({{"name",utf8(e.path().filename().wstring())},{"dir",e.is_directory(e2)},{"size",e.is_regular_file(e2)?double(e.file_size(e2)):0.0}});}
        if(ec)throw std::runtime_error("无法列出目录："+ec.message());return items;}
    if(op=="exists"){const auto p=nativePath(a);return {{"exists",fs::exists(p,ec)},{"dir",fs::is_directory(p,ec)}};}
    if(op=="mkdir"){fs::create_directories(nativePath(a),ec);if(ec)throw std::runtime_error("无法创建目录："+ec.message());return true;}
    if(op=="remove"){const auto n=fs::remove_all(nativePath(a),ec);if(ec)throw std::runtime_error("无法删除："+ec.message());return {{"removed",double(n)}};}
    throw std::runtime_error("未知操作");
}
// Runs a program (no console window), feeding it input and collecting what it prints.
inline json nativeExec(const json& a){
    auto quote=[](const std::wstring& s){if(!s.empty()&&s.find_first_of(L" \t\"")==std::wstring::npos)return s;std::wstring q=L"\"";size_t slashes=0;
        for(wchar_t c:s){if(c==L'\\'){slashes++;continue;}if(c==L'"'){q.append(slashes*2+1,L'\\');q+=c;}else{q.append(slashes,L'\\');q+=c;}slashes=0;}q.append(slashes*2,L'\\');return q+L"\"";};
    std::wstring line=quote(wide(a.value("file",std::string{})));if(line==L"\"\"")throw std::runtime_error("缺少程序");
    if(a.contains("args")&&a["args"].is_array())for(const auto& v:a["args"])if(v.is_string())line+=L" "+quote(wide(v.get<std::string>()));
    SECURITY_ATTRIBUTES sa{sizeof(sa),nullptr,TRUE};HANDLE outR{},outW{},errR{},errW{},inR{},inW{};
    CreatePipe(&outR,&outW,&sa,0);CreatePipe(&errR,&errW,&sa,0);CreatePipe(&inR,&inW,&sa,DWORD(std::clamp<size_t>(a.value("input",std::string{}).size()+1,4096,64u*1024*1024)));SetHandleInformation(outR,HANDLE_FLAG_INHERIT,0);SetHandleInformation(errR,HANDLE_FLAG_INHERIT,0);SetHandleInformation(inW,HANDLE_FLAG_INHERIT,0);
    STARTUPINFOW si{sizeof(si)};si.dwFlags=STARTF_USESTDHANDLES;si.hStdOutput=outW;si.hStdError=errW;si.hStdInput=inR;PROCESS_INFORMATION pi{};
    const auto cwd=wide(a.value("cwd",std::string{}));
    const BOOL ok=CreateProcessW(nullptr,line.data(),nullptr,nullptr,TRUE,CREATE_NO_WINDOW|CREATE_UNICODE_ENVIRONMENT,nullptr,cwd.empty()?nullptr:cwd.c_str(),&si,&pi);
    CloseHandle(outW);CloseHandle(errW);CloseHandle(inR);
    if(!ok){CloseHandle(outR);CloseHandle(errR);CloseHandle(inW);throw std::runtime_error("无法启动程序（错误 "+std::to_string(GetLastError())+"）");}
    const auto input=a.value("input",std::string{});std::thread feed([inW,input]{DWORD w=0;if(!input.empty())WriteFile(inW,input.data(),DWORD(input.size()),&w,nullptr);CloseHandle(inW);});
    // Output is polled rather than read to the end: a program that starts something in the background (which keeps the
    // pipes open) must not leave this request waiting forever once the program itself has finished.
    std::string out,err;auto pull=[](HANDLE h,std::string& sink){DWORD available=0;while(PeekNamedPipe(h,nullptr,0,nullptr,&available,nullptr)&&available){char buffer[8192];DWORD n=0;if(!ReadFile(h,buffer,std::min<DWORD>(available,sizeof(buffer)),&n,nullptr)||!n)break;if(sink.size()<32u*1024*1024)sink.append(buffer,n);available=0;}};
    const DWORD timeout=DWORD(std::clamp(a.value("timeout",120000),100,3600000));const ULONGLONG started=GetTickCount64();bool timedOut=false;
    for(;;){pull(outR,out);pull(errR,err);const DWORD state=WaitForSingleObject(pi.hProcess,15);
        if(state==WAIT_OBJECT_0){pull(outR,out);pull(errR,err);break;}
        if(GetTickCount64()-started>timeout){timedOut=true;TerminateProcess(pi.hProcess,1);WaitForSingleObject(pi.hProcess,2000);pull(outR,out);pull(errR,err);break;}}
    DWORD code=0;GetExitCodeProcess(pi.hProcess,&code);CloseHandle(outR);CloseHandle(errR);feed.join();CloseHandle(pi.hThread);CloseHandle(pi.hProcess);
    return {{"code",code},{"stdout",out},{"stderr",err},{"timedOut",timedOut}};
}
// Secrets (API keys and the like) for one plugin, encrypted for the current Windows user.
inline fs::path secretsFile(const std::string& id){return dataPath/L"plugin-secrets"/(wide(id)+L".bin");}
inline json readSecrets(const std::string& id){
    const auto bytes=read(secretsFile(id));if(bytes.empty())return json::object();
    DATA_BLOB in{DWORD(bytes.size()),reinterpret_cast<BYTE*>(const_cast<char*>(bytes.data()))},out{};if(!CryptUnprotectData(&in,nullptr,nullptr,nullptr,nullptr,0,&out))return json::object();
    std::string text(reinterpret_cast<char*>(out.pbData),out.cbData);LocalFree(out.pbData);try{auto j=json::parse(text);return j.is_object()?j:json::object();}catch(...){return json::object();}
}
inline void writeSecrets(const std::string& id,const json& values){
    auto text=values.dump();DATA_BLOB in{DWORD(text.size()),reinterpret_cast<BYTE*>(text.data())},out{};if(!CryptProtectData(&in,L"Bili-Space plugin",nullptr,nullptr,nullptr,0,&out))throw std::runtime_error("无法加密保存");
    std::error_code ec;fs::create_directories(secretsFile(id).parent_path(),ec);std::ofstream f(secretsFile(id),std::ios::binary);f.write(reinterpret_cast<char*>(out.pbData),out.cbData);LocalFree(out.pbData);if(!f)throw std::runtime_error("无法保存");
}
inline json nativeRun(const std::string& id,const std::string& op,const json& a){
    nativeGuard(op,a);
    if(op=="http")return nativeHttp(a);
    if(op=="exec")return nativeExec(a);
    if(op=="open"){const auto target=wide(a.value("target",std::string{}));if(target.empty())throw std::runtime_error("缺少目标");if(reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",target.c_str(),nullptr,nullptr,SW_SHOWNORMAL))<=32)throw std::runtime_error("无法打开");return true;}
    // Requests run on their own threads: secret read-modify-write is serialized so two saves cannot drop one another.
    static std::mutex secretsMutex;
    if(op=="secretGet"){std::lock_guard<std::mutex> lock(secretsMutex);const auto all=readSecrets(id);const auto key=a.value("key",std::string{});return all.contains(key)?all[key]:json();}
    if(op=="secretSet"){std::lock_guard<std::mutex> lock(secretsMutex);auto all=readSecrets(id);const auto key=a.value("key",std::string{});if(key.empty()||key.size()>80)throw std::runtime_error("名字无效");if(a.contains("value")&&!a["value"].is_null())all[key]=a["value"];else all.erase(key);writeSecrets(id,all);return true;}
    if(op=="paths"){PWSTR p{};std::string downloads,home;if(SUCCEEDED(SHGetKnownFolderPath(FOLDERID_Downloads,0,nullptr,&p)))downloads=utf8(p);CoTaskMemFree(p);p=nullptr;if(SUCCEEDED(SHGetKnownFolderPath(FOLDERID_Profile,0,nullptr,&p)))home=utf8(p);CoTaskMemFree(p);
        wchar_t temp[MAX_PATH]{};GetTempPathW(MAX_PATH,temp);std::error_code ec;const auto own=dataPath/L"plugin-files"/wide(id);fs::create_directories(own,ec);
        return {{"data",utf8(own.wstring())},{"downloads",downloads},{"home",home},{"temp",utf8(temp)}};}
    return nativeFiles(op,a);
}
inline void nativeRequest(const json& m){
    const auto id=m.value("id",std::string{});const auto op=m.value("op",std::string{});const auto request=m.value("request",std::string{});
    if(!pluginIdValid(id)||request.empty()||request.size()>40)return;
    auto reply=[id,request](json result){auto p=new json(std::move(result));(*p)["request"]=request;(*p)["id"]=id;if(!PostMessageW(windowHandle,pluginReplyMessage,0,reinterpret_cast<LPARAM>(p)))delete p;};
    if(!nativeApproved(id)){reply({{"ok",false},{"error","这个插件没有获得完全访问权限"}});return;}
    const json args=m.contains("args")&&m["args"].is_object()?m["args"]:json::object();
    std::thread([id,op,args,reply]{try{reply({{"ok",true},{"result",nativeRun(id,op,args)}});}catch(const std::exception& e){reply({{"ok",false},{"error",e.what()}});}}).detach();
}
inline void nativeReplyArrived(LPARAM lp){
    std::unique_ptr<json> r(reinterpret_cast<json*>(lp));if(!r)return;
    pluginsBroadcast("window.BiliSpacePlugins?.reply?.("+r->dump(-1,' ',false,json::error_handler_t::replace)+","+json(pluginToken()).dump()+")");
}
