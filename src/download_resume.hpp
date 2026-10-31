#pragma once
// Resume checkpoints contain validators and a resource hash, never signed URLs or cookies.
std::string downloadDigest(const std::string& value){
    BCRYPT_ALG_HANDLE alg{};BCRYPT_HASH_HANDLE hash{};DWORD bytes{},size{};std::vector<unsigned char> object(65536),digest(32);
    if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)throw std::runtime_error("无法初始化下载校验");
    auto close=[&]{if(hash)BCryptDestroyHash(hash);if(alg)BCryptCloseAlgorithmProvider(alg,0);};
    if(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,reinterpret_cast<PUCHAR>(&size),sizeof(size),&bytes,0)<0||size>object.size()||BCryptCreateHash(alg,&hash,object.data(),size,nullptr,0,0)<0||BCryptHashData(hash,reinterpret_cast<PUCHAR>(const_cast<char*>(value.data())),ULONG(value.size()),0)<0||BCryptFinishHash(hash,digest.data(),ULONG(digest.size()),0)<0){close();throw std::runtime_error("下载校验失败");}
    close();static const char* hex="0123456789abcdef";std::string out;for(auto b:digest){out+=hex[b>>4];out+=hex[b&15];}return out;
}
std::string downloadResourceIdentity(const std::wstring& url,const std::string& identity={}){
    if(!identity.empty())return downloadDigest(identity);
    URL_COMPONENTS p{sizeof(p)};p.dwUrlPathLength=DWORD(-1);p.dwExtraInfoLength=DWORD(-1);if(!WinHttpCrackUrl(url.c_str(),DWORD(url.size()),0,&p))throw std::runtime_error("下载地址无效");
    // Bilibili media paths include the immutable CID/representation; signed query tokens expire.
    return downloadDigest(utf8(std::wstring(p.lpszUrlPath,p.dwUrlPathLength)));
}
fs::path downloadResumePath(const fs::path& target){auto p=target;p+=L".resume.json";return p;}
void saveDownloadCheckpoint(const fs::path& path,const json& value){
    auto temp=path;temp+=L".tmp";{std::ofstream out(temp,std::ios::binary|std::ios::trunc);out<<value.dump(2);out.flush();if(!out)throw std::runtime_error("无法保存下载断点");}
    if(!MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存下载断点");
}
bool downloadMp4Prefix(const fs::path& file){std::ifstream in(file,std::ios::binary);char head[8]{};in.read(head,8);return in.gcount()==8&&memcmp(head+4,"ftyp",4)==0;}
std::wstring downloadHeader(HINTERNET request,DWORD key){DWORD n=0;WinHttpQueryHeaders(request,key,nullptr,nullptr,&n,nullptr);if(GetLastError()!=ERROR_INSUFFICIENT_BUFFER||n>16384)return {};std::vector<wchar_t> b(n/sizeof(wchar_t)+1);if(!WinHttpQueryHeaders(request,key,nullptr,b.data(),&n,nullptr))return {};return b.data();}
std::wstring downloadCustomHeader(HINTERNET request,const wchar_t* key){DWORD n=0;WinHttpQueryHeaders(request,WINHTTP_QUERY_CUSTOM,key,nullptr,&n,nullptr);if(GetLastError()!=ERROR_INSUFFICIENT_BUFFER||n>16384)return {};std::vector<wchar_t> b(n/sizeof(wchar_t)+1);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_CUSTOM,key,b.data(),&n,nullptr))return {};return b.data();}
struct DownloadSession{
    HINTERNET handle=WinHttpOpen(L"Mozilla/5.0 Bili-Space",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,WINHTTP_FLAG_ASYNC);
    DownloadSession(){if(!handle)throw std::runtime_error("下载连接失败");WinHttpSetTimeouts(handle,10000,15000,30000,30000);}
    ~DownloadSession(){if(handle)WinHttpCloseHandle(handle);}
};
HINTERNET sharedDownloadSession(){static DownloadSession session;return session.handle;}
struct DownloadRange{unsigned long long start{},end{},total{};std::wstring validator,validatorHeader;};
struct DownloadRangeIgnored:std::runtime_error{DownloadRangeIgnored():std::runtime_error("服务器忽略分段请求"){} };
void fetchMediaFile(const std::wstring& url,const fs::path& target,TransferProgress* progress=nullptr,int track=0,const std::string& logicalIdentity={},const DownloadRange* range=nullptr,std::atomic<bool>* groupFailed=nullptr){
    DownloadIo io;if(!io.done||!io.closed)throw std::runtime_error("无法创建下载事件");std::vector<char> buffer(256*1024);
    HINTERNET connection{},request{};bool callbackReady=false;
    auto close=[&]{if(request){WinHttpCloseHandle(request);request=nullptr;if(callbackReady)WaitForSingleObject(io.closed,INFINITE);}if(connection){WinHttpCloseHandle(connection);connection=nullptr;}};
    auto ensure=[&]{checkDownloadCancelled();if(groupFailed&&groupFailed->load())throw std::runtime_error("另一分段已停止");};
    auto operation=[&](auto begin,DWORD expected){ensure();ResetEvent(io.done);io.status=0;io.error=0;io.bytes=0;if(!begin()&&GetLastError()!=ERROR_IO_PENDING)throw std::runtime_error("下载请求失败（错误 "+std::to_string(GetLastError())+"）");while(WaitForSingleObject(io.done,50)==WAIT_TIMEOUT)ensure();ensure();if(io.error||io.status!=expected)throw std::runtime_error("下载连接失败（错误 "+std::to_string(io.error.load())+"）");};
    const auto meta=downloadResumePath(target);const auto resource=downloadResourceIdentity(url,logicalIdentity);json saved;unsigned long long offset=0,storedTotal=0;std::wstring validator,validatorHeader;
    try{
        if(fs::is_regular_file(target)&&fs::is_regular_file(meta)&&fs::file_size(meta)<16384){saved=json::parse(read(meta));storedTotal=saved.value("total",0ULL);const auto etag=wide(saved.value("etag",std::string{})),modified=wide(saved.value("modified",std::string{}));
            if(!etag.empty()&&etag.rfind(L"W/",0)!=0){validator=etag;validatorHeader=L"ETag";}else if(!modified.empty()){validator=modified;validatorHeader=L"Last-Modified";}
            if(saved.value("resource",std::string{})==resource&&!validator.empty()&&validator.find_first_of(L"\r\n")==std::wstring::npos&&(range&&range->start>0||downloadMp4Prefix(target))&&storedTotal>=fs::file_size(target)){offset=fs::file_size(target);}
            if(offset&&offset==storedTotal&&saved.value("complete",false)){if(progress){if(range){progress->resumed[track].fetch_add(offset);progress->received[track].fetch_add(offset);}else{progress->resumed[track]=offset;progress->received[track]=offset;progress->expected[track]=storedTotal;}progress->report(true);}return;}
        }
    }catch(...){offset=0;validator.clear();}
    try{
        checkDownloadCancelled();URL_COMPONENTS parts{sizeof(parts)};parts.dwHostNameLength=DWORD(-1);parts.dwUrlPathLength=DWORD(-1);parts.dwExtraInfoLength=DWORD(-1);
        if(!downloadMediaUrl(url)||!WinHttpCrackUrl(url.c_str(),DWORD(url.size()),0,&parts))throw std::runtime_error("下载地址不被允许");
        std::wstring host(parts.lpszHostName,parts.dwHostNameLength),path(parts.lpszUrlPath,parts.dwUrlPathLength);path.append(parts.lpszExtraInfo,parts.dwExtraInfoLength);
        connection=WinHttpConnect(sharedDownloadSession(),host.c_str(),parts.nPort,0);if(!connection)throw std::runtime_error("下载连接失败");
        request=WinHttpOpenRequest(connection,L"GET",path.c_str(),nullptr,L"https://www.bilibili.com/",WINHTTP_DEFAULT_ACCEPT_TYPES,parts.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);if(!request)throw std::runtime_error("下载连接失败");
        DWORD redirect=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect));DWORD_PTR context=reinterpret_cast<DWORD_PTR>(&io);
        if(!WinHttpSetOption(request,WINHTTP_OPTION_CONTEXT_VALUE,&context,sizeof(context))||WinHttpSetStatusCallback(request,downloadIoCallback,WINHTTP_CALLBACK_FLAG_ALL_COMPLETIONS|WINHTTP_CALLBACK_FLAG_HANDLES,0)==WINHTTP_INVALID_STATUS_CALLBACK)throw std::runtime_error("无法初始化异步下载");callbackReady=true;
        std::wstring headers=L"Accept-Encoding: identity\r\n";if(range){validator=range->validator;validatorHeader=range->validatorHeader;headers+=L"Range: bytes="+std::to_wstring(range->start+offset)+L"-"+std::to_wstring(range->end)+L"\r\nIf-Range: "+validator+L"\r\n";}else if(offset)headers+=L"Range: bytes="+std::to_wstring(offset)+L"-\r\nIf-Range: "+validator+L"\r\n";
        operation([&]{return WinHttpSendRequest(request,headers.c_str(),DWORD(headers.size()),WINHTTP_NO_REQUEST_DATA,0,0,context);},WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE);
        operation([&]{return WinHttpReceiveResponse(request,nullptr);},WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE);
        DWORD status{},size=sizeof(status);WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);
        const auto encoding=downloadCustomHeader(request,L"Content-Encoding");if(!encoding.empty()&&encoding!=L"identity")throw std::runtime_error("服务器返回压缩媒体，无法安全续传");
        auto length=downloadHeader(request,WINHTTP_QUERY_CONTENT_LENGTH);unsigned long long responseBytes=length.empty()?0:std::stoull(length),expected=responseBytes;
        if(status==206){
            auto contentRange=downloadHeader(request,WINHTTP_QUERY_CONTENT_RANGE);std::wsmatch match;static const std::wregex valid(L"bytes ([0-9]+)-([0-9]+)/([0-9]+)");
            if(!std::regex_match(contentRange,match,valid))throw std::runtime_error("续传 Content-Range 无效，断点已保留");
            auto start=std::stoull(match[1].str()),end=std::stoull(match[2].str()),total=std::stoull(match[3].str());
            if(start!=(range?range->start:0)+offset||end<start||end>=total||(responseBytes&&responseBytes!=end-start+1)||(range?(total!=range->total||end!=range->end):(offset&&storedTotal!=total||end+1!=total)))throw std::runtime_error("续传范围不匹配，断点已保留");
            if((offset||range)&&downloadCustomHeader(request,validatorHeader.c_str())!=validator)throw std::runtime_error("媒体校验已改变，断点已保留");expected=range?range->end-range->start+1:total;responseBytes=end-start+1;
        }else if(status==200){if(range)throw DownloadRangeIgnored();offset=0;}else throw std::runtime_error("下载服务器返回 HTTP "+std::to_string(status)+"，断点已保留");
        if(expected>(1ULL<<40))throw std::runtime_error("媒体大小异常");
        std::ofstream output(target,std::ios::binary|(offset?std::ios::app:std::ios::trunc));if(!output)throw std::runtime_error("无法写入保存位置");
        auto etag=downloadHeader(request,WINHTTP_QUERY_ETAG),modified=downloadHeader(request,WINHTTP_QUERY_LAST_MODIFIED);json checkpoint={{"resource",resource},{"total",expected},{"etag",utf8(etag)},{"modified",utf8(modified)},{"complete",false}};saveDownloadCheckpoint(meta,checkpoint);
        if(progress){if(range){progress->resumed[track].fetch_add(offset);progress->received[track].fetch_add(offset);}else{progress->resumed[track]=offset;progress->received[track]=offset;progress->expected[track]=expected;}progress->report(true);}std::string magic;unsigned long long total=offset,transferred=0;
        // A direct large asynchronous read avoids QueryDataAvailable + small-read round trips.
        while(true){operation([&]{return WinHttpReadData(request,buffer.data(),DWORD(buffer.size()),nullptr);},WINHTTP_CALLBACK_STATUS_READ_COMPLETE);DWORD got=io.bytes;if(!got)break;
            if(!offset&&(!range||range->start==0)&&magic.size()<8)magic.append(buffer.data(),std::min<size_t>(8-magic.size(),got));if(!offset&&(!range||range->start==0)&&magic.size()==8&&memcmp(magic.data()+4,"ftyp",4)!=0)throw std::runtime_error("服务器未返回 MP4 文件，断点不可使用");
            if(expected&&total+got>expected)throw std::runtime_error("媒体响应超过预期大小，保存已停止");output.write(buffer.data(),got);if(!output)throw std::runtime_error("磁盘写入失败");total+=got;transferred+=got;if(progress){if(range)progress->received[track].fetch_add(got);else progress->received[track]=total;progress->report();}
        }
        output.close();checkDownloadCancelled();if(!output||total<8||(expected&&expected!=total)||(responseBytes&&responseBytes!=transferred))throw std::runtime_error("文件未完整下载，断点已保留");checkpoint["total"]=total;checkpoint["complete"]=true;saveDownloadCheckpoint(meta,checkpoint);if(progress)progress->report(true);
    }catch(...){close();throw;}close();
}
struct DownloadProbe{unsigned long long total{};std::wstring validator,validatorHeader,etag,modified;bool ranged=false;};
DownloadProbe probeDownloadResource(const std::wstring& url){
    DownloadProbe result;HINTERNET session{},connection{},request{};auto close=[&]{if(request)WinHttpCloseHandle(request);if(connection)WinHttpCloseHandle(connection);if(session)WinHttpCloseHandle(session);};
    try{
        checkDownloadCancelled();if(!downloadMediaUrl(url))return result;URL_COMPONENTS p{sizeof(p)};p.dwHostNameLength=p.dwUrlPathLength=p.dwExtraInfoLength=DWORD(-1);if(!WinHttpCrackUrl(url.c_str(),DWORD(url.size()),0,&p))return result;
        session=WinHttpOpen(L"Mozilla/5.0 Bili-Space",WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);if(!session)return result;WinHttpSetTimeouts(session,1500,1500,1500,1500);
        std::wstring host(p.lpszHostName,p.dwHostNameLength),path(p.lpszUrlPath,p.dwUrlPathLength);path.append(p.lpszExtraInfo,p.dwExtraInfoLength);connection=WinHttpConnect(session,host.c_str(),p.nPort,0);if(!connection){close();return result;}
        request=WinHttpOpenRequest(connection,L"HEAD",path.c_str(),nullptr,L"https://www.bilibili.com/",WINHTTP_DEFAULT_ACCEPT_TYPES,p.nScheme==INTERNET_SCHEME_HTTPS?WINHTTP_FLAG_SECURE:0);if(!request){close();return result;}
        DWORD redirects=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirects,sizeof(redirects));
        if(WinHttpSendRequest(request,L"Accept-Encoding: identity\r\n",DWORD(-1),nullptr,0,0,0)&&WinHttpReceiveResponse(request,nullptr)){
            DWORD status{},size=sizeof(status);WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);
            const auto length=downloadHeader(request,WINHTTP_QUERY_CONTENT_LENGTH);if(status==200&&!length.empty()&&downloadCustomHeader(request,L"Accept-Ranges")==L"bytes"){
                result.total=std::stoull(length);result.etag=downloadHeader(request,WINHTTP_QUERY_ETAG);result.modified=downloadHeader(request,WINHTTP_QUERY_LAST_MODIFIED);
                if(!result.etag.empty()&&result.etag.rfind(L"W/",0)!=0){result.validator=result.etag;result.validatorHeader=L"ETag";}else if(!result.modified.empty()){result.validator=result.modified;result.validatorHeader=L"Last-Modified";}
                result.ranged=result.total>0&&result.total<=(1ULL<<40)&&!result.validator.empty()&&result.validator.find_first_of(L"\r\n")==std::wstring::npos;
            }
        }
    }catch(...){}close();return result;
}
void removeDownloadTrackArtifacts(const fs::path& target){
    std::error_code error;fs::remove(target,error);fs::remove(downloadResumePath(target),error);
    for(int i=0;i<4;i++){auto chunk=target;chunk+=L".range"+std::to_wstring(i);fs::remove(chunk,error);fs::remove(downloadResumePath(chunk),error);}auto assembly=target;assembly+=L".assembling";fs::remove(assembly,error);
}
void fetchAcceleratedMediaFile(const std::wstring& url,const fs::path& target,TransferProgress* progress,int track,const std::string& identity,int connections=4){
    // Existing sequential checkpoints remain resumable rather than being discarded to re-segment them.
    if(connections<=1||(fs::is_regular_file(target)&&fs::file_size(target)>0)){fetchMediaFile(url,target,progress,track,identity);return;}
    const auto probe=probeDownloadResource(url);if(!probe.ranged||probe.total<4*1024*1024){fetchMediaFile(url,target,progress,track,identity);return;}
    const int count=connections>=4?4:2;std::atomic<bool> failed=false;std::mutex failures;std::exception_ptr first;std::vector<std::future<void>> tasks;std::vector<fs::path> chunks;
    if(progress){progress->expected[track]=probe.total;progress->received[track]=0;progress->resumed[track]=0;}
    for(int i=0;i<count;i++){
        DownloadRange range{probe.total*i/count,probe.total*(i+1)/count-1,probe.total,probe.validator,probe.validatorHeader};auto chunk=target;chunk+=L".range"+std::to_wstring(i);chunks.push_back(chunk);
        tasks.push_back(std::async(std::launch::async,[&,range,chunk]{try{fetchMediaFile(url,chunk,progress,track,identity+":"+std::to_string(range.start)+":"+std::to_string(range.end)+":"+utf8(range.validator),&range,&failed);}catch(...){std::lock_guard<std::mutex> lock(failures);if(!first)first=std::current_exception();failed=true;}}));
    }
    for(auto& task:tasks)task.get();
    if(first){try{std::rethrow_exception(first);}catch(const DownloadRangeIgnored&){if(progress){progress->received[track]=0;progress->resumed[track]=0;}fetchMediaFile(url,target,progress,track,identity);return;}}
    auto assembly=target;assembly+=L".assembling";
    try{
        std::ofstream out(assembly,std::ios::binary|std::ios::trunc);if(!out)throw std::runtime_error("无法拼接媒体分段");std::vector<char> buffer(1024*1024);unsigned long long total=0;
        for(const auto& chunk:chunks){std::ifstream in(chunk,std::ios::binary);if(!in)throw std::runtime_error("媒体分段缺失");while(in){checkDownloadCancelled();in.read(buffer.data(),buffer.size());const auto n=in.gcount();if(n){out.write(buffer.data(),n);total+=n;if(!out)throw std::runtime_error("分段写入失败");}}if(!in.eof())throw std::runtime_error("媒体分段读取失败");}
        out.close();if(!out||total!=probe.total||!downloadMp4Prefix(assembly))throw std::runtime_error("分段校验失败，断点已保留");checkDownloadCancelled();
        if(!MoveFileExW(assembly.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存已校验媒体轨");
        saveDownloadCheckpoint(downloadResumePath(target),{{"resource",downloadResourceIdentity(url,identity)},{"total",total},{"etag",utf8(probe.etag)},{"modified",utf8(probe.modified)},{"complete",true}});
        for(auto& chunk:chunks)removeDownloadTrackArtifacts(chunk);
    }catch(...){std::error_code error;fs::remove(assembly,error);throw;}
}
