#pragma once
// Video pages open as their own native WebView next to the single home view. Only the active view is
// visible; a view that is switched away from pauses its media, is suspended and asks for low memory.
struct Tab{ICoreWebView2Controller* controller{};ICoreWebView2* view{};bool video=false,closed=false,suspended=false;std::wstring url,key,injectionId;std::string title,cover;unsigned long long used=0,order=0;};
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
    pushNavigationState();execute("window.BiliSpace?.tabShown?.()");
    if(GetForegroundWindow()==windowHandle)t->controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
    dockSync();
}
void closeTab(Tab* t){
    if(!t||!t->video||t->closed)return;t->closed=true;
    // Closing the visible video moves to its neighbour in the dock, like closing a browser tab; home only when no video is left.
    if(t==activeTab){auto list=videoTabs();Tab* next=homeTab;auto at=std::find(list.begin(),list.end(),t);if(at!=list.end()){if(at+1!=list.end()&&(*(at+1))->controller)next=*(at+1);else if(at!=list.begin()&&(*(at-1))->controller)next=*(at-1);}activateTab(next);}
    if(t->controller){t->controller->Close();t->controller->Release();t->controller=nullptr;}
    if(t->view){t->view->Release();t->view=nullptr;}
    tabs.erase(std::remove(tabs.begin(),tabs.end(),t),tabs.end());delete t;dockSync();
}
void openVideoTab(const std::wstring& uri,const std::wstring& key){
    for(auto t:videoTabs())if(t->key==key){if(t->controller)activateTab(t);return;}
    auto list=videoTabs();
    if(list.size()>=maxVideoTabs){Tab* oldest{};for(auto t:list)if(t!=activeTab&&(!oldest||t->used<oldest->used))oldest=t;closeTab(oldest);}
    auto t=new Tab;t->video=true;t->url=uri;t->key=key;t->order=++tabClock;t->used=t->order;tabs.push_back(t);dockSync();
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
        activateTab(t);log("video view opened");return S_OK;
    });
    env->CreateCoreWebView2Controller(windowHandle,created);created->Release();
}
// Videos opened from home (or from another video) get their own view; site pages opened from a video return to home.
bool routeTabNavigation(ICoreWebView2* sender,const std::wstring& uri){
    if(updateRequired||pip||!homeTab||!homeTab->view)return false;
    Tab* from=tabForView(sender);if(!from)return false;
    auto key=videoTabKey(uri);
    if(!key.empty()){
        if(from->video&&from->key==key)return false;
        if(from==homeTab){LPWSTR source{};homeTab->view->get_Source(&source);std::wstring current=source?source:L"";CoTaskMemFree(source);if(current.rfind(L"https://",0)!=0)return false;}
        cancelNavigationFeedback(sender);openVideoTab(uri,key);return true;
    }
    if(from->video&&homeDestination(uri)){cancelNavigationFeedback(sender);homeTab->view->Navigate(uri.c_str());activateTab(homeTab);return true;}
    return false;
}
bool tabAccelerator(UINT key,COREWEBVIEW2_KEY_EVENT_KIND kind){
    if(!(GetKeyState(VK_CONTROL)&0x8000)||(GetKeyState(VK_MENU)&0x8000)||(GetKeyState(VK_SHIFT)&0x8000))return false;
    if(kind!=COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN&&kind!=COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN)return false;
    // Ctrl+1-9 are the videos in dock order; Ctrl+T returns home.
    if(key=='T'){if(homeTab)activateTab(homeTab);return true;}
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
void closeAllTabs(){if(homeTab){webview=homeTab->view;controller=homeTab->controller;}activeTab=homeTab;auto list=videoTabs();for(auto t:list){t->closed=true;if(t->controller){t->controller->Close();t->controller->Release();}if(t->view)t->view->Release();delete t;}for(auto t:tabs)if(!t->video)delete t;tabs.clear();homeTab=activeTab=nullptr;}
#include "dock55.hpp"
