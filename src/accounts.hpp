#include <ctime>
// Account snapshots.
//
// A switch replays a saved cookie jar through the WebView2 cookie manager and
// reloads the page. No credential is re-entered and no second WebView2 profile
// is created, so switching costs one reload instead of a full sign-in flow.
struct AccountCookie {
    std::wstring name,value,domain,path;
    double expires=0;
    bool httpOnly=false,secure=false;
    int sameSite=0;
};
struct AccountEntry {
    std::string mid,uname,face;
    int level=0;
    long long savedAt=0;
    std::vector<AccountCookie> cookies;
};
std::vector<AccountEntry> accounts;
std::string activeAccountMid;
bool accountsLoaded=false;

fs::path accountsPath(){return dataPath/L"accounts.json";}
std::string narrow(const std::wstring& v){return utf8(v);}

json cookieJson(const AccountCookie& c){
    return json{{"name",narrow(c.name)},{"value",narrow(c.value)},{"domain",narrow(c.domain)},
                {"path",narrow(c.path)},{"expires",c.expires},{"httpOnly",c.httpOnly},
                {"secure",c.secure},{"sameSite",c.sameSite}};
}
AccountCookie cookieFromJson(const json& j){
    AccountCookie c;
    c.name=wide(j.value("name",std::string{}));
    c.value=wide(j.value("value",std::string{}));
    c.domain=wide(j.value("domain",std::string{}));
    c.path=wide(j.value("path",std::string("/")));
    c.expires=j.value("expires",0.0);
    c.httpOnly=j.value("httpOnly",false);
    c.secure=j.value("secure",false);
    c.sameSite=j.value("sameSite",0);
    return c;
}
json accountJson(const AccountEntry& a){
    json cookies=json::array();
    for(auto& c:a.cookies)cookies.push_back(cookieJson(c));
    return json{{"mid",a.mid},{"uname",a.uname},{"face",a.face},{"level",a.level},
                {"savedAt",a.savedAt},{"count",int(a.cookies.size())},{"cookies",cookies}};
}
// Cookie values stay in the browser process; the renderer only sees metadata.
json publicAccountJson(const AccountEntry& a){
    json j=accountJson(a);
    j.erase("cookies");
    return j;
}

void loadAccounts(){
    if(accountsLoaded)return;
    accountsLoaded=true;
    auto raw=read(accountsPath());
    if(raw.empty())return;
    try{
        auto stored=json::parse(raw);
        activeAccountMid=stored.value("active",std::string{});
        for(auto& item:stored.value("accounts",json::array())){
            AccountEntry a;
            a.mid=item.value("mid",std::string{});
            a.uname=item.value("uname",std::string{});
            a.face=item.value("face",std::string{});
            a.level=item.value("level",0);
            a.savedAt=item.value("savedAt",0LL);
            for(auto& c:item.value("cookies",json::array()))a.cookies.push_back(cookieFromJson(c));
            if(!a.mid.empty())accounts.push_back(std::move(a));
        }
    }catch(...){log("accounts.json unreadable; starting empty");}
}
void saveAccounts(){
    json list=json::array();
    for(auto& a:accounts)list.push_back(accountJson(a));
    json out{{"active",activeAccountMid},{"accounts",list}};
    auto target=accountsPath(),tmp=fs::path(target).concat(L".tmp");
    {std::ofstream f(tmp,std::ios::binary|std::ios::trunc);f<<out.dump();}
    if(!MoveFileExW(tmp.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))log("accounts.json save failed");
}
AccountEntry* findAccount(const std::string& mid){
    if(mid.empty())return nullptr;
    for(auto& a:accounts)if(a.mid==mid)return &a;
    return nullptr;
}
json accountsState(){
    loadAccounts();
    json list=json::array();
    for(auto& a:accounts)list.push_back(publicAccountJson(a));
    return json{{"action","state"},{"active",activeAccountMid},{"accounts",list}};
}
void pushAccounts(){execute("window.BiliSpace?.acceptAccounts("+accountsState().dump()+")");}

ICoreWebView2_2* webview2(){
    if(!webview)return nullptr;
    ICoreWebView2_2* value{};
    if(FAILED(webview->QueryInterface(IID_ICoreWebView2_2,reinterpret_cast<void**>(&value))))return nullptr;
    return value;
}
ICoreWebView2CookieManager* cookieManager(){
    auto host=webview2();
    if(!host)return nullptr;
    ICoreWebView2CookieManager* m{};
    host->get_CookieManager(&m);
    host->Release();
    return m;
}

// Reads bilibili's three cookie scopes into one deduplicated jar.
void readCookieJar(size_t index,std::vector<AccountCookie> out,std::function<void(std::vector<AccountCookie>)> done){
    static const std::vector<std::wstring> uris{L"https://www.bilibili.com/",L"https://passport.bilibili.com/",L"https://api.bilibili.com/"};
    if(index>=uris.size()){done(std::move(out));return;}
    auto manager=cookieManager();
    if(!manager){done(std::move(out));return;}
    auto next=[manager,index,out=std::move(out),done=std::move(done)](std::vector<AccountCookie> captured) mutable {
        manager->Release();
        for(auto& c:captured){
            bool duplicate=false;
            for(auto& seen:out)if(seen.name==c.name&&seen.domain==c.domain&&seen.path==c.path){seen=c;duplicate=true;break;}
            if(!duplicate)out.push_back(std::move(c));
        }
        readCookieJar(index+1,std::move(out),std::move(done));
    };
    auto handler=callback<ICoreWebView2GetCookiesCompletedHandler,HRESULT,ICoreWebView2CookieList*>(
        [next](HRESULT hr,ICoreWebView2CookieList* list) mutable {
            std::vector<AccountCookie> captured;
            if(SUCCEEDED(hr)&&list){
                UINT32 count{};
                if(SUCCEEDED(list->get_Count(&count))){
                    for(UINT32 i=0;i<count;i++){
                        ICoreWebView2Cookie* cookie{};
                        if(FAILED(list->GetValueAtIndex(i,&cookie))||!cookie)continue;
                        AccountCookie c;
                        LPWSTR text{};
                        if(SUCCEEDED(cookie->get_Name(&text))&&text){c.name=text;CoTaskMemFree(text);text=nullptr;}
                        if(SUCCEEDED(cookie->get_Value(&text))&&text){c.value=text;CoTaskMemFree(text);text=nullptr;}
                        if(SUCCEEDED(cookie->get_Domain(&text))&&text){c.domain=text;CoTaskMemFree(text);text=nullptr;}
                        if(SUCCEEDED(cookie->get_Path(&text))&&text){c.path=text;CoTaskMemFree(text);text=nullptr;}
                        cookie->get_Expires(&c.expires);
                        BOOL flag{};
                        if(SUCCEEDED(cookie->get_IsHttpOnly(&flag)))c.httpOnly=flag!=FALSE;
                        if(SUCCEEDED(cookie->get_IsSecure(&flag)))c.secure=flag!=FALSE;
                        COREWEBVIEW2_COOKIE_SAME_SITE_KIND same{};
                        if(SUCCEEDED(cookie->get_SameSite(&same)))c.sameSite=int(same);
                        cookie->Release();
                        if(!c.name.empty())captured.push_back(std::move(c));
                    }
                }
            }
            next(std::move(captured));
            return S_OK;
        });
    if(FAILED(manager->GetCookies(uris[index].c_str(),handler))){handler->Release();manager->Release();done(std::move(out));return;}
    handler->Release();
}

void storeAccount(const std::string& mid,const json& profile,std::vector<AccountCookie> jar){
    if(mid.empty())return;
    loadAccounts();
    auto entry=findAccount(mid);
    if(!entry){accounts.push_back(AccountEntry{mid,"","",0,0,{}});entry=findAccount(mid);}
    if(!entry)return;
    if(profile.is_object()){
        auto uname=profile.value("uname",std::string{});
        auto face=profile.value("face",std::string{});
        auto level=profile.value("level",0);
        if(!uname.empty())entry->uname=uname;
        if(!face.empty())entry->face=face;
        if(level>0)entry->level=level;
    }
    if(!jar.empty())entry->cookies=std::move(jar);
    entry->savedAt=static_cast<long long>(std::time(nullptr));
    saveAccounts();
}

void replayCookies(const std::vector<AccountCookie>& cookies,std::function<void()> done){
    auto manager=cookieManager();
    if(!manager){done();return;}
    manager->DeleteAllCookies();
    int written=0,skipped=0;
    for(auto& c:cookies){
        ICoreWebView2Cookie* cookie{};
        auto path=c.path.empty()?std::wstring(L"/"):c.path;
        if(FAILED(manager->CreateCookie(c.name.c_str(),c.value.c_str(),c.domain.c_str(),path.c_str(),&cookie))||!cookie){skipped++;continue;}
        if(c.expires>0)cookie->put_Expires(c.expires);
        cookie->put_IsHttpOnly(c.httpOnly?TRUE:FALSE);
        cookie->put_IsSecure(c.secure?TRUE:FALSE);
        if(c.sameSite>=0&&c.sameSite<=2)cookie->put_SameSite(static_cast<COREWEBVIEW2_COOKIE_SAME_SITE_KIND>(c.sameSite));
        if(SUCCEEDED(manager->AddOrUpdateCookie(cookie)))written++;else skipped++;
        cookie->Release();
    }
    manager->Release();
    log("account switch: "+std::to_string(written)+" cookies replayed, "+std::to_string(skipped)+" skipped");
    done();
}

// Switching always banks the outgoing jar first, so no account is ever lost.
void accountAction(const json& m){
    loadAccounts();
    auto action=m.value("action",std::string{});
    if(action=="state"){pushAccounts();return;}
    if(action=="capture"){
        auto mid=m.value("mid",std::string{});
        if(mid.empty())return;
        auto profile=m.value("profile",json::object());
        readCookieJar(0,{},[mid,profile](std::vector<AccountCookie> jar){
            storeAccount(mid,profile,std::move(jar));
            activeAccountMid=mid;
            saveAccounts();
            log("account captured: "+mid);
            pushAccounts();
        });
        return;
    }
    if(action=="activate"){
        auto target=m.value("mid",std::string{});
        auto entry=findAccount(target);
        if(!entry||entry->cookies.empty()){pushAccounts();return;}
        auto jar=entry->cookies;
        auto outgoing=activeAccountMid;
        auto profile=m.value("profile",json::object());
        readCookieJar(0,{},[outgoing,profile,target,jar](std::vector<AccountCookie> current){
            if(!outgoing.empty()&&outgoing!=target)storeAccount(outgoing,profile,std::move(current));
            replayCookies(jar,[target]{
                activeAccountMid=target;
                saveAccounts();
                if(webview)webview->Reload();
            });
        });
        return;
    }
    if(action=="forget"){
        auto mid=m.value("mid",std::string{});
        for(auto it=accounts.begin();it!=accounts.end();++it){
            if(it->mid==mid){accounts.erase(it);break;}
        }
        if(activeAccountMid==mid)activeAccountMid.clear();
        saveAccounts();
        pushAccounts();
        return;
    }
}
