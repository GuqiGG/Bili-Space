#define BILI_DOWNLOAD_TEST
#ifndef TARGET_CPP
#define TARGET_CPP "../src/main.cpp"
#endif
#include TARGET_CPP
#include <iostream>
LRESULT CALLBACK download44Capture(HWND h,UINT m,WPARAM w,LPARAM l){if(m==downloadReplyMessage){std::unique_ptr<DownloadReply> r(reinterpret_cast<DownloadReply*>(l));if(w==2)queueDownloadProgress(json::parse(r->message));else if(w==1)queueDownloadPhase(r->message);else finishQueuedDownload(r->ok,r->message);return 0;}return DefWindowProcW(h,m,w,l);}
void pump44(){MSG m{};while(PeekMessageW(&m,nullptr,0,0,PM_REMOVE))DispatchMessageW(&m);}
int wmain(int n,wchar_t** a){
 if(n<4)return 2;testing=true;config=defaults();dataPath=fs::absolute(a[2]);fs::create_directories(dataPath);const std::string mode=utf8(a[3]);json result;
 WNDCLASSW wc{};wc.hInstance=GetModuleHandleW(nullptr);wc.lpfnWndProc=download44Capture;wc.lpszClassName=L"Download44Probe";RegisterClassW(&wc);windowHandle=CreateWindowExW(0,wc.lpszClassName,L"",0,0,0,0,0,HWND_MESSAGE,nullptr,wc.hInstance,nullptr);
 if(mode=="queue-reload"){loadDownloadQueue();result=downloadQueueSnapshot();std::cout<<result.dump();DestroyWindow(windowHandle);return 0;}
 if(mode=="queue"||mode=="queue-pause"||mode=="queue-resume"||mode=="queue-failure"||mode=="queue-remove"){
  downloadQueueDirectory=utf8(dataPath.wstring());if(mode!="queue-resume")downloadQueueAction("enqueue",{{"items",json::array({{{"bvid","BV1cjHK6GEJE"},{"cid",1},{"p",1},{"title","queue part one"}},{{"bvid","BV1cjHK6GEJE"},{"cid",2},{"p",2},{"title","queue part two"}}})}});
  if(mode=="queue-resume")downloadQueueAction("resume",json::object());auto initial=downloadQueueSnapshot();auto oldToken=downloadQueueItems[0].at("planToken");const auto first=downloadQueueItems[0].at("id");downloadQueueAction("pause",{{"id",first}});downloadQueueAction("resume",{{"id",first}});
  acceptQueuedDownloadPlan({{"queueId",first},{"planToken",oldToken},{"url",utf8(a[1])}});result["stalePlanRejected"]=activeQueueId.empty();auto started=GetTickCount64();bool failureSent=false,paused=false;
  while(GetTickCount64()-started<30000){pump44();if(mode=="queue-pause"&&!paused&&!activeQueueId.empty()&&GetTickCount64()-started>80){downloadQueueAction("pause",json::object());paused=true;}if(!resolvingQueueId.empty()){if(mode=="queue-failure"&&!failureSent){acceptQueuedDownloadPlan({{"queueId",resolvingQueueId},{"planToken",queuedDownload(resolvingQueueId)->at("planToken")},{"error","fixture API failure"}});failureSent=true;continue;}auto* item=queuedDownload(resolvingQueueId);acceptQueuedDownloadPlan({{"queueId",resolvingQueueId},{"planToken",item->at("planToken")},{"url",utf8(a[1])+"?cid="+std::to_string(item->at("cid").get<int>())},{"representation",{{"video",{{"id",80},{"codecid",7},{"bandwidth",1000},{"url","must-not-persist"}}}}}});}if(!downloadBusy&&resolvingQueueId.empty())break;Sleep(5);}
  pump44();if(mode=="queue-remove"){auto target=downloadQueueItems[0].at("target").get<std::string>();downloadQueueAction("remove",{{"id",downloadQueueItems[0].at("id")}});result["completedFilePreserved"]=fs::exists(wide(target));}result["queue"]=downloadQueueSnapshot();for(auto& item:downloadQueueItems)result["files"].push_back({{"exists",fs::exists(wide(item["target"].get<std::string>()))},{"state",item["state"]}});shutdownDownloader();std::cout<<result.dump();DestroyWindow(windowHandle);return 0;
 }
 auto target=dataPath/L"track.mp4";downloadCancelRequested=false;downloadPeerFailed=false;bool ok=false;std::string error;std::thread cancel;
 if(mode=="cancel")cancel=std::thread([]{Sleep(80);downloadCancelRequested=true;});auto start=GetTickCount64();
 try{if(mode=="plan"){downloadBusy=true;runDownloadPlan(a[1],{},dataPath/L"final.mp4");ok=fs::exists(dataPath/L"final.mp4");}else{TransferProgress progress;fetchAcceleratedMediaFile(a[1],target,&progress,0,"fixture-media",n>4?_wtoi(a[4]):1);ok=true;}}catch(const std::exception& e){error=e.what();}
 if(cancel.joinable())cancel.join();result={{"ok",ok},{"error",error},{"elapsedMs",GetTickCount64()-start},{"bytes",fs::exists(target)?fs::file_size(target):0},{"metadata",fs::exists(downloadResumePath(target))?json::parse(read(downloadResumePath(target))):json(nullptr)}};
 pump44();DestroyWindow(windowHandle);std::cout<<result.dump();return 0;
}
