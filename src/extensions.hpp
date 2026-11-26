#pragma once
// Browser extensions (Chrome/Edge extensions) loaded into the client's WebView2 profile.
// Userscripts can only do a part of what real extensions do (no background pages, no web requests), so extensions are
// imported as they are: an unpacked folder, a .zip or a .crx. They run in every page of the client. Nothing here ever
// opens a browser window: an extension's options page opens inside the client, and pages a script tries to open as a
// new window are already kept in the client by the NewWindowRequested handlers.
namespace ext {

// ---- environment options: switches extension support on ----
struct Options final:ICoreWebView2EnvironmentOptions,ICoreWebView2EnvironmentOptions6{
    ULONG refs=1;
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out) override{
        if(id==IID_IUnknown||id==__uuidof(ICoreWebView2EnvironmentOptions)){*out=static_cast<ICoreWebView2EnvironmentOptions*>(this);AddRef();return S_OK;}
        if(id==__uuidof(ICoreWebView2EnvironmentOptions6)){*out=static_cast<ICoreWebView2EnvironmentOptions6*>(this);AddRef();return S_OK;}
        *out=nullptr;return E_NOINTERFACE;}
    ULONG STDMETHODCALLTYPE AddRef() override{return ++refs;}
    ULONG STDMETHODCALLTYPE Release() override{ULONG n=--refs;if(!n)delete this;return n;}
    static HRESULT text(LPWSTR* out,const wchar_t* s){size_t n=(wcslen(s)+1)*sizeof(wchar_t);*out=static_cast<LPWSTR>(CoTaskMemAlloc(n));if(!*out)return E_OUTOFMEMORY;memcpy(*out,s,n);return S_OK;}
    // empty: the WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS the host sets keep working
    HRESULT STDMETHODCALLTYPE get_AdditionalBrowserArguments(LPWSTR* v) override{return text(v,L"");}
    HRESULT STDMETHODCALLTYPE put_AdditionalBrowserArguments(LPCWSTR) override{return S_OK;}
    HRESULT STDMETHODCALLTYPE get_Language(LPWSTR* v) override{return text(v,L"");}
    HRESULT STDMETHODCALLTYPE put_Language(LPCWSTR) override{return S_OK;}
    HRESULT STDMETHODCALLTYPE get_TargetCompatibleBrowserVersion(LPWSTR* v) override{return text(v,L"120.0.2210.55");}
    HRESULT STDMETHODCALLTYPE put_TargetCompatibleBrowserVersion(LPCWSTR) override{return S_OK;}
    HRESULT STDMETHODCALLTYPE get_AllowSingleSignOnUsingOSPrimaryAccount(BOOL* v) override{*v=FALSE;return S_OK;}
    HRESULT STDMETHODCALLTYPE put_AllowSingleSignOnUsingOSPrimaryAccount(BOOL) override{return S_OK;}
    HRESULT STDMETHODCALLTYPE get_AreBrowserExtensionsEnabled(BOOL* v) override{*v=TRUE;return S_OK;}
    HRESULT STDMETHODCALLTYPE put_AreBrowserExtensionsEnabled(BOOL) override{return S_OK;}
};

std::filesystem::path folder(){return dataPath/L"extensions";}
ICoreWebView2Profile7* profile(){
    if(!homeTab||!homeTab->view)return nullptr;ICoreWebView2_13* v13{};if(FAILED(homeTab->view->QueryInterface(__uuidof(ICoreWebView2_13),reinterpret_cast<void**>(&v13))))return nullptr;
    ICoreWebView2Profile* p{};v13->get_Profile(&p);v13->Release();if(!p)return nullptr;ICoreWebView2Profile7* p7{};p->QueryInterface(__uuidof(ICoreWebView2Profile7),reinterpret_cast<void**>(&p7));p->Release();return p7;}

void report(const std::string& event="",const std::string& message=""){
    auto send=[event,message](json list){executeEverywhere("window.BiliSpace?.acceptExtensions?.("+json{{"items",list},{"event",event},{"message",message},{"supported",true}}.dump()+")");};
    auto p=profile();if(!p){executeEverywhere("window.BiliSpace?.acceptExtensions?.("+json{{"items",json::array()},{"supported",false}}.dump()+")");return;}
    auto h=callback<ICoreWebView2ProfileGetBrowserExtensionsCompletedHandler,HRESULT,ICoreWebView2BrowserExtensionList*>([send](HRESULT hr,ICoreWebView2BrowserExtensionList* list){
        json items=json::array();if(SUCCEEDED(hr)&&list){UINT count{};list->get_Count(&count);
            for(UINT i=0;i<count&&i<64;i++){ICoreWebView2BrowserExtension* e{};if(FAILED(list->GetValueAtIndex(i,&e))||!e)continue;
                LPWSTR id{},name{};BOOL on{};e->get_Id(&id);e->get_Name(&name);e->get_IsEnabled(&on);
                items.push_back({{"id",id?utf8(id):""},{"name",name?utf8(name):""},{"enabled",bool(on)}});CoTaskMemFree(id);CoTaskMemFree(name);e->Release();}}
        send(items);return S_OK;});
    p->GetBrowserExtensions(h);h->Release();p->Release();
}

// .crx = a small header in front of a zip; the zip part is unpacked with Windows' own tar.exe (Windows 10 1803+)
bool unzip(const std::filesystem::path& zip,const std::filesystem::path& to){
    std::filesystem::create_directories(to);wchar_t sys[MAX_PATH]{};GetSystemDirectoryW(sys,MAX_PATH);
    std::wstring cmd=L"\""+std::wstring(sys)+L"\\tar.exe\" -xf \""+zip.wstring()+L"\" -C \""+to.wstring()+L"\"";
    STARTUPINFOW si{sizeof(si)};si.dwFlags=STARTF_USESHOWWINDOW;si.wShowWindow=SW_HIDE;PROCESS_INFORMATION pi{};
    if(!CreateProcessW(nullptr,cmd.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,nullptr,&si,&pi))return false;
    WaitForSingleObject(pi.hProcess,60000);DWORD code=1;GetExitCodeProcess(pi.hProcess,&code);CloseHandle(pi.hThread);CloseHandle(pi.hProcess);return code==0;}
std::filesystem::path manifestRoot(const std::filesystem::path& dir){
    if(std::filesystem::exists(dir/L"manifest.json"))return dir;std::error_code ec;
    for(auto& e:std::filesystem::directory_iterator(dir,ec))if(e.is_directory()&&std::filesystem::exists(e.path()/L"manifest.json"))return e.path();
    return {};}
std::filesystem::path unpack(const std::filesystem::path& source){
    namespace fs=std::filesystem;std::error_code ec;
    auto dest=folder()/(L"ext-"+std::to_wstring(GetTickCount64()));
    if(fs::is_directory(source)){if(!fs::exists(source/L"manifest.json"))throw std::runtime_error("这个文件夹里没有 manifest.json，不是浏览器扩展");
        fs::create_directories(dest);fs::copy(source,dest,fs::copy_options::recursive|fs::copy_options::overwrite_existing,ec);if(ec)throw std::runtime_error("复制扩展失败");return dest;}
    std::ifstream f(source,std::ios::binary);std::string bytes((std::istreambuf_iterator<char>(f)),{});
    if(bytes.size()<16||bytes.size()>200*1024*1024)throw std::runtime_error("扩展文件无效");
    size_t offset=0;auto u32=[&](size_t at){return uint32_t(uint8_t(bytes[at]))|uint32_t(uint8_t(bytes[at+1]))<<8|uint32_t(uint8_t(bytes[at+2]))<<16|uint32_t(uint8_t(bytes[at+3]))<<24;};
    if(bytes.compare(0,4,"Cr24")==0){auto version=u32(4);offset=version==3?12+size_t(u32(8)):16+size_t(u32(8))+size_t(u32(12));if(offset>=bytes.size())throw std::runtime_error("扩展文件无效");}
    if(bytes.compare(offset,2,"PK")!=0)throw std::runtime_error("只支持 .crx、.zip 或解压后的扩展文件夹");
    fs::create_directories(folder());auto zip=folder()/(L"import-"+std::to_wstring(GetTickCount64())+L".zip");
    {std::ofstream o(zip,std::ios::binary);o.write(bytes.data()+offset,std::streamsize(bytes.size()-offset));}
    bool ok=unzip(zip,dest);fs::remove(zip,ec);if(!ok)throw std::runtime_error("解压扩展失败");
    auto root=manifestRoot(dest);if(root.empty())throw std::runtime_error("压缩包里没有 manifest.json，不是浏览器扩展");return root;}

std::filesystem::path pick(bool directory){
    IFileOpenDialog* d{};if(FAILED(CoCreateInstance(CLSID_FileOpenDialog,nullptr,CLSCTX_INPROC_SERVER,IID_IFileOpenDialog,reinterpret_cast<void**>(&d))))return {};
    DWORD o{};d->GetOptions(&o);d->SetOptions(o|FOS_FORCEFILESYSTEM|(directory?FOS_PICKFOLDERS:0));
    d->SetTitle(directory?L"选择解压后的浏览器扩展文件夹（包含 manifest.json）":L"选择浏览器扩展（.crx 或 .zip）");
    if(!directory){COMDLG_FILTERSPEC spec[]={{L"浏览器扩展",L"*.crx;*.zip"}};d->SetFileTypes(1,spec);}
    std::filesystem::path result;if(SUCCEEDED(d->Show(windowHandle))){IShellItem* item{};if(SUCCEEDED(d->GetResult(&item))){PWSTR p{};if(SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH,&p))){result=p;CoTaskMemFree(p);}item->Release();}}
    d->Release();return result;}

void install(const std::filesystem::path& root){
    auto p=profile();if(!p){report("error","当前 WebView2 运行库不支持浏览器扩展，请更新 Microsoft Edge WebView2");return;}
    auto h=callback<ICoreWebView2ProfileAddBrowserExtensionCompletedHandler,HRESULT,ICoreWebView2BrowserExtension*>([](HRESULT hr,ICoreWebView2BrowserExtension* e){
        if(FAILED(hr)||!e){report("error","这个扩展无法载入（可能用了客户端不支持的权限）");return S_OK;}
        LPWSTR name{};e->get_Name(&name);std::string n=name?utf8(name):"扩展";CoTaskMemFree(name);log("extensions: added "+n);report("added",n);return S_OK;});
    p->AddBrowserExtension(root.c_str(),h);h->Release();p->Release();}

template<class F> void withExtension(const std::string& id,F f){
    auto p=profile();if(!p)return;
    auto h=callback<ICoreWebView2ProfileGetBrowserExtensionsCompletedHandler,HRESULT,ICoreWebView2BrowserExtensionList*>([id,f](HRESULT hr,ICoreWebView2BrowserExtensionList* list){
        if(SUCCEEDED(hr)&&list){UINT count{};list->get_Count(&count);for(UINT i=0;i<count;i++){ICoreWebView2BrowserExtension* e{};if(FAILED(list->GetValueAtIndex(i,&e))||!e)continue;
            LPWSTR eid{};e->get_Id(&eid);bool match=eid&&utf8(eid)==id;CoTaskMemFree(eid);if(match){f(e);e->Release();return S_OK;}e->Release();}}
        report("error","没有找到这个扩展");return S_OK;});
    p->GetBrowserExtensions(h);h->Release();p->Release();}

// the extension's options page, shown inside the client's own page view (no browser window)
void openOptions(const std::string& id){
    if(id.size()!=32||id.find_first_not_of("abcdefghijklmnop")!=std::string::npos)return;
    std::string page="options.html";std::error_code ec;
    for(auto& e:std::filesystem::recursive_directory_iterator(folder(),ec)){if(e.path().filename()!=L"manifest.json")continue;
        try{auto m=json::parse(read(e.path()));std::string o=m.contains("options_ui")?m["options_ui"].value("page",std::string{}):m.value("options_page",std::string{});
            if(!o.empty()&&std::filesystem::exists(e.path().parent_path()/wide(o))){page=o;break;}}catch(...){}}
    if(homeTab&&homeTab->view){homeTab->view->Navigate(wide("chrome-extension://"+id+"/"+page).c_str());activateTab(homeTab);}}

void action(const json& m){
    auto a=m.value("action",std::string{}),id=m.value("id",std::string{});
    try{
        if(a=="list"){report();return;}
        if(a=="import-file"||a=="import-folder"){auto src=pick(a=="import-folder");if(src.empty())return;install(unpack(src));return;}
        if(a=="toggle"){bool on=m.value("enabled",true);withExtension(id,[on](ICoreWebView2BrowserExtension* e){auto h=callback<ICoreWebView2BrowserExtensionEnableCompletedHandler,HRESULT>([](HRESULT){report();return S_OK;});e->Enable(on?TRUE:FALSE,h);h->Release();});return;}
        if(a=="remove"){withExtension(id,[](ICoreWebView2BrowserExtension* e){auto h=callback<ICoreWebView2BrowserExtensionRemoveCompletedHandler,HRESULT>([](HRESULT hr){report(SUCCEEDED(hr)?"removed":"error",SUCCEEDED(hr)?"":"移除失败");return S_OK;});e->Remove(h);h->Release();});return;}
        if(a=="options"){openOptions(id);return;}
    }catch(const std::exception& e){report("error",e.what());}
}
}
