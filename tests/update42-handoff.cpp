#define BILI_UPDATE_TEST
#include "../src/main.cpp"
#include <iostream>
int wmain(int n,wchar_t** a){
    if(n==3&&std::wstring(a[1])==L"--apply-update")return runUpdateWorker(const_cast<PWSTR>(L"--apply-update "));
    wchar_t exe[32768];GetModuleFileNameW(nullptr,exe,32768);root=fs::path(exe).parent_path();
    if(n==1){std::ofstream(root/L"restarted.txt")<<"restarted";return 0;}
    if(n!=2)return 2;
    auto input=json::parse(read(a[1]));dataPath=root/L"profile";fs::create_directories(dataPath/L"updates");config=defaults();
    updateState=validateUpdate(input,appVersion);updateState["ready"]=true;
    readyUpdatePackage=wide(input.at("package").get<std::string>());
    WNDCLASSW wc{};wc.hInstance=GetModuleHandleW(nullptr);wc.lpfnWndProc=DefWindowProcW;wc.lpszClassName=L"Update42Isolated";RegisterClassW(&wc);
    windowHandle=CreateWindowW(wc.lpszClassName,L"",0,0,0,0,0,nullptr,nullptr,wc.hInstance,nullptr);
    startUpdateInstall();bool open=IsWindow(windowHandle);std::cout<<json({{"clientKeptOpen",open},{"busy",updateBusy},{"message",updateState.value("message",std::string{})}}).dump();
    if(open)DestroyWindow(windowHandle);return 0;
}
