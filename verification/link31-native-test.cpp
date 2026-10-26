#include "../src/main.cpp"
#include <iostream>
std::vector<json> events;
LRESULT CALLBACK capture(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp){if(msg==downloadReplyMessage){std::unique_ptr<DownloadReply> reply((DownloadReply*)lp);if(wp==2)events.push_back(json{{"progress",json::parse(reply->message)}});else if(wp==1)events.push_back(json{{"phase",reply->message}});else events.push_back(json{{"ok",reply->ok},{"message",reply->message}});return 0;}return DefWindowProcW(hwnd,msg,wp,lp);}
std::wstring ownClipboard(){std::wstring text;if(OpenClipboard(windowHandle)){if(auto h=GetClipboardData(CF_UNICODETEXT)){if(auto p=(const wchar_t*)GlobalLock(h)){text=p;GlobalUnlock(h);}}CloseClipboard();}return text;}
int wmain(int argc,wchar_t** argv){WNDCLASSW c{};c.lpfnWndProc=capture;c.hInstance=GetModuleHandleW(nullptr);c.lpszClassName=L"BiliSpaceVerification";RegisterClassW(&c);windowHandle=CreateWindowExW(0,c.lpszClassName,L"",0,0,0,0,0,HWND_MESSAGE,nullptr,c.hInstance,nullptr);
if(argc==2&&std::wstring(argv[1])==L"copy"){if(FAILED(OleInitialize(nullptr)))return 2;IDataObject* prior{};if(FAILED(OleGetClipboard(&prior))){OleUninitialize();return 3;}std::string expected="https://www.bilibili.com/video/BV1cjHK6GEJE?p=2&t=4.4";copyVideoLink(expected);bool copied=ownClipboard()==wide(expected),suppressed=lastClipboardVideo==clipboardVideoUrl(wide(expected));copyVideoLink("https://evil.example/video/BV1cjHK6GEJE");bool rejected=ownClipboard()==wide(expected);HRESULT restore=OleSetClipboard(prior);if(SUCCEEDED(restore))restore=OleFlushClipboard();if(prior)prior->Release();OleUninitialize();std::cout<<json({{"copied",copied},{"self_navigation_suppressed",suppressed},{"untrusted_rejected",rejected},{"previous_clipboard_restored",SUCCEEDED(restore)}}).dump();return copied&&suppressed&&rejected&&SUCCEEDED(restore)?0:4;}
#ifdef BILI_DOWNLOAD_TEST
if(argc==4){runDownloadPlan(argv[1],argv[2],argv[3]);MSG msg{};while(PeekMessageW(&msg,nullptr,0,0,PM_REMOVE)){TranslateMessage(&msg);DispatchMessageW(&msg);}std::cout<<json(events).dump();return !events.empty()&&events.back().value("ok",false)?0:5;}
#endif
return 1;}
