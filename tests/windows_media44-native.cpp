#define WIN32_LEAN_AND_MEAN
#define BILI_WINDOWS_MEDIA_TEST
#include <windows.h>
#include <windowsx.h>
#include <atomic>
#include <regex>
#include <string>
#include <cstring>
#include <cassert>
#include <iostream>
#include <vector>
#include <thread>
#include "json.hpp"
// Match main's early Win32 COM includes followed by WebView2 UUID remapping.
#include <shobjidl.h>
#ifdef __uuidof
#undef __uuidof
#endif
#if defined(__MINGW32__)
#undef MIDL_INTERFACE
#define MIDL_INTERFACE(x) struct __declspec(uuid(x))
#endif
#include "../src/windows_media.hpp"
using namespace bili_windows_media;
LRESULT CALLBACK wnd(HWND h,UINT m,WPARAM w,LPARAM l){if(windowsMediaMessage(m,w,l))return 0;return DefWindowProcW(h,m,w,l);}
struct Args:ISystemMediaTransportControlsButtonPressedEventArgs {
 SystemMediaTransportControlsButton button;explicit Args(SystemMediaTransportControlsButton b):button(b){}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID,void** out)override{if(out)*out=nullptr;return E_NOINTERFACE;}ULONG STDMETHODCALLTYPE AddRef()override{return 1;}ULONG STDMETHODCALLTYPE Release()override{return 1;}
 HRESULT STDMETHODCALLTYPE GetIids(ULONG* n,IID** p)override{if(n)*n=0;if(p)*p=nullptr;return S_OK;}HRESULT STDMETHODCALLTYPE GetRuntimeClassName(HSTRING* p)override{if(p)*p=nullptr;return E_NOTIMPL;}HRESULT STDMETHODCALLTYPE GetTrustLevel(TrustLevel* p)override{if(p)*p=BaseTrust;return S_OK;}
 HRESULT STDMETHODCALLTYPE get_Button(SystemMediaTransportControlsButton* b)override{if(!b)return E_POINTER;*b=button;return S_OK;}
};
void pump(){MSG m{};while(PeekMessageW(&m,nullptr,0,0,PM_REMOVE)){TranslateMessage(&m);DispatchMessageW(&m);}}
int wmain(){
 assert(artworkAllowed("https://i0.hdslb.com/bfs/archive/a.jpg"));assert(artworkAllowed("https://p1.biliimg.com/x.png"));for(auto s:{"http://i0.hdslb.com/x","https://evil.test/a","https://i0.hdslb.com.evil.test/x","https://user@i0.hdslb.com/x","https://i0.hdslb.com:443/x","file:///C:/x","https://127.0.0.1/x"})assert(!artworkAllowed(s));
 auto malformed=parse({{"active",true},{"title",44},{"artist",std::string(301,'x')},{"canPrevious","true"},{"artwork","javascript:alert(1)"}});assert(malformed.active&&malformed.title.empty()&&malformed.artist.empty()&&!malformed.previous&&malformed.artwork.empty());
 auto clean=parse({{"title","Title\nline"},{"active",true},{"canNext",true}});assert(clean.title=="Title line"&&clean.next);
 HRESULT co=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);assert(SUCCEEDED(co));WNDCLASSW wc{};wc.hInstance=GetModuleHandleW(nullptr);wc.lpfnWndProc=wnd;wc.lpszClassName=L"BiliNativeMedia44Test";RegisterClassW(&wc);HWND hwnd=CreateWindowW(wc.lpszClassName,L"Media integration test",WS_OVERLAPPEDWINDOW,-1000,-1000,400,250,nullptr,nullptr,wc.hInstance,nullptr);assert(hwnd);std::vector<std::string> commands;bool available=windowsMediaInit(hwnd,[&](const std::string& c){commands.push_back(c);});
 ShowWindow(hwnd,SW_SHOWNOACTIVATE);for(int i=0;i<10;i++){pump();Sleep(20);}windowsMediaAccept({{"active",true},{"title","Native fixture video"},{"artist","Fixture creator"},{"paused",false},{"canPrevious",false},{"canNext",true}});
 auto native=windowsMediaStatus();assert(available&&native["smtc"]==true);assert(native["taskbar"]==true&&native["toolbar"]==true);assert(native["nativeTitle"]=="Native fixture video");assert(native["nativePlaybackStatus"]==int(MediaPlaybackStatus_Playing));assert(native["nativeEnabled"]==true);
 SendMessageW(hwnd,WM_COMMAND,MAKEWPARAM(previousButton,THBN_CLICKED),0);assert(commands.empty());SendMessageW(hwnd,WM_COMMAND,MAKEWPARAM(toggleButton,THBN_CLICKED),0);assert(commands.back()=="toggle");SendMessageW(hwnd,WM_COMMAND,MAKEWPARAM(nextButton,THBN_CLICKED),0);assert(commands.back()=="next");
 Args pause(SystemMediaTransportControlsButton_Pause);HRESULT eventResult=E_FAIL;std::thread eventThread([&](){eventResult=service.testSmtcButton(&pause);});eventThread.join();assert(SUCCEEDED(eventResult));pump();assert(commands.back()=="pause");Args play(SystemMediaTransportControlsButton_Play);assert(SUCCEEDED(service.testSmtcButton(&play)));pump();assert(commands.back()=="play");
 auto before=commands.size();windowsMediaAccept({{"active",false}});SendMessageW(hwnd,WM_COMMAND,MAKEWPARAM(toggleButton,THBN_CLICKED),0);assert(commands.size()==before);assert(windowsMediaStatus()["nativeEnabled"]==false);
 // Replay only this window's registered Explorer notifications, never restart the user's shell.
 windowsMediaMessage(RegisterWindowMessageW(L"TaskbarCreated"),0,0);windowsMediaMessage(RegisterWindowMessageW(L"TaskbarButtonCreated"),0,0);auto rebuilt=windowsMediaStatus();
 auto stoppedAt=commands.size();service.testSmtcButton(&pause);windowsMediaShutdown();pump();assert(commands.size()==stoppedAt);assert(windowsMediaStatus()["smtc"]==false);assert(SUCCEEDED(service.testSmtcButton(&pause))==false);DestroyWindow(hwnd);CoUninitialize();
 nlohmann::json report={{"native",native},{"rebuiltTaskbar",rebuilt},{"commands",commands},{"callbackReplay",true},{"metadataReadback",true},{"disabledButtons",true},{"shutdown",true},{"physicalHeadsetTest",false}};std::cout<<report.dump(2,' ',true)<<'\n';
}
