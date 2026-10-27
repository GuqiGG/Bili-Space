#define BILI_UPDATE_TEST
#include "../src/main.cpp"
#include <iostream>
#include <cassert>
LRESULT CALLBACK capture(HWND h,UINT m,WPARAM w,LPARAM l){if(m==updateReplyMessage){std::unique_ptr<json> p(reinterpret_cast<json*>(l));acceptUpdate(*p);return 0;}return DefWindowProcW(h,m,w,l);}
void waitUpdate(){auto start=GetTickCount64();MSG m{};while(updateBusy&&GetTickCount64()-start<30000){while(PeekMessageW(&m,nullptr,0,0,PM_REMOVE))DispatchMessageW(&m);Sleep(5);}assert(!updateBusy);}
int wmain(int n,wchar_t** a){if(n!=4)return 2;updateTestPort=INTERNET_PORT(_wtoi(a[1]));dataPath=a[2];fs::create_directories(dataPath);testing=true;config=defaults();WNDCLASSW c{};c.lpfnWndProc=capture;c.hInstance=GetModuleHandleW(nullptr);c.lpszClassName=L"BiliUpdate38Test";RegisterClassW(&c);windowHandle=CreateWindowExW(0,c.lpszClassName,L"",0,0,0,0,0,HWND_MESSAGE,nullptr,c.hInstance,nullptr);
 json result;startUpdateCheck();waitUpdate();result["check"]=updateState;
 if(updateState.value("available",false)&&std::wstring(a[3])!=L"force"){startUpdateDownload();waitUpdate();result["download"]=updateState;result["readyFile"]=!readyUpdatePackage.empty()&&fs::exists(readyUpdatePackage);}
 result["partFiles"]=0;for(auto& e:fs::directory_iterator(dataPath/L"updates"))if(e.path().extension()==L".part")result["partFiles"]=result["partFiles"].get<int>()+1;
 std::cout<<result.dump();return 0;
}
