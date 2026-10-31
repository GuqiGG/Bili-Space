#pragma once
// Include after update_service.hpp; uses the host's local state and tray helpers.
#include <set>
#include <limits>
inline constexpr size_t community44Limit=256*1024;
inline std::string community44NoticeUrl;
inline ULONGLONG community44LastNotice=0;
inline bool community44HasNotice=false;
inline bool community44Digits(const std::string& s,size_t max){return !s.empty()&&s.size()<=max&&std::all_of(s.begin(),s.end(),[](unsigned char c){return c>='0'&&c<='9';});}
inline bool community44Date(const std::string& s){if(!std::regex_match(s,std::regex(R"(\d{4}-\d{2}-\d{2})")))return false;int y=std::stoi(s.substr(0,4)),m=std::stoi(s.substr(5,2)),d=std::stoi(s.substr(8,2));if(y<1970||m<1||m>12||d<1)return false;int days[]={31,28,31,30,31,30,31,31,30,31,30,31};if(y%4==0&&(y%100!=0||y%400==0))days[1]=29;return d<=days[m-1];}
inline std::string community44String(const json& x,size_t max){if(!x.is_string())return {};auto s=x.get<std::string>();if(s.size()>max)return {};try{(void)json(s).dump();}catch(...){return {};}return s;}
inline json sanitizeCommunity44(const json& input){
    const json empty=json::object();const auto& v=input.is_object()&&input.value("schema",json())==1?input:empty;
    const auto& settings=v.contains("settings")&&v["settings"].is_object()?v["settings"]:empty;
    auto flag=[&](const char* key){return settings.contains(key)&&settings[key].is_boolean()&&settings[key].get<bool>();};
    // Some danmaku switches are on unless the saved state explicitly says otherwise.
    auto flagDefault=[&](const char* key,bool fallback){if(!settings.contains(key)||!settings[key].is_boolean())return fallback;return settings[key].get<bool>();};
    auto number=[&](const char* key,double lo,double hi,double fallback){if(!settings.contains(key)||!settings[key].is_number())return fallback;double n=settings[key].get<double>();return std::isfinite(n)?std::clamp(n,lo,hi):fallback;};
    json out={{"schema",1},{"settings",{{"danmakuEnabled",flag("danmakuEnabled")},{"density",number("density",0,100,60)},{"opacity",number("opacity",0,100,80)},{"speed",number("speed",.4,1.6,1)},{"keywords",json::array()},{"notifyUpdates",flag("notifyUpdates")},{"mergeRepeats",flagDefault("mergeRepeats",true)},{"mergeWindow",number("mergeWindow",2,15,6)},{"maxPerSecond",number("maxPerSecond",0,10000,20)},{"areaScroll",flagDefault("areaScroll",true)},{"areaTop",flagDefault("areaTop",true)},{"areaBottom",flagDefault("areaBottom",true)},{"fontScale",number("fontScale",50,150,100)},{"filterNoise",flag("filterNoise")}}},{"watch",json::object()},{"seen",json::array()},{"accountId",""}};
    std::set<std::string> unique;
    if(settings.contains("keywords")&&settings["keywords"].is_array())for(const auto& item:settings["keywords"]){auto s=community44String(item,480);if(!s.empty()&&unique.insert(s).second){out["settings"]["keywords"].push_back(s);if(out["settings"]["keywords"].size()==200)break;}}
    if(v.contains("watch")&&v["watch"].is_object()){std::vector<std::pair<std::string,double>> rows;for(auto it=v["watch"].begin();it!=v["watch"].end();++it)if(community44Date(it.key())&&it.value().is_number()){double n=it.value().get<double>();if(std::isfinite(n)&&n>=0)rows.emplace_back(it.key(),std::min(86400.,n));}std::sort(rows.begin(),rows.end());size_t start=rows.size()>90?rows.size()-90:0;for(size_t i=start;i<rows.size();i++)out["watch"][rows[i].first]=rows[i].second;}
    unique.clear();if(v.contains("seen")&&v["seen"].is_array())for(const auto& item:v["seen"]){auto s=community44String(item,25);if(community44Digits(s,25)&&unique.insert(s).second)out["seen"].push_back(s);}while(out["seen"].size()>1000)out["seen"].erase(out["seen"].begin());
    auto id=v.contains("accountId")?community44String(v["accountId"],20):std::string{};if(community44Digits(id,20))out["accountId"]=id;return out;
}
inline json loadCommunity44(){try{const auto path=dataPath/L"community44.json";std::error_code ec;auto size=fs::file_size(path,ec);if(ec||size>community44Limit)return sanitizeCommunity44(json());std::ifstream file(path,std::ios::binary);std::string bytes((std::istreambuf_iterator<char>(file)),{});if(bytes.size()>community44Limit)return sanitizeCommunity44(json());return sanitizeCommunity44(json::parse(bytes));}catch(...){return sanitizeCommunity44(json());}}
inline void saveCommunity44(const json& value){if(value.dump().size()>community44Limit)throw std::runtime_error("community state exceeds 256 KiB");auto state=sanitizeCommunity44(value);if(state.dump(2).size()>community44Limit)throw std::runtime_error("community state exceeds 256 KiB");fs::create_directories(dataPath);saveUpdateJson(dataPath/L"community44.json",state);}
inline bool trustedCommunity44Url(const std::string& url){
    // Exact canonical origins and paths: no credentials, ports, fragments or query payloads.
    static const std::regex video(R"(https://www\.bilibili\.com/video/BV[A-Za-z0-9]{10}/?)");
    static const std::regex dynamic(R"(https://t\.bilibili\.com/[0-9]{1,25}/?)");
    static const std::regex space(R"(https://space\.bilibili\.com/[0-9]{1,20}/dynamic/?)");
    return url.size()<=256&&(std::regex_match(url,video)||std::regex_match(url,dynamic)||std::regex_match(url,space));
}
inline bool notifyCommunity44(const json& message){
    if(!message.is_object()||!loadCommunity44()["settings"]["notifyUpdates"].get<bool>()||!trayReady)return false;
    auto url=message.contains("url")?community44String(message["url"],256):std::string{};
    auto title=message.contains("title")?community44String(message["title"],240):std::string{};
    auto body=message.contains("body")?community44String(message["body"],1000):std::string{};
    if(!trustedCommunity44Url(url)||title.empty()||body.empty())return false;
    const auto now=GetTickCount64();if(community44HasNotice&&now-community44LastNotice<60000)return false;
    auto wtitle=wide(title),wbody=wide(body);if(wtitle.empty()||wbody.empty())return false;
    for(auto& c:wtitle)if(c<32)c=L' ';for(auto& c:wbody)if(c<32&&c!=L'\n')c=L' ';
    NOTIFYICONDATAW note=trayIcon;note.uFlags=NIF_INFO;note.dwInfoFlags=NIIF_INFO;note.uTimeout=10000;
    lstrcpynW(note.szInfoTitle,wtitle.c_str(),int(std::size(note.szInfoTitle)));lstrcpynW(note.szInfo,wbody.c_str(),int(std::size(note.szInfo)));
#ifdef BILI_COMMUNITY44_TEST
    const bool shown=community44TestNotify(note);
#else
    const bool shown=Shell_NotifyIconW(NIM_MODIFY,&note)!=FALSE;
#endif
    if(!shown)return false;community44NoticeUrl=url;community44LastNotice=now;community44HasNotice=true;return true;
}
inline std::string communityNotificationUrl(){auto url=community44NoticeUrl;community44NoticeUrl.clear();return trustedCommunity44Url(url)?url:std::string{};}
inline std::string communityNotificationClick(){auto url=communityNotificationUrl();if(!url.empty())restoreFromTray();return url;}
inline void communityAction(const json& m){try{if(!m.is_object())return;const auto action=m.contains("action")?community44String(m["action"],16):std::string{};if(action=="load")execute("window.BiliCommunity44?.acceptState("+loadCommunity44().dump()+")");else if(action=="save"&&m.contains("state"))saveCommunity44(m["state"]);else if(action=="notify")notifyCommunity44(m);}catch(const std::exception& e){updateLog(std::string("community: ")+e.what());}}
