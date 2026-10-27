#define BILI_UPDATE_TEST
#define BILI_DOWNLOAD_TEST
#ifndef TARGET_CPP
#define TARGET_CPP "../src/main.cpp"
#endif
#include TARGET_CPP
#include <iostream>
struct GateMessage final:ICoreWebView2WebMessageReceivedEventArgs{
    std::wstring origin;
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID,void**)override{return E_NOINTERFACE;}ULONG STDMETHODCALLTYPE AddRef()override{return 1;}ULONG STDMETHODCALLTYPE Release()override{return 1;}
    HRESULT text(const std::wstring& s,LPWSTR* out){*out=static_cast<LPWSTR>(CoTaskMemAlloc((s.size()+1)*sizeof(wchar_t)));wcscpy(*out,s.c_str());return S_OK;}
    HRESULT STDMETHODCALLTYPE get_Source(LPWSTR* out)override{return text(origin,out);}
    HRESULT STDMETHODCALLTYPE get_WebMessageAsJson(LPWSTR* out)override{return text(L"{\"type\":\"updates\",\"action\":\"check\"}",out);}
    HRESULT STDMETHODCALLTYPE TryGetWebMessageAsString(LPWSTR*)override{return E_FAIL;}
};
LRESULT CALLBACK captureHotfix(HWND h,UINT m,WPARAM w,LPARAM l){if(m==updateReplyMessage){std::unique_ptr<json> p(reinterpret_cast<json*>(l));acceptUpdate(*p);return 0;}return DefWindowProcW(h,m,w,l);}
void waitHotfix(){auto start=GetTickCount64();MSG m{};while(updateBusy&&GetTickCount64()-start<30000){while(PeekMessageW(&m,nullptr,0,0,PM_REMOVE))DispatchMessageW(&m);Sleep(5);}}
int wmain(int n,wchar_t** a){if(n!=4)return 2;const auto mode=utf8(a[3]);dataPath=fs::absolute(a[2]);fs::create_directories(dataPath);root=dataPath/L"install";fs::create_directories(root);testing=true;config=defaults();
 if(mode=="peer-failure"){downloadBusy=true;auto target=dataPath/L"saved.mp4";std::ofstream(target)<<"sentinel";runDownloadPlan(std::wstring(a[1])+L"/failure",std::wstring(a[1])+L"/slow",target);std::cout<<json({{"busy",downloadBusy.load()},{"preserved",read(target)=="sentinel"}}).dump();return 0;}
 updateTestPort=INTERNET_PORT(_wtoi(a[1]));WNDCLASSW c{};c.lpfnWndProc=captureHotfix;c.hInstance=GetModuleHandleW(nullptr);c.lpszClassName=L"Hotfix38Test";RegisterClassW(&c);windowHandle=CreateWindowExW(0,c.lpszClassName,L"",0,0,0,0,0,HWND_MESSAGE,nullptr,c.hInstance,nullptr);
 json result;
 if(mode=="gate-data"||mode=="gate-foreign"){updateRequired=true;updateGateShown=true;GateMessage message;message.origin=mode=="gate-data"?L"data:text/html;charset=utf-8;base64,fixture":L"https://www.bilibili.com/";receive(&message);waitHotfix();result["accepted"]=updateChecked;std::cout<<result.dump();return 0;}
 startUpdateCheck();waitHotfix();result["check"]=updateState;
 if(mode=="resume"||mode=="busy-install"){startUpdateDownload();waitHotfix();result["download"]=updateState;
  if(mode=="resume"){startUpdateCheck();waitHotfix();result["rechecked"]=updateState;}
  else{downloadBusy=true;startUpdateInstall();result["install"]=updateState;downloadBusy=false;}
 }
 std::cout<<result.dump();return 0;
}
