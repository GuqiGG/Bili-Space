#pragma once
// Local plugin loader. Plugins are plain JS files from the user data directory;
// they run inside the page with the same privileges as the injected enhancer and
// receive no native bridge, no filesystem and no network capability from the host.
inline fs::path pluginsDirectory(){return dataPath/L"plugins";}
// Values of the settings plugins declare, by plugin id; kept in settings.json so every view sees the same ones.
void refreshInjection();void pluginsBroadcast(const std::string& script);void pluginsReloadViews();
inline bool pluginIdValid(const std::string& id){return std::regex_match(id,std::regex(R"([a-z0-9][a-z0-9._-]{0,39})"));}
inline std::string pluginField(const json& item,const char* key,size_t limit){
    if(!item.is_object()||!item.contains(key)||!item[key].is_string())return {};
    auto value=item[key].get<std::string>();
    if(value.size()>limit||value.find('\0')!=std::string::npos)return {};
    try{(void)json(value).dump();}catch(...){return {};}
    return value;
}
inline json pluginsRegistry(){
    json plugins=json::array(),errors=json::array();
    std::error_code ec;const auto root=pluginsDirectory();
    auto result=json{{"plugins",plugins},{"errors",errors},{"directory",utf8(root.wstring())}};
    if(!fs::is_directory(root,ec))return result;
    std::vector<fs::path> folders;
    for(auto& entry:fs::directory_iterator(root,ec))if(entry.is_directory())folders.push_back(entry.path());
    std::sort(folders.begin(),folders.end());
    if(folders.size()>32)folders.resize(32);
    for(const auto& folder:folders){
        try{
            const auto manifestPath=folder/L"plugin.json";
            if(!fs::is_regular_file(manifestPath,ec))continue;
            if(fs::file_size(manifestPath,ec)>16*1024)throw std::runtime_error("plugin.json 超过 16 KB");
            const auto manifest=json::parse(read(manifestPath));
            const auto id=pluginField(manifest,"id",64);
            if(!pluginIdValid(id))throw std::runtime_error("插件 id 无效（小写字母数字 . _ -）");
            auto name=pluginField(manifest,"name",80);if(name.empty())name=id;
            const auto version=pluginField(manifest,"version",32);
            const auto description=pluginField(manifest,"description",300);
            auto main=pluginField(manifest,"main",64);if(main.empty())main="main.js";
            if(main.find_first_of(std::string("\/"))!=std::string::npos||main.find("..")!=std::string::npos)throw std::runtime_error("main 只能是文件名");
            const auto mainPath=folder/wide(main);
            if(!fs::is_regular_file(mainPath,ec))throw std::runtime_error("缺少入口文件 "+main);
            if(fs::file_size(mainPath,ec)>512*1024)throw std::runtime_error("入口文件超过 512 KB");
            bool disabled=false;
            if(config.contains("pluginsDisabled")&&config["pluginsDisabled"].is_array())for(const auto& entry:config["pluginsDisabled"])if(entry.is_string()&&entry.get<std::string>()==id)disabled=true;
            json values=pluginData.contains(id)&&pluginData[id].is_object()?pluginData[id]:json::object();
            result["plugins"].push_back({{"id",id},{"name",name},{"version",version},{"description",description},{"main",main},{"enabled",!disabled},{"code",read(mainPath)},{"data",values}});
        }catch(const std::exception& e){
            result["errors"].push_back({{"folder",utf8(folder.filename().wstring())},{"message",e.what()}});
        }
    }
    return result;
}
inline json pluginDefinition(const std::string& id){for(auto& p:pluginsRegistry()["plugins"])if(p.value("id",std::string{})==id)return p;return nullptr;}
inline void pluginsToast(const std::string& text){pluginsBroadcast("window.BiliSpace?.proxyToast?.("+json(text).dump()+")");}
inline void pluginsSetDisabled(const std::string& id,bool off){
    json next=json::array();if(config.contains("pluginsDisabled")&&config["pluginsDisabled"].is_array())for(auto& v:config["pluginsDisabled"])if(v.is_string()&&v.get<std::string>()!=id)next.push_back(v);
    if(off&&next.size()<32)next.push_back(id);config["pluginsDisabled"]=next;
}
// Imports a plugin from its plugin.json (the whole folder is copied) or from a single .js file whose leading
// `// @id`, `// @name`, `// @version`, `// @description` comments describe it. Returns the plugin id.
inline std::string pluginsInstall(const fs::path& file){
    std::error_code ec;const auto root=pluginsDirectory();fs::create_directories(root,ec);
    auto lower=[](std::wstring v){for(auto& c:v)c=towlower(c);return v;};
    if(lower(file.filename().wstring())==L"plugin.json"){
        if(fs::file_size(file,ec)>16*1024)throw std::runtime_error("plugin.json 超过 16 KB");
        const auto manifest=json::parse(read(file));const auto id=pluginField(manifest,"id",64);
        if(!pluginIdValid(id))throw std::runtime_error("插件 id 无效（小写字母数字 . _ -）");
        const auto folder=file.parent_path();std::uintmax_t total=0;size_t count=0;
        for(auto& entry:fs::recursive_directory_iterator(folder,ec)){if(entry.is_regular_file()){total+=entry.file_size();if(++count>64||total>4*1024*1024)throw std::runtime_error("插件文件夹太大（最多 64 个文件、4 MB）");}}
        const auto target=root/wide(id);if(fs::exists(target,ec)&&fs::equivalent(folder,target,ec))return id;
        fs::remove_all(target,ec);ec.clear();fs::copy(folder,target,fs::copy_options::recursive|fs::copy_options::overwrite_existing,ec);
        if(ec)throw std::runtime_error("复制插件失败："+ec.message());
        return id;
    }
    if(lower(file.extension().wstring())!=L".js")throw std::runtime_error("请选择插件的 plugin.json 或 .js 文件");
    if(fs::file_size(file,ec)>512*1024)throw std::runtime_error("插件文件超过 512 KB");
    const auto code=read(file);json manifest=json::object();
    std::istringstream lines(code);std::string line;int n=0;static const std::regex tag(R"(^\s*//\s*@(id|name|version|description)\s+(.+?)\s*$)");
    while(n++<60&&std::getline(lines,line)){if(!line.empty()&&line.back()=='\r')line.pop_back();std::smatch m;if(std::regex_match(line,m,tag)&&!manifest.contains(m[1].str()))manifest[m[1].str()]=m[2].str();}
    std::string id=manifest.value("id",std::string{});
    if(id.empty()){for(wchar_t c:lower(file.stem().wstring())){id+=(c<128&&(iswalnum(c)||c==L'.'||c==L'_'||c==L'-'))?char(c):'-';}while(!id.empty()&&!isalnum(static_cast<unsigned char>(id[0])))id.erase(0,1);if(id.size()>40)id.resize(40);}
    if(!pluginIdValid(id))throw std::runtime_error("无法从文件得到有效的插件 id，请在文件开头写 // @id my-plugin");
    if(!manifest.contains("name"))manifest["name"]=id;
    manifest["id"]=id;manifest["main"]="main.js";
    const auto target=root/wide(id);fs::create_directories(target,ec);
    {std::ofstream f(target/L"plugin.json",std::ios::binary);f<<manifest.dump(2);}
    {std::ofstream f(target/L"main.js",std::ios::binary);f<<code;if(!f)throw std::runtime_error("写入插件失败");}
    return id;
}
inline void pluginsAction(const json& message){
    const auto action=message.value("action",std::string{});
    const auto id=message.value("id",std::string{});
    if(action=="folder"){
        std::error_code ec;const auto root=pluginsDirectory();fs::create_directories(root,ec);
        ShellExecuteW(windowHandle,L"open",root.c_str(),nullptr,nullptr,SW_SHOWNORMAL);
    }else if(action=="reload"){pluginsReloadViews();
    }else if(action=="import"){
        wchar_t path[MAX_PATH*4]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=windowHandle;dialog.lpstrFilter=L"Bili-Space 插件 (plugin.json, *.js)\0plugin.json;*.js\0";dialog.lpstrFile=path;dialog.nMaxFile=MAX_PATH*4;dialog.lpstrTitle=L"导入插件";dialog.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
        if(!GetOpenFileNameW(&dialog))return;
        try{
            const auto installed=pluginsInstall(fs::path(path));pluginsSetDisabled(installed,false);save();
            const auto def=pluginDefinition(installed);if(def.is_null())throw std::runtime_error("插件已复制，但清单或入口文件无效");
            refreshInjection();pluginsBroadcast("window.BiliSpacePlugins?.setEnabled?.("+json(installed).dump()+",true,"+def.dump()+");window.BiliSpace?.pluginsChanged?.()");
            pluginsToast("已导入并启用："+def.value("name",installed));log("plugin imported: "+installed);
        }catch(const std::exception& e){pluginsToast(std::string("导入失败：")+e.what());}
    }else if(action=="toggle"&&pluginIdValid(id)){
        const bool on=message.value("enabled",false);pluginsSetDisabled(id,!on);save();refreshInjection();
        const auto def=pluginDefinition(id);
        pluginsBroadcast("window.BiliSpacePlugins?.setEnabled?.("+json(id).dump()+","+(on?"true":"false")+","+(def.is_null()?std::string("null"):def.dump())+");window.BiliSpace?.pluginsChanged?.()");
    }else if(action=="remove"&&pluginIdValid(id)){
        std::error_code ec;fs::remove_all(pluginsDirectory()/wide(id),ec);pluginsSetDisabled(id,false);pluginData.erase(id);save();refreshInjection();
        pluginsBroadcast("window.BiliSpacePlugins?.remove?.("+json(id).dump()+");window.BiliSpace?.pluginsChanged?.()");pluginsToast("插件已删除");
    }else if(action=="data"&&pluginIdValid(id)&&message.contains("value")){
        const auto key=message.value("key",std::string{});if(key.empty()||key.size()>40)return;
        if(!pluginData.contains(id)||!pluginData[id].is_object())pluginData[id]=json::object();
        if(pluginData[id].size()>=64&&!pluginData[id].contains(key))return;
        if(message["value"].dump().size()>16*1024)return;
        pluginData[id][key]=message["value"];save();refreshInjection();
        pluginsBroadcast("window.BiliSpacePlugins?.acceptData?.("+json(id).dump()+","+pluginData[id].dump()+")");
    }
}
