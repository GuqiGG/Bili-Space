#pragma once
#include "composition56.hpp"
// Video pages open as their own native WebView next to the single home view. Only the active view is
// visible; a view that is switched away from pauses its media, is suspended and asks for low memory.
struct Tab{ICoreWebView2Controller* controller{};ICoreWebView2* view{};Tab* opener{};bool video=false,closed=false,suspended=false,pendingShow=false;std::wstring url,key,injectionId;std::string title,cover;unsigned long long used=0,order=0;};
std::vector<Tab*> tabs;Tab* homeTab{};Tab* activeTab{};unsigned long long tabClock=0;bool viewScopeActive=true;
constexpr size_t maxVideoTabs=9;
void fit();void applyZoom();std::string script();void wireView(ICoreWebView2Controller*,ICoreWebView2*,ICoreWebView2Environment*);
void dockSync();void dockLayout();
Tab* tabForView(ICoreWebView2* view){for(auto t:tabs)if(t->view==view)return t;return nullptr;}
Tab* tabForController(ICoreWebView2Controller* c){for(auto t:tabs)if(t->controller==c)return t;return nullptr;}
// Event handlers run against the view that raised them, so replies and navigation reach that page.
struct ViewScope{
    ICoreWebView2* previousView;ICoreWebView2Controller* previousController;bool previousActive,active=true;
    void enter(Tab* t){if(t&&t->view){webview=t->view;controller=t->controller;active=t==activeTab;}viewScopeActive=active;}
    explicit ViewScope(ICoreWebView2* sender):previousView(webview),previousController(controller),previousActive(viewScopeActive){enter(tabForView(sender));}
    explicit ViewScope(ICoreWebView2Controller* sender):previousView(webview),previousController(controller),previousActive(viewScopeActive){enter(tabForController(sender));}
    ~ViewScope(){if(activeTab&&activeTab->view){webview=activeTab->view;controller=activeTab->controller;}else{webview=previousView;controller=previousController;}viewScopeActive=previousActive;}
};
std::vector<Tab*> videoTabs(){std::vector<Tab*> v;for(auto t:tabs)if(t->video&&!t->closed)v.push_back(t);std::sort(v.begin(),v.end(),[](Tab* a,Tab* b){return a->order<b->order;});return v;}
std::wstring videoTabKey(const std::wstring& uri){
    static const std::wregex pattern(LR"(^https://www\.bilibili\.com/(?:zh-Hans/)?(?:video/(BV[A-Za-z0-9]{10})|bangumi/play/((?:ep|ss)[0-9]{1,12}))(?:[/?#].*)?$)");
    std::wsmatch m;if(uri.size()>4096||!std::regex_match(uri,m,pattern))return {};return m[1].matched?m[1].str():m[2].str();
}
bool homeDestination(const std::wstring& uri){
    for(auto host:{L"www.bilibili.com",L"t.bilibili.com",L"space.bilibili.com",L"search.bilibili.com",L"message.bilibili.com",L"live.bilibili.com"})if(uri.rfind(std::wstring(L"https://")+host+L"/",0)==0)return true;
    return false;
}
void tabMemory(Tab* t,bool low){
    if(!t||!t->view)return;
    ICoreWebView2_19* v19{};if(SUCCEEDED(t->view->QueryInterface(__uuidof(ICoreWebView2_19),reinterpret_cast<void**>(&v19)))){v19->put_MemoryUsageTargetLevel(low?COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW:COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL);v19->Release();}
    ICoreWebView2_3* v3{};if(SUCCEEDED(t->view->QueryInterface(__uuidof(ICoreWebView2_3),reinterpret_cast<void**>(&v3)))){
        if(low&&!t->suspended){auto done=callback<ICoreWebView2TrySuspendCompletedHandler,HRESULT,BOOL>([t](HRESULT hr,BOOL ok){if(SUCCEEDED(hr)&&ok&&t!=activeTab)t->suspended=true;return S_OK;});v3->TrySuspend(done);done->Release();}
        else if(!low&&t->suspended){v3->Resume();t->suspended=false;}
        v3->Release();
    }
}
void cancelNavigationFeedback(ICoreWebView2* view){if(view)view->ExecuteScript(L"window.BiliSpace?.setLoading?.(false);window.BiliSpace?.cancelVideoLoading?.()",nullptr);}
void activateTab(Tab* t){
    if(!t||t->closed||!t->controller||t==activeTab)return;
    Tab* old=activeTab;activeTab=t;t->used=++tabClock;webview=t->view;controller=t->controller;viewScopeActive=true;
    tabMemory(t,false);fit();t->controller->put_IsVisible(TRUE);
    if(old&&old->controller&&!old->closed){
        // The page remembers what was playing so switching back resumes it.
        old->view->ExecuteScript(L"window.BiliSpace?.tabHidden?window.BiliSpace.tabHidden():document.querySelectorAll('video,audio').forEach(m=>{try{m.pause()}catch{}})",nullptr);
        old->controller->put_IsVisible(FALSE);tabMemory(old,true);
    }
    comp::focusTarget=t->controller;pushNavigationState();chromePush();execute("window.BiliSpace?.tabShown?.()");
    if(GetForegroundWindow()==windowHandle)t->controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
    dockSync();
}
void closeTab(Tab* t){
    if(!t||!t->video||t->closed)return;t->closed=true;
    // Closing the visible video returns to the video watched before it; home only when no other video is open.
    if(t==activeTab){Tab* next=nullptr;for(auto o:videoTabs())if(o!=t&&o->controller&&(!next||o->used>next->used))next=o;activateTab(next?next:homeTab);}
    if(t->controller){comp::forget(t->controller);t->controller->Close();t->controller->Release();t->controller=nullptr;}
    if(t->view){t->view->Release();t->view=nullptr;}
    tabs.erase(std::remove(tabs.begin(),tabs.end(),t),tabs.end());delete t;dockSync();
}
constexpr UINT_PTR pendingRevealTimer=7755;
// A new video view loads hidden while the page that opened it keeps its loading animation, then takes over once ready.
void revealPendingTab(Tab* t){
    if(!t||!t->pendingShow||t->closed||!t->controller)return;t->pendingShow=false;Tab* from=activeTab;
    if(from&&from!=t->opener&&from!=t)return;
    auto shown=callback<ICoreWebView2ExecuteScriptCompletedHandler,HRESULT,LPCWSTR>([t,from](HRESULT,LPCWSTR){if(std::find(tabs.begin(),tabs.end(),t)==tabs.end()||t->closed)return S_OK;activateTab(t);t->view->ExecuteScript(L"window.BiliSpace?.surfaceRevealed?.()",nullptr);if(from&&from->view&&std::find(tabs.begin(),tabs.end(),from)!=tabs.end())cancelNavigationFeedback(from->view);return S_OK;});
    t->view->ExecuteScript(L"window.BiliSpace?.revealFade?.()",shown);shown->Release();
}
void revealPendingTabs(){for(auto t:videoTabs())revealPendingTab(t);}
void openVideoTab(const std::wstring& uri,const std::wstring& key,Tab* opener=nullptr){
    for(auto t:videoTabs())if(t->key==key){if(t->controller)activateTab(t);return;}
    auto list=videoTabs();
    if(list.size()>=maxVideoTabs){Tab* oldest{};for(auto t:list)if(t!=activeTab&&(!oldest||t->used<oldest->used))oldest=t;closeTab(oldest);}
    auto t=new Tab;t->video=true;t->url=uri;t->key=key;t->opener=opener;t->order=++tabClock;t->used=t->order;tabs.push_back(t);dockSync();
    if(!authEnvironment50){closeTab(t);return;}
    auto env=authEnvironment50;
    auto created=callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,HRESULT,ICoreWebView2Controller*>([t,env](HRESULT hr,ICoreWebView2Controller* c){
        if(std::find(tabs.begin(),tabs.end(),t)==tabs.end()){if(SUCCEEDED(hr)&&c)c->Close();return S_OK;}
        if(FAILED(hr)||!c){log("video view creation failed: "+std::to_string(hr));t->closed=false;closeTab(t);return S_OK;}
        t->controller=c;c->AddRef();c->get_CoreWebView2(&t->view);c->put_IsVisible(FALSE);
        ICoreWebView2Controller2* c2{};if(SUCCEEDED(c->QueryInterface(__uuidof(ICoreWebView2Controller2),reinterpret_cast<void**>(&c2)))){COREWEBVIEW2_COLOR color{255,BYTE(surfaceDark?22:250),BYTE(surfaceDark?22:250),BYTE(surfaceDark?24:250)};c2->put_DefaultBackgroundColor(color);c2->Release();}
        wireView(c,t->view,env);
        auto injected=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([t](HRESULT hr,LPCWSTR id){if(std::find(tabs.begin(),tabs.end(),t)==tabs.end()||!t->view)return S_OK;if(SUCCEEDED(hr)&&id)t->injectionId=id;t->view->Navigate(t->url.c_str());return S_OK;});
        t->view->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),injected);injected->Release();
        RECT rc{};GetClientRect(windowHandle,&rc);c->put_Bounds(rc);t->pendingShow=true;SetTimer(windowHandle,pendingRevealTimer,8000,nullptr);log("video view opened");return S_OK;
    });
    comp::createController(env,created);created->Release();
}
std::wstring currentSource(Tab* t){if(!t||!t->view)return {};LPWSTR source{};t->view->get_Source(&source);std::wstring s=source?source:L"";CoTaskMemFree(source);return s;}
// Compares pages by host and path, ignoring the locale prefix, a trailing slash, the query and the fragment.
std::wstring normalisedPage(std::wstring uri){uri=uri.substr(0,uri.find_first_of(L"?#"));auto scheme=uri.find(L"://");if(scheme==std::wstring::npos)return uri;auto slash=uri.find(L'/',scheme+3);std::wstring host=uri.substr(0,slash),path=slash==std::wstring::npos?L"/":uri.substr(slash);if(path.rfind(L"/zh-Hans",0)==0)path=path.substr(8);if(path.empty())path=L"/";if(path.size()>1&&path.back()==L'/')path.pop_back();return host+path;}
// Overseas accounts are sent from www/t.bilibili.com pages to their /zh-Hans copies, costing a round trip (or a
// whole extra page load) on every switch. Once a host and first path segment are seen doing that, they open there
// directly. Learned routes are kept in settings ("localeRoutes": ["www.bilibili.com/", "www.bilibili.com/video", ...]).
std::map<ICoreWebView2*,std::wstring> navigationStarts;
std::wstring localeRouteKey(const std::wstring& uri,bool* localized=nullptr){
    const std::wstring scheme=L"https://";if(uri.rfind(scheme,0)!=0)return L"";auto slash=uri.find(L'/',scheme.size());if(slash==std::wstring::npos)return L"";
    auto host=uri.substr(scheme.size(),slash-scheme.size());if(host!=L"www.bilibili.com"&&host!=L"t.bilibili.com")return L"";
    auto path=uri.substr(slash,uri.find_first_of(L"?#",slash)-slash);bool zh=path==L"/zh-Hans"||path.rfind(L"/zh-Hans/",0)==0;if(localized)*localized=zh;if(zh)path=path.size()>8?path.substr(8):L"/";
    auto end=path.find(L'/',1);return host+L"/"+(path.size()>1?path.substr(1,end==std::wstring::npos?std::wstring::npos:end-1):L"");
}
bool localeKnown(const std::wstring& key){for(auto& v:localeRoutes)if(v.is_string()&&wide(v.get<std::string>())==key)return true;return false;}
// Called for each top-level navigation start; returns the address to open instead, or an empty string.
std::wstring localeRedirect(ICoreWebView2* view,const std::wstring& uri,bool redirected,bool history){
    bool zh=false;auto key=localeRouteKey(uri,&zh);auto& previous=navigationStarts[view];
    if(!key.empty()&&zh){bool fromPlain=false;auto before=localeRouteKey(previous,&fromPlain);
        // Learn only from the site moving a plain address to its own /zh-Hans copy (server redirect or page script).
        if(!fromPlain&&before==key&&!localeKnown(key)&&localeRoutes.size()<32){localeRoutes.push_back(utf8(key));save();}}
    if(!redirected)previous=uri;
    if(key.empty()||zh||redirected||history||!localeKnown(key))return L"";
    auto slash=uri.find(L'/',8);auto rest=uri.substr(slash);return uri.substr(0,slash)+L"/zh-Hans"+(rest==L"/"?L"":rest);
}
// Back and forward skip history entries of the same page: Bilibili adds a /zh-Hans copy of the page it opens, and a
// plain GoBack lands on the original address, which forwards to the copy again and the button seems to do nothing.
void historyStep(ICoreWebView2* view,int direction){
    if(!view)return;view->AddRef();
    auto done=callback<ICoreWebView2CallDevToolsProtocolMethodCompletedHandler,HRESULT,LPCWSTR>([view,direction](HRESULT hr,LPCWSTR result){
        int steps=0;std::wstring target;
        if(SUCCEEDED(hr)&&result){auto history=json::parse(utf8(result),nullptr,false);
            if(history.is_object()&&history["entries"].is_array()){auto& entries=history["entries"];int current=history.value("currentIndex",-1),count=int(entries.size());
                if(current>=0&&current<count){auto here=normalisedPage(wide(entries[current].value("url",std::string{})));int i=current+direction;
                    while(i>=0&&i<count&&normalisedPage(wide(entries[i].value("url",std::string{})))==here)i+=direction;
                    if(i>=0&&i<count){steps=i-current;target=wide(entries[i].value("url",std::string{}));}}}}
        // The page's own history.go is a normal history load; Page.navigateToHistoryEntry left the next page idle for about 2s.
        // A history load of the home page sits idle about 2s before it starts parsing, while a fresh load takes ~0.4s;
        // home never offers forward, so going back to it opens it fresh.
        if(steps<0&&normalisedPage(target)==L"https://www.bilibili.com/")view->Navigate(target.c_str());
        else if(steps)view->ExecuteScript((L"history.go("+std::to_wstring(steps)+L")").c_str(),nullptr);
        else if(FAILED(hr)){if(direction<0)view->GoBack();else view->GoForward();}
        view->Release();return S_OK;});
    if(FAILED(view->CallDevToolsProtocolMethod(L"Page.getNavigationHistory",L"{}",done))){view->Release();if(direction<0)view->GoBack();else view->GoForward();}
    done->Release();
}
// Videos opened from home (or from another video) get their own view; site pages opened from a video return to home.
bool officialVideoStyle(){return config.value("officialVideoStyle",false);}
bool routeTabNavigation(ICoreWebView2* sender,const std::wstring& uri){
    if(updateRequired||pip||!homeTab||!homeTab->view)return false;
    Tab* from=tabForView(sender);if(!from)return false;
    auto key=videoTabKey(uri);
    // The official style plays a video as an ordinary page in the view it was clicked in, with no video dock.
    if(!key.empty()&&officialVideoStyle())return false;
    if(!key.empty()){
        if(from->video&&from->key==key)return false;
        if(from==homeTab){LPWSTR source{};homeTab->view->get_Source(&source);std::wstring current=source?source:L"";CoTaskMemFree(source);if(current.rfind(L"https://",0)!=0)return false;}
        sender->ExecuteScript(wide("window.BiliSpace?.beginVideoLoading?.("+json(utf8(uri)).dump()+")").c_str(),nullptr);openVideoTab(uri,key,from);return true;
    }
    if(from->video&&homeDestination(uri)){cancelNavigationFeedback(sender);if(normalisedPage(uri)!=normalisedPage(currentSource(homeTab)))homeTab->view->Navigate(uri.c_str());activateTab(homeTab);return true;}
    return false;
}
void chromeStep(int direction);
// Back/forward from anywhere (header buttons, mouse side buttons, Alt+arrows) take the same route: the header learns the
// direction first so it moves once, then the page steps past duplicate entries.
void stepActive(int direction){if(!activeTab||!activeTab->view)return;chromeStep(direction);historyStep(activeTab->view,direction);}
bool tabAccelerator(UINT key,COREWEBVIEW2_KEY_EVENT_KIND kind){
    if((key==VK_LEFT||key==VK_RIGHT)&&(GetKeyState(VK_MENU)&0x8000)&&!(GetKeyState(VK_CONTROL)&0x8000)&&!(GetKeyState(VK_SHIFT)&0x8000)){if(kind==COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN||kind==COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN)stepActive(key==VK_LEFT?-1:1);return true;}
    if(key==VK_BROWSER_BACK||key==VK_BROWSER_FORWARD){if(kind==COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN)stepActive(key==VK_BROWSER_BACK?-1:1);return true;}
    if(!(GetKeyState(VK_CONTROL)&0x8000)||(GetKeyState(VK_MENU)&0x8000)||(GetKeyState(VK_SHIFT)&0x8000))return false;
    if(kind!=COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN&&kind!=COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN)return false;
    // Ctrl+1-9 are the videos in dock order; Ctrl+T returns home.
    if(key=='T'){if(!homeTab)return true;if(activeTab==homeTab&&homeTab->view)homeTab->view->ExecuteScript(L"window.BiliSpace?.ctrlHome?.()",nullptr);else activateTab(homeTab);return true;}
    if(key>='1'&&key<='9'){auto list=videoTabs();size_t i=key-'1';if(i<list.size()&&list[i]->controller)activateTab(list[i]);return true;}
    if(key=='W'&&activeTab&&activeTab->video){closeTab(activeTab);return true;}
    return false;
}
void refreshTabInjections(){
    for(auto t:tabs){if(t==homeTab||!t->view)continue;if(!t->injectionId.empty())t->view->RemoveScriptToExecuteOnDocumentCreated(t->injectionId.c_str());t->injectionId.clear();
        auto h=callback<ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler,HRESULT,LPCWSTR>([t](HRESULT hr,LPCWSTR id){if(std::find(tabs.begin(),tabs.end(),t)!=tabs.end()&&SUCCEEDED(hr)&&id)t->injectionId=id;return S_OK;});
        t->view->AddScriptToExecuteOnDocumentCreated(wide(script()).c_str(),h);h->Release();}
}
void acceptTabInfo(const json& m){
    Tab* t=tabForView(webview);if(!t||!t->video)return;
    auto title=m.value("title",std::string{});if(title.size()>600)title.resize(600);
    auto cover=m.value("cover",std::string{});if(cover.size()>2048)cover.clear();
    if(title!=t->title||cover!=t->cover){t->title=title;t->cover=cover;dockSync();}
}
void closeAllTabs(){if(homeTab){webview=homeTab->view;controller=homeTab->controller;}activeTab=homeTab;auto list=videoTabs();for(auto t:list){t->closed=true;if(t->controller){comp::forget(t->controller);t->controller->Close();t->controller->Release();}if(t->view)t->view->Release();delete t;}for(auto t:tabs)if(!t->video)delete t;tabs.clear();homeTab=activeTab=nullptr;}
#include "dock55.hpp"
