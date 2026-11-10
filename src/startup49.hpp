#pragma once

bool writableAppData(const fs::path& directory){
    std::error_code error;fs::create_directories(directory,error);if(error)return false;
    auto probe=directory/(L".write-check-"+std::to_wstring(GetCurrentProcessId()));
    HANDLE file=CreateFileW(probe.c_str(),GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,CREATE_NEW,FILE_ATTRIBUTE_TEMPORARY|FILE_FLAG_DELETE_ON_CLOSE,nullptr);
    if(file==INVALID_HANDLE_VALUE)return false;CloseHandle(file);return true;
}

// Keep the original profile intact when Windows denies the application write access.
bool prepareAppData(){
    if(testing)return writableAppData(dataPath);
    auto original=dataPath,portable=root/L".userdata";
    if(fs::exists(portable/L"profile-ready")){dataPath=portable;return writableAppData(dataPath);}
    if(writableAppData(original))return true;
    if(!writableAppData(portable))return false;
    dataPath=portable;log("startup: original data directory is not writable; using local profile");
    const std::vector<std::wstring> files={L"settings.json",L"accounts.json",L"accounts50.json",L"community44.json",L"download-queue.json",L"proxy-enabled"};
    std::error_code error;
    for(const auto& name:files){fs::copy_file(original/name,portable/name,fs::copy_options::skip_existing,error);error.clear();}
    for(const auto& name:{L"WebView2",L"mihomo"}){
        auto source=original/name;
        fs::recursive_directory_iterator it(source,fs::directory_options::skip_permission_denied,error),end;
        while(!error&&it!=end){
            const auto entry=*it;auto relative=entry.path().lexically_relative(source);auto filename=entry.path().filename().wstring();
            std::transform(filename.begin(),filename.end(),filename.begin(),::towlower);
            bool skip=filename==L"cache"||filename==L"code cache"||filename==L"gpucache"||filename==L"shadercache"||filename==L"grshadercache"||filename==L"graphitedawncache"||filename==L"dawncache"||filename==L"crashpad"||filename==L"service worker";
            std::error_code copyError;
            if(entry.is_symlink(copyError)||skip){if(entry.is_directory(copyError))it.disable_recursion_pending();}
            else if(entry.is_directory(copyError))fs::create_directories(portable/name/relative,copyError);
            else if(entry.is_regular_file(copyError))fs::copy_file(entry.path(),portable/name/relative,fs::copy_options::skip_existing,copyError);
            if(copyError)log("startup: some profile files could not be copied; originals retained");
            it.increment(error);
        }
        error.clear();
    }
    std::ofstream marker(portable/L"profile-ready");marker<<"Original profile retained. Local recovery profile.\n";
    return bool(marker);
}
