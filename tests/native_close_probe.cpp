#define wWinMain testedApplicationMain
#include TARGET_CPP
#undef wWinMain
#include <iostream>
int wmain(){
 config=defaults();testing=false;WNDCLASSW c{};c.hInstance=GetModuleHandleW(nullptr);c.lpfnWndProc=proc;c.lpszClassName=L"BiliSpaceCloseProbe";RegisterClassW(&c);
 json result;
 for(auto action:{"tray","exit"}){
 windowHandle=CreateWindowExW(0,c.lpszClassName,L"Hidden close probe",WS_POPUP,0,0,500,350,nullptr,nullptr,c.hInstance,nullptr);trayReady=true;
 mergeConfig({{"closeAction",action},{"srFps",120}});SendMessageW(windowHandle,WM_CLOSE,0,0);
 result[action]={{"window_retained",IsWindow(windowHandle)!=FALSE},{"visible",IsWindowVisible(windowHandle)!=FALSE},{"saved_action",config.value("closeAction",std::string("missing"))},{"srFps",config.value("srFps",0)}};
 if(IsWindow(windowHandle))DestroyWindow(windowHandle);
 }
 std::cout<<result.dump()<<std::endl;return 0;
}
