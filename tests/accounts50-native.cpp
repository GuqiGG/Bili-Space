#include "../src/main.cpp"
#include <iostream>
#include <cassert>
int wmain(int argc,wchar_t** argv){
 if(argc!=2)return 2;dataPath=fs::absolute(argv[1]);root=dataPath;testing=true;fs::create_directories(dataPath);
 const json jar=json::array({{{"name","DedeUserID"},{"value","12345"},{"domain",".bilibili.com"},{"path","/"}},{{"name","SESSDATA"},{"value","synthetic-test-session-not-a-real-login"},{"domain",".bilibili.com"},{"path","/"}}});
 auto encrypted=account50::protect(jar);assert(encrypted.find("synthetic-test-session")==std::string::npos);assert(account50::unprotect(encrypted)==jar);
 assert(account50::domain(".bilibili.com"));assert(account50::domain("passport.bilibili.com"));assert(!account50::domain("bilibili.com.attacker.invalid"));assert(!account50::domain("qq.com"));
 account50::remember(jar,{{"mid","12345"},{"uname","Test account"},{"face",""}});
 auto stored=read(dataPath/L"accounts50.json");assert(stored.find("synthetic-test-session")==std::string::npos);assert(stored.find("SESSDATA")==std::string::npos);
 account50::entries=json::array();account50::loaded=false;account50::load();assert(account50::entries.size()==1);assert(account50::entries[0]["uname"]=="Test account");assert(account50::unprotect(account50::entries[0]["protected"])==jar);
 bool rejected=false;try{account50::unprotect("not-a-valid-protected-blob");}catch(...){rejected=true;}assert(rejected);
 fs::remove(dataPath/L"accounts50.json");std::cout<<"Encrypted account storage and cookie scope tests passed\n";return 0;
}
