#define BILI_UPDATE_TEST
#include "../src/main.cpp"
#include <iostream>
#include <cassert>
json received=json::array();
LRESULT CALLBACK captureUpdate(HWND h,UINT m,WPARAM w,LPARAM l){if(m==updateReplyMessage){std::unique_ptr<json> p((json*)l);received.push_back(*p);acceptUpdate(*p);return 0;}return DefWindowProcW(h,m,w,l);}
void waitUpdate(){auto start=GetTickCount64();MSG m{};while(updateBusy&&GetTickCount64()-start<20000){while(PeekMessageW(&m,nullptr,0,0,PM_REMOVE))DispatchMessageW(&m);Sleep(5);}assert(!updateBusy);}
int wmain(int argc,wchar_t** argv){if(argc!=4)return 2;updateTestPort=(INTERNET_PORT)_wtoi(argv[1]);dataPath=argv[2];fs::create_directories(dataPath);testing=true;config=defaults();WNDCLASSW c{};c.lpfnWndProc=captureUpdate;c.hInstance=GetModuleHandleW(nullptr);c.lpszClassName=L"BiliUpdateVerification";RegisterClassW(&c);windowHandle=CreateWindowExW(0,c.lpszClassName,L"",0,0,0,0,0,HWND_MESSAGE,nullptr,c.hInstance,nullptr);
 json results;startUpdateCheck();waitUpdate();results["check"]=updateState;auto mode=utf8(argv[3]);
 if(mode=="normal"||mode=="bad-hash"){assert(updateState.value("available",false));updateAction("ignore");results["ignored"]=updateState;startUpdateDownload();waitUpdate();results["download"]=updateState;results["readyFile"]=!readyUpdatePackage.empty()&&fs::exists(readyUpdatePackage);results["partFiles"]=0;for(auto& e:fs::directory_iterator(dataPath/L"updates"))if(e.path().extension()==L".part")results["partFiles"]=results["partFiles"].get<int>()+1;}
 if(mode=="force"){assert(updateRequired);ignoredUpdateVersion="0.1.35";updateAction("ignore");results["ignoreBlocked"]=!updateState.value("ignored",false);updateRequired=false;results["restartGate"]=loadRequiredUpdate();auto value=updateState;value["force"]=false;value["minimumSupportedVersion"]="0.1.0";acceptUpdate({{"event","checked"},{"manifest",validateUpdate(value,appVersion)}});results["revoked"]=!updateRequired;results["cacheRemoved"]=!fs::exists(dataPath/L"updates/required.json");}
 results["events"]=received;std::cout<<results.dump();return 0;}
