#pragma once
// Local plugin loader. Plugins are plain JS files from the user data directory;
// they run inside the page with the same privileges as the injected enhancer and
// receive no native bridge, no filesystem and no network capability from the host.
inline fs::path pluginsDirectory(){return dataPath/L"plugins";}
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
            result["plugins"].push_back({{"id",id},{"name",name},{"version",version},{"description",description},{"main",main},{"enabled",!disabled},{"code",read(mainPath)}});
        }catch(const std::exception& e){
            result["errors"].push_back({{"folder",utf8(folder.filename().wstring())},{"message",e.what()}});
        }
    }
    return result;
}
inline void pluginsAction(const json& message){
    const auto action=message.value("action",std::string{});
    if(action=="folder"){
        std::error_code ec;const auto root=pluginsDirectory();fs::create_directories(root,ec);
        ShellExecuteW(windowHandle,L"open",root.c_str(),nullptr,nullptr,SW_SHOWNORMAL);
    }else if(action=="reload"&&webview){webview->Reload();}
}
