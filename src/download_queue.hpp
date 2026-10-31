#pragma once
json downloadQueueItems=json::array();bool downloadQueueLoaded=false,downloadQueuePaused=false,downloadQueueLoadFailed=false;
std::string downloadQueueDirectory,downloadQueueError,activeQueueId,resolvingQueueId,queuePauseIntent;ULONGLONG queueResolvingAt{};
json* queuedDownload(const std::string& id){for(auto& item:downloadQueueItems)if(item.value("id",std::string{})==id)return &item;return nullptr;}
void saveDownloadQueue(){
    if(downloadQueueLoadFailed)throw std::runtime_error("队列文件无法读取，未覆盖原文件");if(dataPath.empty())return;fs::create_directories(dataPath);json items=json::array();
    for(const auto& item:downloadQueueItems){json saved;for(const auto* key:{"id","bvid","cid","p","title","target","state","message","representation","identity"})if(item.contains(key))saved[key]=item[key];items.push_back(saved);}
    saveDownloadCheckpoint(dataPath/L"download-queue.json",{{"version",1},{"paused",downloadQueuePaused},{"directory",downloadQueueDirectory},{"items",items}});
}
void loadDownloadQueue(){
    if(downloadQueueLoaded)return;downloadQueueLoaded=true;const auto path=dataPath/L"download-queue.json";if(!fs::exists(path))return;
    try{
        if(fs::file_size(path)>4*1024*1024)throw std::runtime_error("队列文件过大");auto saved=json::parse(read(path));if(saved.value("version",0)!=1||!saved.at("items").is_array()||saved["items"].size()>200)throw std::runtime_error("队列格式无效");
        downloadQueueDirectory=saved.value("directory",std::string{});static const std::regex bvid("BV[A-Za-z0-9]{10}");
        for(auto item:saved["items"]){if(!item.is_object()||!std::regex_match(item.value("bvid",std::string{}),bvid)||item.value("cid",0LL)<=0||item.value("id",std::string{}).size()>100)throw std::runtime_error("队列项目无效");
            fs::path target=wide(item.at("target").get<std::string>());if(!target.is_absolute()||target.extension()!=L".mp4")throw std::runtime_error("保存位置无效");
            auto state=item.value("state",std::string{});if(state!="completed"&&state!="failed"&&state!="cancelled")item["state"]="paused";item["percent"]=nullptr;item["bytesPerSecond"]=0;item["etaSeconds"]=nullptr;downloadQueueItems.push_back(item);
        }
        // A restart never silently resumes background network activity; the user resumes the queue.
        downloadQueuePaused=true;
    }catch(const std::exception& e){downloadQueueItems=json::array();downloadQueueLoadFailed=true;downloadQueueError=e.what();}
}
json downloadQueueSnapshot(){loadDownloadQueue();return {{"items",downloadQueueItems},{"paused",downloadQueuePaused},{"activeId",activeQueueId},{"resolvingId",resolvingQueueId},{"directory",downloadQueueDirectory},{"message",downloadQueueError}};}
void pushDownloadQueue(){execute("window.BiliSpace?.acceptDownloadQueue("+downloadQueueSnapshot().dump()+")");}
std::string downloadQueueToken(){GUID id{};wchar_t text[64]{};if(FAILED(CoCreateGuid(&id))||!StringFromGUID2(id,text,64))throw std::runtime_error("无法创建任务编号");return utf8(text);}
void kickDownloadQueue(){
    loadDownloadQueue();if(downloadQueuePaused||downloadBusy||!activeQueueId.empty()||!resolvingQueueId.empty()||downloadQueueLoadFailed)return;
    for(auto& item:downloadQueueItems)if(item.value("state",std::string{})=="pending"){
        resolvingQueueId=item.at("id").get<std::string>();queueResolvingAt=GetTickCount64();item["state"]="resolving";item["message"]="解析下载地址";item["planToken"]=downloadQueueToken();saveDownloadQueue();pushDownloadQueue();execute("window.BiliSpace?.resolveQueuedDownload("+item.dump()+")");return;
    }
}
std::wstring chooseDownloadQueueDirectory(){
#ifdef BILI_DOWNLOAD_TEST
    if(testing&&!downloadQueueDirectory.empty())return wide(downloadQueueDirectory);
#endif
    BROWSEINFOW dialog{};dialog.hwndOwner=windowHandle;dialog.lpszTitle=L"选择下载任务的保存文件夹";dialog.ulFlags=BIF_RETURNONLYFSDIRS|BIF_NEWDIALOGSTYLE;
    auto selected=SHBrowseForFolderW(&dialog);if(!selected)return {};wchar_t path[32768]{};bool ok=SHGetPathFromIDListW(selected,path);CoTaskMemFree(selected);return ok?std::wstring(path):std::wstring{};
}
json sanitizedDownloadRepresentation(const json& source){
    json result=json::object();if(!source.is_object())return result;
    for(const auto* track:{"video","audio"})if(source.contains(track)&&source[track].is_object())for(const auto* key:{"id","codecid","bandwidth","width","height"})if(source[track].contains(key)&&source[track][key].is_number_integer())result[track][key]=source[track][key];
    for(const auto* key:{"videoId","audioId","codecid","bandwidth","audioBandwidth","quality"})if(source.contains(key)&&source[key].is_number_integer())result[key]=source[key];return result;
}
void acceptQueuedDownloadPlan(const json& message){
    loadDownloadQueue();const auto id=message.value("queueId",std::string{});auto* item=queuedDownload(id);
    if(!item||id!=resolvingQueueId||item->value("state",std::string{})!="resolving"||message.value("planToken",std::string{})!=item->value("planToken",std::string{}))return;
    resolvingQueueId.clear();item->erase("planToken");
    if(message.contains("error")){
        item->operator[]("state")="failed";item->operator[]("message")=message.value("error",std::string("解析下载地址失败")).substr(0,500);saveDownloadQueue();pushDownloadQueue();kickDownloadQueue();return;
    }
    if(downloadQueuePaused||downloadBusy){(*item)["state"]="pending";saveDownloadQueue();pushDownloadQueue();return;}
    auto url=wide(message.value("url",std::string{})),audio=wide(message.value("audioUrl",std::string{}));
    if(!downloadMediaUrl(url)||(!audio.empty()&&!downloadMediaUrl(audio))){(*item)["state"]="failed";(*item)["message"]="媒体地址未通过校验";saveDownloadQueue();pushDownloadQueue();kickDownloadQueue();return;}
    (*item)["representation"]=sanitizedDownloadRepresentation(message.value("representation",json::object()));const auto identity=item->at("bvid").get<std::string>()+":"+std::to_string(item->at("cid").get<long long>())+":"+(*item)["representation"].dump();(*item)["identity"]=identity;
    const fs::path target=wide(item->at("target").get<std::string>());if(fs::exists(target)){(*item)["state"]="failed";(*item)["message"]="同名文件已存在，未覆盖";saveDownloadQueue();pushDownloadQueue();kickDownloadQueue();return;}
    activeQueueId=id;queuePauseIntent.clear();(*item)["state"]="downloading";(*item)["message"]="下载中";downloadBusy=true;downloadCancelRequested=false;downloadPeerFailed=false;saveDownloadQueue();pushDownloadQueue();launchDownloadWorker(url,audio,target,identity);
}
bool queueDownloadProgress(const json& progress){
    if(activeQueueId.empty())return false;if(auto* item=queuedDownload(activeQueueId)){for(const auto* key:{"bytes","total","percent","bytesPerSecond","etaSeconds"})if(progress.contains(key))(*item)[key]=progress[key];pushDownloadQueue();}return true;
}
bool queueDownloadPhase(const std::string& text){if(activeQueueId.empty())return false;if(auto* item=queuedDownload(activeQueueId)){(*item)["state"]=text=="合并中"?"merging":"downloading";(*item)["message"]=text;pushDownloadQueue();}return true;}
bool finishQueuedDownload(bool ok,const std::string& message){
    if(activeQueueId.empty()){kickDownloadQueue();return false;}auto id=activeQueueId;activeQueueId.clear();if(auto* item=queuedDownload(id)){(*item)["state"]=ok?"completed":queuePauseIntent=="cancel"?"cancelled":queuePauseIntent=="pause"?"paused":"failed";(*item)["message"]=message;(*item)["bytesPerSecond"]=0;(*item)["etaSeconds"]=nullptr;if(ok)(*item)["percent"]=100;}
    queuePauseIntent.clear();saveDownloadQueue();pushDownloadQueue();kickDownloadQueue();return true;
}
void downloadQueueAction(const std::string& action,const json& payload){
    loadDownloadQueue();try{
        if(action=="status"){
            if(!resolvingQueueId.empty()&&GetTickCount64()-queueResolvingAt>15000){if(auto* item=queuedDownload(resolvingQueueId)){(*item)["state"]="pending";item->erase("planToken");}resolvingQueueId.clear();}pushDownloadQueue();kickDownloadQueue();return;
        }
        if(downloadQueueLoadFailed)throw std::runtime_error(downloadQueueError);
        if(action=="enqueue"){
            auto items=payload.value("items",json::array());if(!items.is_array()||items.empty()||items.size()>200||items.size()+downloadQueueItems.size()>200)throw std::runtime_error("下载队列最多保留 200 项");
            static const std::regex validBvid("BV[A-Za-z0-9]{10}");for(const auto& item:items)if(!item.is_object()||!std::regex_match(item.value("bvid",std::string{}),validBvid)||item.value("cid",0LL)<=0||item.value("p",1)<1||item.value("p",1)>10000||item.value("title",std::string{}).size()>1500)throw std::runtime_error("下载项目格式无效");
            auto folder=chooseDownloadQueueDirectory();if(folder.empty()){pushDownloadQueue();return;}if(!fs::is_directory(folder))throw std::runtime_error("保存文件夹不存在");downloadQueueDirectory=utf8(folder);
            for(const auto& source:items){
                bool duplicate=false;for(const auto& old:downloadQueueItems)if(old.value("bvid",std::string{})==source.value("bvid",std::string{})&&old.value("cid",0LL)==source.value("cid",0LL)&&old.value("state",std::string{})!="cancelled"){duplicate=true;break;}if(duplicate)continue;
                auto name=wide(source.value("title",std::string("Bili-video")));for(auto& ch:name)if(ch<32||std::wstring(L"<>:\"/\\|?*").find(ch)!=std::wstring::npos)ch=L'_';if(name.size()>100)name.resize(100);if(name.empty())name=L"Bili-video";name+=L"_"+wide(source.at("bvid").get<std::string>())+L"_P"+std::to_wstring(source.value("p",1));auto target=fs::path(folder)/(name+L".mp4");
                auto occupied=[&](const fs::path& candidate){if(fs::exists(candidate))return true;for(const auto& old:downloadQueueItems)if(wide(old.value("target",std::string{}))==candidate.wstring())return true;return false;};for(int suffix=1;occupied(target)&&suffix<1000;suffix++)target=fs::path(folder)/(name+L" ("+std::to_wstring(suffix)+L").mp4");if(occupied(target))throw std::runtime_error("无法分配保存文件名");
                downloadQueueItems.push_back({{"id",downloadQueueToken()},{"bvid",source.at("bvid")},{"cid",source.at("cid")},{"p",source.value("p",1)},{"title",source.value("title",std::string("Bili-video"))},{"target",utf8(target.wstring())},{"representation",sanitizedDownloadRepresentation(source.value("representation",json::object()))},{"state","pending"},{"message","等待下载"},{"percent",nullptr},{"bytesPerSecond",0},{"etaSeconds",nullptr}});
            }
            downloadQueuePaused=false;downloadQueueError.clear();saveDownloadQueue();pushDownloadQueue();kickDownloadQueue();return;
        }
        const auto id=payload.value("id",std::string{});auto* item=queuedDownload(id);
        if(action=="pause"){
            if(id.empty())downloadQueuePaused=true;if(!item&&!id.empty())return;
            if(!activeQueueId.empty()&&(id.empty()||id==activeQueueId)){queuePauseIntent="pause";cancelDownload();}
            if(!resolvingQueueId.empty()&&(id.empty()||id==resolvingQueueId)){if(auto* resolving=queuedDownload(resolvingQueueId)){(*resolving)["state"]="paused";resolving->erase("planToken");}resolvingQueueId.clear();}
            if(item&&id!=activeQueueId&&item->value("state",std::string{})=="pending")(*item)["state"]="paused";
        }else if(action=="resume"||action=="retry"){
            downloadQueuePaused=false;for(auto& entry:downloadQueueItems)if((id.empty()||entry.value("id",std::string{})==id)&&entry.value("state",std::string{})!="completed"&&entry.value("id",std::string{})!=activeQueueId){entry["state"]="pending";entry["message"]="等待下载";}
        }else if(action=="cancel"){
            if(!item)return;if(id==activeQueueId){queuePauseIntent="cancel";cancelDownload();}else{(*item)["state"]="cancelled";(*item)["message"]="已取消，断点保留";if(id==resolvingQueueId)resolvingQueueId.clear();}
        }else if(action=="remove"){
            if(!item)return;if(id==activeQueueId)throw std::runtime_error("请先暂停任务，再移除");if(item->contains("identity"))clearDownloadPlanParts(wide(item->at("target").get<std::string>()),item->at("identity").get<std::string>());if(id==resolvingQueueId)resolvingQueueId.clear();json keep=json::array();for(auto& entry:downloadQueueItems)if(entry.value("id",std::string{})!=id)keep.push_back(entry);downloadQueueItems=keep;
        }else return;
        saveDownloadQueue();pushDownloadQueue();kickDownloadQueue();
    }catch(const std::exception& e){downloadQueueError=e.what();pushDownloadQueue();}
}
void shutdownDownloader(){
    downloadQueuePaused=true;if(!activeQueueId.empty())if(auto* item=queuedDownload(activeQueueId)){(*item)["state"]="paused";(*item)["message"]="客户端已退出，断点保留";}
    if(!resolvingQueueId.empty())if(auto* item=queuedDownload(resolvingQueueId)){(*item)["state"]="paused";item->erase("planToken");}
    if(downloadQueueLoaded&&!downloadQueueLoadFailed)try{saveDownloadQueue();}catch(...){}downloadCancelRequested=true;if(downloadWorkerOwner.thread.joinable())downloadWorkerOwner.thread.join();
}
