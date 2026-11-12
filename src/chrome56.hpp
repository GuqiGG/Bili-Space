#pragma once
// The persistent header: a transparent WebView above every page in the composition's header layer. It never
// navigates, so switching pages cannot rebuild or stall it. It is told the active page's address the moment a
// navigation starts, and the links and history actions it receives are carried out on the active page.
// It lives on a Bilibili URL that the host answers locally, so account, favorites and message requests keep the
// site's cookies.
namespace chromeHost{
const std::wstring address=L"https://www.bilibili.com/__bili_space_chrome__";
ICoreWebView2Controller* ctl{};ICoreWebView2* view{};bool ready=false;std::wstring pending,injection;
bool active(){return comp::ready;}
// Not while fullscreen: the hidden header keeps its size, so it comes back exactly as it left without re-laying out.
void place(){if(!ctl||full)return;RECT rc{};GetClientRect(windowHandle,&rc);ctl->put_Bounds(rc);}
void show(bool on){comp::chromeVisible=on&&ready;if(ctl)ctl->put_IsVisible(on?TRUE:FALSE);}
// Sends the active page's address and history state; `target` is a navigation that is only starting.
void push(const std::wstring& target=L""){
    if(!view||!ready)return;Tab* t=activeTab;std::wstring url=target;BOOL back{},forward{};
    if(t&&t->view){if(url.empty()){LPWSTR s{};t->view->get_Source(&s);url=s?s:L"";CoTaskMemFree(s);t->view->get_CanGoBack(&back);t->view->get_CanGoForward(&forward);}else back=TRUE;}
    if(url.rfind(L"https://",0)!=0)return;
    json state={{"url",utf8(url)},{"back",bool(back)},{"forward",bool(forward)},{"video",bool(t&&t->video)},{"starting",!target.empty()}};
    view->ExecuteScript(wide("window.BiliSpace?.chromeActive?.("+state.dump()+")").c_str(),nullptr);
}
// Links followed in the header open on the active page; videos keep opening in their own view.
void navigate(const std::wstring& uri){
    if(uri.size()>4096||!trusted(uri))return;auto key=videoTabKey(uri);
    if(!key.empty()&&!officialVideoStyle()){openVideoTab(uri,key,activeTab);return;}
    Tab* t=activeTab&&(!activeTab->video||!key.empty())?activeTab:homeTab;if(!t||!t->view)return;
    if(t!=activeTab&&samePage(uri,currentSource(t))){activateTab(t);return;}
    activateTab(t);t->view->Navigate(uri.c_str());
}
void broadcastConfig(){
    auto script=wide("window.BiliSpace?.acceptConfig?.("+config.dump()+",0)");
    for(auto t:tabs)if(t->view)t->view->ExecuteScript(script.c_str(),nullptr);if(view)view->ExecuteScript(script.c_str(),nullptr);
}
void receiveFromHeaderUnchecked(ICoreWebView2WebMessageReceivedEventArgs* args);
// A malformed message from the header view (a plugin runs there too) must never let an exception escape the WebView2
// callback, which would end the whole program.
void receiveFromHeader(ICoreWebView2WebMessageReceivedEventArgs* args){try{receiveFromHeaderUnchecked(args);}catch(const std::exception& e){log(std::string("header message rejected: ")+e.what());}}
void receiveFromHeaderUnchecked(ICoreWebView2WebMessageReceivedEventArgs* args){
    LPWSTR body{};args->get_WebMessageAsJson(&body);std::string raw=body?utf8(body):"";CoTaskMemFree(body);if(raw.size()>256*1024)return;
    json m;try{m=json::parse(raw);}catch(...){return;}auto type=m.value("type",std::string{}),action=m.value("action",std::string{});
    if(type=="chrome-layout"){
        comp::chromeModal=m.value("modal",false);comp::chromeRects.clear();
        if(m.contains("rects")&&m["rects"].is_array())for(auto& r:m["rects"])if(r.is_array()&&r.size()==4&&comp::chromeRects.size()<32)comp::chromeRects.push_back({r[0].get<LONG>(),r[1].get<LONG>(),r[2].get<LONG>(),r[3].get<LONG>()});
        return;
    }
    if(type=="navigate"){navigate(wide(m.value("url",std::string{})));return;}
    // The header also needs the saved visibility of the back/forward buttons and the channel arrow, or it keeps them hidden.
    if(type=="navigation-state"&&action=="read"){view->ExecuteScript(wide("window.__bsAcceptNavigationState?.("+json{{"back",false},{"forward",false},{"visible",navigationVisible},{"categoryVisible",categoryVisible},{"route",""}}.dump()+")").c_str(),nullptr);push();return;}
    if(type=="window"&&activeTab&&activeTab->view&&(action=="back"||action=="forward"||action=="reload")){
        if(action=="back")stepActive(-1);else if(action=="forward")stepActive(1);else activeTab->view->Reload();return;
    }
    if(type=="surface-ready"||type=="surface"||type=="tab-info"||type=="app-visibility"||type=="load-ai")return;
    // Everything else is the ordinary header protocol, answered in the header view.
    ICoreWebView2* previousView=webview;ICoreWebView2Controller* previousController=controller;bool previousActive=viewScopeActive;
    webview=view;controller=ctl;viewScopeActive=false;receive(args);webview=previousView;controller=previousController;viewScopeActive=previousActive;
    if(type=="config")broadcastConfig();
}
void create(ICoreWebView2Environment* env){
    if(!active()||ctl)return;
    auto done=callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,HRESULT,ICoreWebView2Controller*>([env](HRESULT hr,ICoreWebView2Controller* c){
        if(FAILED(hr)||!c){log("header view creation failed: "+std::to_string(hr));return S_OK;}
        ctl=c;ctl->AddRef();ctl->get_CoreWebView2(&view);comp::chromeController=ctl;
        ICoreWebView2Controller2* c2{};if(SUCCEEDED(ctl->QueryInterface(__uuidof(ICoreWebView2Controller2),reinterpret_cast<void**>(&c2)))){c2->put_DefaultBackgroundColor({0,0,0,0});c2->Release();}
        place();ctl->put_IsVisible(FALSE);
        ICoreWebView2Settings* settings{};view->get_Settings(&settings);settings->put_AreDefaultContextMenusEnabled(FALSE);settings->put_IsStatusBarEnabled(FALSE);settings->put_AreDevToolsEnabled(testing);settings->put_IsZoomControlEnabled(FALSE);lightenSettings(settings);settings->Release();
        EventRegistrationToken token;
        auto message=callback<ICoreWebView2WebMessageReceivedEventHandler,ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs*>([](ICoreWebView2*,auto args){receiveFromHeader(args);return S_OK;});view->add_WebMessageReceived(message,&token);message->Release();
        auto accelerator=callback<ICoreWebView2AcceleratorKeyPressedEventHandler,ICoreWebView2Controller*,ICoreWebView2AcceleratorKeyPressedEventArgs*>([](ICoreWebView2Controller*,auto args){UINT key{};COREWEBVIEW2_KEY_EVENT_KIND kind{};args->get_VirtualKey(&key);args->get_KeyEventKind(&kind);if(tabAccelerator(key,kind))args->put_Handled(TRUE);return S_OK;});ctl->add_AcceleratorKeyPressed(accelerator,&token);accelerator->Release();
        // The header never leaves its own document: anything else it tries to open happens on the active page.
        auto starting=callback<ICoreWebView2NavigationStartingEventHandler,ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs*>([](ICoreWebView2*,auto args){LPWSTR u{};args->get_Uri(&u);std::wstring uri=u?u:L"";CoTaskMemFree(u);if(uri.rfind(address,0)==0)return S_OK;args->put_Cancel(TRUE);navigate(uri);return S_OK;});view->add_NavigationStarting(starting,&token);starting->Release();
        auto popup=callback<ICoreWebView2NewWindowRequestedEventHandler,ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs*>([env](ICoreWebView2*,auto args){LPWSTR uri{};args->get_Uri(&uri);if(uri){if(authProvider50(uri))authPopup50(env,args);else{args->put_Handled(TRUE);navigate(uri);}CoTaskMemFree(uri);}return S_OK;});view->add_NewWindowRequested(popup,&token);popup->Release();
        // The header loads the client's own fonts and icons from bili-space.local like every page does; without this mapping
        // its load waited seconds on a host that does not exist before the header could appear.
        {ICoreWebView2_3* v3{};if(SUCCEEDED(view->QueryInterface(__uuidof(ICoreWebView2_3),reinterpret_cast<void**>(&v3)))&&v3){v3->SetVirtualHostNameToFolderMapping(L"bili-space.local",(root/L"assets").c_str(),COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);v3->Release();}}
        view->AddWebResourceRequestedFilter((address+L"*").c_str(),COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT);
        auto local=callback<ICoreWebView2WebResourceRequestedEventHandler,ICoreWebView2*,ICoreWebView2WebResourceRequestedEventArgs*>([env](ICoreWebView2*,auto args){
            static const std::string html="<!doctype html><html lang=\"zh-CN\" data-bs-chrome-view=\"true\"><head><meta charset=\"utf-8\"><title>Bili-Space</title><style>html,body{margin:0;background:transparent!important;overflow:hidden}</style></head><body></body></html>";
            IStream* stream{};if(FAILED(CreateStreamOnHGlobal(nullptr,TRUE,&stream)))return S_OK;ULONG written{};stream->Write(html.data(),ULONG(html.size()),&written);LARGE_INTEGER zero{};stream->Seek(zero,STREAM_SEEK_SET,nullptr);
            ICoreWebView2WebResourceResponse* response{};if(SUCCEEDED(env->CreateWebResourceResponse(stream,200,L"OK",L"Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store",&response))){args->put_Response(response);response->Release();}stream->Release();return S_OK;});
        view->add_WebResourceRequested(local,&token);local->Release();
        auto loaded=callback<ICoreWebView2NavigationCompletedEventHandler,ICoreWebView2*,ICoreWebView2NavigationCompletedEventArgs*>([](ICoreWebView2*,auto args){BOOL ok{};args->get_IsSuccess(&ok);if(!ok){log("header view failed to load");return S_OK;}ready=true;show(!full&&!pip);applyZoom();push();log("header view ready");return S_OK;});view->add_NavigationCompleted(loaded,&token);loaded->Release();
        auto injected=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([](HRESULT hr,LPCWSTR id){if(SUCCEEDED(hr)&&id)injection=id;if(view)view->Navigate(address.c_str());return S_OK;});
        view->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),injected);injected->Release();
        return S_OK;
    });
    comp::createController(env,done,true);done->Release();
}
void refreshInjection(){if(view){view->Reload();}}
// Keeps the header's document script current (settings, plugins) for its next load without reloading it now.
void rescript(){
    if(!view||injection.empty())return;view->RemoveScriptToExecuteOnDocumentCreated(injection.c_str());injection.clear();
    auto h=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([](HRESULT hr,LPCWSTR id){if(SUCCEEDED(hr)&&id)injection=id;return S_OK;});
    view->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),h);h->Release();
}
void close(){comp::chromeController=nullptr;comp::chromeVisible=false;if(ctl){comp::forget(ctl);ctl->Close();ctl->Release();ctl=nullptr;}if(view){view->Release();view=nullptr;}ready=false;}
}
// In the tray nothing is on screen: every view is hidden and suspended at low memory; coming back wakes the visible
// page and the header only (other videos wake when switched to, as before).
void chromeMemory(bool low){ICoreWebView2_19* v19{};if(chromeHost::view&&SUCCEEDED(chromeHost::view->QueryInterface(__uuidof(ICoreWebView2_19),reinterpret_cast<void**>(&v19)))){v19->put_MemoryUsageTargetLevel(low?COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW:COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL);v19->Release();}}
void trayMemory(bool hidden){
    if(hidden){for(auto t:tabs)if(t->controller&&!t->closed){t->controller->put_IsVisible(FALSE);tabMemory(t,true);}if(chromeHost::ctl){chromeHost::ctl->put_IsVisible(FALSE);chromeMemory(true);}return;}
    if(activeTab&&activeTab->controller){tabMemory(activeTab,false);activeTab->controller->put_IsVisible(TRUE);}
    if(chromeHost::ctl){chromeMemory(false);chromeHost::show(!full&&!pip);}
}
