#define BILI_DOWNLOAD_TEST
#ifndef TARGET_CPP
#define TARGET_CPP "../src/main.cpp"
#endif
#include TARGET_CPP
#include <iostream>
int wmain(int n,wchar_t** a){if(n!=3)return 2;testing=true;config=defaults();dataPath=fs::absolute(a[2]);fs::create_directories(dataPath);downloadBusy=true;runDownloadPlan(a[1],{},dataPath/L"final.mp4");unsigned long long bytes=0;int partials=0;for(const auto& f:fs::directory_iterator(dataPath))if(f.is_regular_file()&&f.path().filename().wstring().find(L".bs-part-")!=std::wstring::npos){partials++;bytes+=f.file_size();}std::cout<<json({{"finalExists",fs::exists(dataPath/L"final.mp4")},{"partialFiles",partials},{"partialBytes",bytes},{"busy",downloadBusy.load()}}).dump();}
