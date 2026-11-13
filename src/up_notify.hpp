#pragma once
// UP 主更新通知: a small always-on-top card at the bottom right of the screen (the work area of the monitor the client
// is on, not the client window). It never takes focus, slides in from the right edge and out again, and opens a video
// in the client when its button is pressed. The page is assets/up-notify.html; the header layer finds the uploads.
namespace upNotify {
HWND window{};ICoreWebView2Controller* ctl{};ICoreWebView2* view{};bool ready=false;json queued;
RECT work{};double scale=1;int width=0,height=0,finalX=0,finalY=0;double animFrom=0,animTo=0;ULONGLONG animStart=0;int animMs=0;bool leaving=false;
constexpr UINT_PTR animTimer=1;
double ease(double t,bool out){return out?t*t*t:1-std::pow(1-t,3);}
// Only the part inside the work area is drawn while it slides, so it appears from the screen edge, not over the next monitor.
void place(int x){
    if(!window)return;SetWindowPos(window,HWND_TOPMOST,x,finalY,width,height,SWP_NOACTIVATE);if(ctl)ctl->NotifyParentWindowPositionChanged();
    if(x==finalX){SetWindowRgn(window,nullptr,TRUE);return;}
    const int visible=std::max(0,int(work.right)-x);SetWindowRgn(window,CreateRectRgn(0,0,std::min(visible,width),height),TRUE);
}
void animate(double to,int ms,bool out){RECT r{};GetWindowRect(window,&r);animFrom=r.left;animTo=to;animStart=GetTickCount64();animMs=ms;leaving=out;SetTimer(window,animTimer,15,nullptr);}
void destroy(){if(ctl){ctl->Close();ctl->Release();ctl=nullptr;}if(view){view->Release();view=nullptr;}ready=false;if(window){HWND w=window;window=nullptr;DestroyWindow(w);}}
void layout(int contentDip){
    if(!window)return;HMONITOR mon=MonitorFromWindow(windowHandle?windowHandle:window,MONITOR_DEFAULTTOPRIMARY);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(mon,&mi);work=mi.rcWork;
    using Dpi=UINT(WINAPI*)(HWND);static auto dpi=reinterpret_cast<Dpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));scale=(dpi?dpi(window):96)/96.0;
    const int margin=int(16*scale);width=int(400*scale);height=std::max(int(60*scale),int(std::min(contentDip,520)*scale));
    finalX=work.right-width-margin;finalY=work.bottom-height-margin;
    if(ctl){RECT b{0,0,width,height};ctl->put_Bounds(b);}
}
LRESULT CALLBACK proc(HWND h,UINT m,WPARAM w,LPARAM l){
    if(m==WM_MOUSEACTIVATE)return MA_NOACTIVATE;
    if(m==WM_TIMER&&w==animTimer){
        const double t=std::min(1.0,(GetTickCount64()-animStart)/double(std::max(1,animMs)));
        place(int(std::lround(animFrom+(animTo-animFrom)*ease(t,leaving))));
        if(t>=1){KillTimer(h,animTimer);if(leaving)destroy();}return 0;
    }
    if(m==WM_DISPLAYCHANGE||m==WM_DPICHANGED){RECT r{};GetClientRect(h,&r);layout(int((r.bottom-r.top)/scale));place(finalX);return 0;}
    return DefWindowProcW(h,m,w,l);
}
void deliver(){if(!ready||!view||queued.is_null())return;const auto js=L"render("+wide(queued.dump())+L")";queued=nullptr;view->ExecuteScript(js.c_str(),nullptr);}
void message(const json& m){
    const auto type=m.value("type",std::string{});
    if(type=="ready"){ready=true;deliver();}
    else if(type=="height"){const int dip=std::clamp(m.value("height",0),40,520);const bool first=!IsWindowVisible(window);layout(dip);
        // The view was made while its window was hidden; once the window is on screen it must be told to show and draw.
        if(first){place(work.right);ShowWindow(window,SW_SHOWNOACTIVATE);if(ctl){ctl->put_IsVisible(FALSE);ctl->put_IsVisible(TRUE);RECT b{0,0,width,height};ctl->put_Bounds(b);ctl->NotifyParentWindowPositionChanged();}animate(finalX,360,false);}else if(!leaving){KillTimer(window,animTimer);place(finalX);}}
    else if(type=="close"){if(window&&!leaving)animate(work.right,240,true);}
    else if(type=="open"){const auto bvid=m.value("bvid",std::string{});if(!std::regex_match(bvid,std::regex("BV[0-9A-Za-z]{10}")))return;
        const std::wstring uri=L"https://www.bilibili.com/video/"+wide(bvid)+L"/";restoreFromTray();
        if(activeTab&&activeTab->view)activeTab->view->Navigate(uri.c_str());else if(webview)webview->Navigate(uri.c_str());}
}
// Items come from the page and are checked again here: plain text, Bilibili image hosts and BV ids only.
json clean(const json& payload){
    json items=json::array();if(!payload.contains("items")||!payload["items"].is_array())return items;
    auto text=[](const json& v,size_t n){std::string s=v.is_string()?v.get<std::string>():std::string{};if(s.size()>n)s.resize(n);return s;};
    for(const auto& it:payload["items"]){if(items.size()>=3)break;if(!it.is_object())continue;const auto bvid=text(it.value("bvid",json()),16);if(!std::regex_match(bvid,std::regex("BV[0-9A-Za-z]{10}")))continue;
        auto image=[&](const char* k){auto u=text(it.value(k,json()),300);return std::regex_match(u,std::regex(R"(https?://i[0-9]\.hdslb\.com/bfs/[A-Za-z0-9_./-]+)"))?u:std::string{};};
        items.push_back({{"bvid",bvid},{"name",text(it.value("name",json()),80)},{"title",text(it.value("title",json()),300)},{"face",image("face")},{"cover",image("cover")}});}
    return items;
}
void show(const json& payload){
    auto items=clean(payload);if(items.empty()||!authEnvironment50)return;
    json data={{"items",items},{"dark",payload.value("dark",false)},{"accent",payload.value("accent",std::string("#fb7299"))}};
    if(window&&!leaving){queued=data;deliver();return;}
    if(window){KillTimer(window,animTimer);destroy();}
    queued=data;
    static bool registered=false;if(!registered){WNDCLASSW wc{};wc.style=CS_DROPSHADOW;wc.lpfnWndProc=proc;wc.hInstance=GetModuleHandleW(nullptr);wc.lpszClassName=L"BiliSpaceUpNotify";wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.hbrBackground=CreateSolidBrush(payload.value("dark",false)?RGB(31,32,35):RGB(255,255,255));RegisterClassW(&wc);registered=true;}
    window=CreateWindowExW(WS_EX_TOOLWINDOW|WS_EX_TOPMOST|WS_EX_NOACTIVATE,L"BiliSpaceUpNotify",L"UP 主更新",WS_POPUP,0,0,10,10,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);if(!window)return;
    const DWORD round=2;DwmSetWindowAttribute(window,33,&round,sizeof(round));
    layout(150);
    auto created=callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,HRESULT,ICoreWebView2Controller*>([](HRESULT hr,ICoreWebView2Controller* c){
        if(FAILED(hr)||!c||!window)return S_OK;ctl=c;ctl->AddRef();RECT b{0,0,width,height};ctl->put_Bounds(b);ctl->get_CoreWebView2(&view);
        ICoreWebView2Settings* s{};view->get_Settings(&s);if(s){s->put_AreDefaultContextMenusEnabled(FALSE);s->put_IsStatusBarEnabled(FALSE);s->put_AreDevToolsEnabled(testing);s->put_IsZoomControlEnabled(FALSE);s->Release();}
        ICoreWebView2_3* v3{};if(SUCCEEDED(view->QueryInterface(__uuidof(ICoreWebView2_3),reinterpret_cast<void**>(&v3)))){v3->SetVirtualHostNameToFolderMapping(L"bili-space.local",(root/L"assets").c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);v3->Release();}
        EventRegistrationToken t{};auto got=callback<ICoreWebView2WebMessageReceivedEventHandler,ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs*>([](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* a){
            LPWSTR raw{};if(SUCCEEDED(a->get_WebMessageAsJson(&raw))&&raw){try{message(json::parse(utf8(raw)));}catch(...){}CoTaskMemFree(raw);}return S_OK;});
        view->add_WebMessageReceived(got,&t);got->Release();
        view->Navigate(L"https://bili-space.local/up-notify.html");return S_OK;});
    authEnvironment50->CreateCoreWebView2Controller(window,created);created->Release();
}
}
