#pragma once

std::string updateFileHash(const fs::path& file){
    std::ifstream in(file,std::ios::binary);if(!in)throw std::runtime_error("无法读取安装包");
    UpdateHash hash;hash.start();char buffer[65536];while(in){in.read(buffer,sizeof(buffer));if(in.gcount())hash.add(buffer,DWORD(in.gcount()));}if(!in.eof())throw std::runtime_error("安装包读取失败");return hash.finish();
}
std::wstring updateQuote(const std::wstring& arg){
    if(arg.find_first_of(L"\"\r\n")!=std::wstring::npos)throw std::runtime_error("更新路径包含无效字符");
    // All callers pass filenames or switches, not directory names ending in a backslash.
    return L"\""+arg+L"\"";
}
PROCESS_INFORMATION updateLaunch(const fs::path& exe,const std::wstring& arguments){
    STARTUPINFOW start{};start.cb=sizeof(start);start.dwFlags=STARTF_USESHOWWINDOW;start.wShowWindow=SW_HIDE;
    PROCESS_INFORMATION child{};auto line=updateQuote(exe.wstring())+L" "+arguments;
    if(!CreateProcessW(exe.c_str(),line.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,exe.parent_path().c_str(),&start,&child))throw std::runtime_error("无法启动更新程序："+std::to_string(GetLastError()));
    return child;
}
void updateValidateJob(const json& job,const fs::path& jobPath){
    const auto version=job.at("version").get<std::string>();releaseVersion(version);
    const auto package=fs::path(wide(job.at("package").get<std::string>()));
    if(!package.is_absolute()||package.filename()!=wide("Bili-Space-"+version+"-Setup.exe")||fs::weakly_canonical(package.parent_path())!=fs::weakly_canonical(jobPath.parent_path()))throw std::runtime_error("安装包路径无效");
    const fs::path install=wide(job.at("installDir").get<std::string>());
    if(!install.is_absolute()||install==install.root_path()||!fs::is_regular_file(install/L"Bili-Space.exe"))throw std::runtime_error("安装目录无效");
    updateQuote(install.wstring());
    if(!std::regex_match(job.at("sha256").get<std::string>(),std::regex("[a-f0-9]{64}"))||fs::file_size(package)!=job.at("size").get<unsigned long long>()||updateFileHash(package)!=job.at("sha256").get<std::string>())throw std::runtime_error("安装包已改变，拒绝安装");
    std::ifstream in(package,std::ios::binary);char signature[2]{};in.read(signature,2);if(signature[0]!='M'||signature[1]!='Z')throw std::runtime_error("不是有效的 Windows 安装包");
}
int runUpdateWorker(PWSTR command){
    if(std::wstring(command).rfind(L"--apply-update ",0)!=0)return -1;
    int argc{};auto argv=CommandLineToArgvW(GetCommandLineW(),&argc);fs::path jobPath;
    if(argc==3&&std::wstring(argv[1])==L"--apply-update")jobPath=argv[2];LocalFree(argv);if(jobPath.empty())return 2;
    json job;bool mayRestart=false;fs::path install;
    try{
        job=json::parse(read(jobPath));updateValidateJob(job,jobPath);install=wide(job.at("installDir").get<std::string>());
        HANDLE parent=OpenProcess(SYNCHRONIZE|PROCESS_QUERY_LIMITED_INFORMATION,FALSE,job.at("parentPid").get<DWORD>());
        if(!parent&&GetLastError()!=ERROR_INVALID_PARAMETER)throw std::runtime_error("无法确认客户端退出状态");
        if(parent){wchar_t parentName[32768];DWORD size=32768;bool matches=QueryFullProcessImageNameW(parent,0,parentName,&size)&&fs::weakly_canonical(parentName)==fs::weakly_canonical(install/L"Bili-Space.exe");
            if(!matches){CloseHandle(parent);throw std::runtime_error("更新父进程不匹配");}
            const auto wait=WaitForSingleObject(parent,60000);CloseHandle(parent);if(wait!=WAIT_OBJECT_0)throw std::runtime_error("客户端未退出，已取消安装");
        }
        // The running executable must be released before Inno Setup touches any application file.
        mayRestart=true;updateValidateJob(job,jobPath);
        auto package=fs::path(wide(job.at("package").get<std::string>()));
        auto child=updateLaunch(package,L"/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR="+updateQuote(install.wstring())+L" /LOG="+updateQuote((jobPath.parent_path()/L"install.log").wstring()));
        CloseHandle(child.hThread);auto wait=WaitForSingleObject(child.hProcess,10*60*1000);DWORD code=1;GetExitCodeProcess(child.hProcess,&code);CloseHandle(child.hProcess);
        if(wait!=WAIT_OBJECT_0){mayRestart=false;throw std::runtime_error("安装仍在进行，请查看安装日志");}
        if(code!=0)throw std::runtime_error("安装未完成，安装器返回 "+std::to_string(code));
        auto metadata=json::parse(read(install/L"assets/app-info.json"));if(metadata.at("version")!=job.at("version"))throw std::runtime_error("安装后版本校验失败");
        saveUpdateJson(jobPath.parent_path()/L"install-result.json",{{"success",true},{"version",job.at("version")},{"message","更新完成"}});
        auto resumed=updateLaunch(install/L"Bili-Space.exe",L"");CloseHandle(resumed.hThread);CloseHandle(resumed.hProcess);return 0;
    }catch(const std::exception& e){
        try{saveUpdateJson(jobPath.parent_path()/L"install-result.json",{{"success",false},{"message",e.what()}});}catch(...){}
        if(mayRestart)try{auto resumed=updateLaunch(install/L"Bili-Space.exe",L"");CloseHandle(resumed.hThread);CloseHandle(resumed.hProcess);}catch(...){}
        return 1;
    }
}
void startUpdateInstall(){
    if(updateBusy||readyUpdatePackage.empty()||!updateState.value("ready",false))return;
    if(downloadBusy.load()){updateState["message"]="视频正在下载，请等待完成或取消下载后再安装更新。";pushUpdateState();return;}
    try{
        const auto state=validateUpdate(updateState,appVersion);
        auto jobPath=dataPath/L"updates/install-job.json";
        json job={{"parentPid",GetCurrentProcessId()},{"installDir",utf8(root.wstring())},{"package",utf8(readyUpdatePackage.wstring())},{"version",state.at("version")},{"sha256",state.at("setupSha256")},{"size",state.at("setupSize")}};
        updateValidateJob(job,jobPath);saveUpdateJson(jobPath,job);
        auto worker=dataPath/L"updates/Bili-Space-update-worker.exe";
        fs::copy_file(root/L"Bili-Space.exe",worker,fs::copy_options::overwrite_existing);
        auto child=updateLaunch(worker,L"--apply-update "+updateQuote(jobPath.wstring()));CloseHandle(child.hThread);CloseHandle(child.hProcess);
        updateBusy=true;updateState["busy"]=true;updateState["message"]="正在安装更新…";pushUpdateState();
        execute("document.querySelectorAll('video,audio').forEach(v=>v.pause())");
        // Bypass the tray/close animation only for an explicitly requested update install.
        DestroyWindow(windowHandle);
    }catch(const std::exception& e){updateState["message"]=e.what();updateState["busy"]=false;updateBusy=false;pushUpdateState();}
}
