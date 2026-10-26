#include "../src/main.cpp"
#include <iostream>
int wmain(){const std::pair<const wchar_t*,bool> tests[]={
{L"https://upos-sz-mirrorcos.bilivideo.com/v.m4s",true},
{L"https://upos-sz-mirrorcos.bilivideo.com:443/v.m4s?token=fixture",true},
{L"https://mcdn.bilivideo.cn:4483/a.m4s",true},
{L"https://upos-hz-mirrorakam.akamaized.net/v.m4s",true},
{L"http://upos-sz-mirrorcos.bilivideo.com/v.m4s",false},
{L"https://bilivideo.com.evil.example/v.m4s",false},
{L"https://evilbilivideo.com/v.m4s",false},
{L"https://user:password@upos-sz-mirrorcos.bilivideo.com/v.m4s",false},
{L"https://127.0.0.1:4483/v.m4s",false},
{L"https://peer.szbdyd.com:4483/v.m4s",false}};
for(auto& [url,expected]:tests){bool result=downloadMediaUrl(url);std::wcout<<url<<L" "<<result<<L"\n";if(result!=expected)return 1;}
config=defaults();if(config["videoLoadingMode"]!="page")return 2;mergeConfig({{"videoLoadingMode","video"}});if(config["videoLoadingMode"]!="video")return 3;mergeConfig({{"videoLoadingMode","invalid"}});if(config["videoLoadingMode"]!="video")return 4;std::cout<<"native configuration validation passed\n";return 0;}
