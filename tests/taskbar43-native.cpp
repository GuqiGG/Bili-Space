#include "../src/main.cpp"
#include <cassert>
#include <iostream>
int wmain(){
    testing=true;config=defaults();WNDCLASSW wc{};wc.hInstance=GetModuleHandleW(nullptr);wc.lpfnWndProc=proc;wc.lpszClassName=L"BiliSpaceTaskbar43Native";RegisterClassW(&wc);
    windowHandle=CreateWindowExW(0,wc.lpszClassName,L"Isolated taskbar test",WS_OVERLAPPEDWINDOW,100,100,1000,700,nullptr,nullptr,wc.hInstance,nullptr);assert(windowHandle);
    SetWindowPos(windowHandle,nullptr,0,0,0,0,SWP_FRAMECHANGED|SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE);
    auto systemStyle=[](){auto s=GetWindowLongPtrW(windowHandle,GWL_STYLE);return (s&WS_OVERLAPPEDWINDOW)==WS_OVERLAPPEDWINDOW&&!(s&WS_POPUP);};assert(systemStyle());
    RECT outer{};GetWindowRect(windowHandle,&outer);POINT origin{};ClientToScreen(windowHandle,&origin);assert(origin.y-outer.top<=2);
    ShowWindow(windowHandle,SW_SHOWNOACTIVATE);
    for(int i=0;i<3;i++){SendMessageW(windowHandle,WM_SYSCOMMAND,SC_MINIMIZE,0);assert(IsIconic(windowHandle));SendMessageW(windowHandle,WM_SYSCOMMAND,SC_RESTORE,0);assert(!IsIconic(windowHandle));assert(systemStyle());}
    SendMessageW(windowHandle,WM_SYSCOMMAND,SC_MAXIMIZE,0);assert(IsZoomed(windowHandle));SendMessageW(windowHandle,WM_SYSCOMMAND,SC_MINIMIZE,0);assert(IsIconic(windowHandle));SendMessageW(windowHandle,WM_SYSCOMMAND,SC_RESTORE,0);assert(IsZoomed(windowHandle));SendMessageW(windowHandle,WM_SYSCOMMAND,SC_RESTORE,0);
    togglePip(true);assert(pip);assert(!(GetWindowLongPtrW(windowHandle,GWL_STYLE)&WS_CAPTION));togglePip(false);assert(!pip&&systemStyle());
    DestroyWindow(windowHandle);std::cout<<"Native taskbar restore, hidden caption and PiP style regression PASS\n";return 0;
}
