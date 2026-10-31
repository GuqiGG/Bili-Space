#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <filesystem>
#include <fstream>
#include <regex>
#include <cmath>
#include <algorithm>
#include <iostream>
#include <cassert>
#include "json.hpp"
using json=nlohmann::json;namespace fs=std::filesystem;
fs::path dataPath;NOTIFYICONDATAW trayIcon{};bool trayReady=true;int shown=0,restored=0;std::string script;
std::wstring wide(const std::string& s){int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),int(s.size()),nullptr,0);std::wstring result(n,0);if(n)MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),result.data(),n);return result;}
void execute(const std::string& s){script=s;}void updateLog(const std::string&){}void restoreFromTray(){restored++;}
void saveUpdateJson(const fs::path& file,const json& value){auto tmp=file;tmp+=L".tmp";{std::ofstream f(tmp,std::ios::binary);f<<value.dump(2);if(!f)throw std::runtime_error("save failed");}if(!MoveFileExW(tmp.c_str(),file.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("rename failed");}
bool community44TestNotify(const NOTIFYICONDATAW& note){assert(note.uFlags==NIF_INFO);assert(wcslen(note.szInfoTitle)<64);assert(wcslen(note.szInfo)<256);shown++;return true;}
#define BILI_COMMUNITY44_TEST
#include "../src/community44.hpp"
int wmain(){wchar_t temp[MAX_PATH];GetTempPathW(MAX_PATH,temp);dataPath=fs::path(temp)/(L"BiliSpace-community44-native-"+std::to_wstring(GetCurrentProcessId()));fs::create_directories(dataPath);
try{
 auto input=json{{"schema",1},{"settings",{{"notifyUpdates","true"},{"density",999},{"keywords",{"广告","广告",5}}}},{"watch",{{"2026-02-30",5},{"2026-10-31",999999}}},{"seen",{"x","123","123"}},{"accountId","abc"},{"cookies","must not persist"}};auto clean=sanitizeCommunity44(input);assert(clean["settings"]["notifyUpdates"]==false);assert(clean["settings"]["density"]==100);assert(clean["settings"]["keywords"].size()==1);assert(clean["watch"].size()==1);assert(clean["watch"]["2026-10-31"]==86400);assert(clean["seen"].size()==1);assert(!clean.contains("cookies"));std::cout<<"sanitize bounds, defaults, dates and unknown-field removal PASS\n";
 saveCommunity44(input);assert(fs::exists(dataPath/L"community44.json"));assert(!fs::exists(dataPath/L"community44.json.tmp"));assert(loadCommunity44()==clean);auto previous=loadCommunity44();bool rejected=false;try{saveCommunity44(json{{"schema",1},{"oversize",std::string(300000,'x')}});}catch(...){rejected=true;}assert(rejected&&loadCommunity44()==previous);std::cout<<"atomic save/reload and rejected oversized write preserves state PASS\n";
 auto notice=json{{"title","UP 更新"},{"body","新视频"},{"url","https://www.bilibili.com/video/BV1cjHK6GEJE"}};assert(!notifyCommunity44(notice));assert(shown==0);std::cout<<"disabled on-disk preference rejects forged reminder PASS\n";
 clean["settings"]["notifyUpdates"]=true;saveCommunity44(clean);for(auto url:{"http://www.bilibili.com/video/BV1cjHK6GEJE","https://www.bilibili.com.evil.test/video/BV1cjHK6GEJE","https://www.bilibili.com@evil.test/video/BV1cjHK6GEJE","https://www.bilibili.com:443/video/BV1cjHK6GEJE","https://www.bilibili.com/video/BV1cjHK6GEJE?next=evil","javascript:alert(1)"}){notice["url"]=url;assert(!notifyCommunity44(notice));}assert(shown==0);std::cout<<"untrusted schemes, origins, credentials, ports and queries rejected PASS\n";
 notice["url"]="https://www.bilibili.com/video/BV1cjHK6GEJE";assert(notifyCommunity44(notice));assert(shown==1);assert(!notifyCommunity44(notice));assert(shown==1);assert(communityNotificationClick()==notice["url"]);assert(restored==1);assert(communityNotificationClick().empty());assert(restored==1);std::cout<<"trusted notification adapter, 60-second throttle and one-shot click restore PASS\n";
 communityAction({{"action","load"}});assert(script.find("window.BiliCommunity44?.acceptState(")==0);const std::string prefix="window.BiliCommunity44?.acceptState(";auto saved=json::parse(script.substr(prefix.size(),script.size()-prefix.size()-1));assert(saved==clean);std::cout<<"load bridge emits parseable sanitized state PASS\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}assert(fs::equivalent(dataPath.parent_path(),fs::path(temp)));assert(dataPath.filename().wstring().rfind(L"BiliSpace-community44-native-",0)==0);fs::remove_all(dataPath);std::cout<<"community44 native tests PASS (tray delivery is an explicit adapter fixture)\n";return 0;}

