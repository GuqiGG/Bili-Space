#define wWinMain testedApplicationMain
#include TARGET_CPP
#undef wWinMain
int wmain(int argc,wchar_t** argv){
    config=defaults();WNDCLASSW c{};c.hInstance=GetModuleHandleW(nullptr);c.lpfnWndProc=proc;c.lpszClassName=L"BiliSpaceHiddenResizeProbe";RegisterClassW(&c);
    windowHandle=CreateWindowExW(0,c.lpszClassName,L"Hidden resize probe",WS_POPUP|WS_THICKFRAME,100,100,1000,700,nullptr,nullptr,c.hInstance,nullptr);
    SetWindowPos(windowHandle,nullptr,0,0,0,0,SWP_FRAMECHANGED|SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE);
    RECT outer{},client{};GetWindowRect(windowHandle,&outer);GetClientRect(windowHandle,&client);POINT origin{};ClientToScreen(windowHandle,&origin);
    HWND child=CreateWindowExW(0,L"STATIC",L"WebView surface substitute",WS_CHILD|WS_VISIBLE,0,0,client.right,client.bottom,windowHandle,nullptr,c.hInstance,nullptr);
    const int w=outer.right-outer.left,h=outer.bottom-outer.top,b=4;
    const POINT local[]={{b,h/2},{w-b-1,h/2},{w/2,0},{w/2,h-b-1},{b,b},{w-b-1,b},{b,h-b-1},{w-b-1,h-b-1}};
    const int expected[]={HTLEFT,HTRIGHT,HTTOP,HTBOTTOM,HTTOPLEFT,HTTOPRIGHT,HTBOTTOMLEFT,HTBOTTOMRIGHT};json results=json::array();int native=0;
    for(int i=0;i<8;i++){
        POINT screen{outer.left+local[i].x,outer.top+local[i].y};POINT p=screen;ScreenToClient(windowHandle,&p);
        bool outside=p.x<0||p.y<0||p.x>=client.right||p.y>=client.bottom;
        HWND receiver=outside?windowHandle:ChildWindowFromPointEx(windowHandle,p,CWP_SKIPDISABLED|CWP_SKIPTRANSPARENT);
        LRESULT hit=SendMessageW(windowHandle,WM_NCHITTEST,0,MAKELPARAM(screen.x,screen.y));bool ok=receiver==windowHandle&&hit==expected[i];native+=ok;
        results.push_back({{"edge",i},{"native_receiver",receiver==windowHandle},{"hit",hit},{"expected",expected[i]},{"resizable",ok}});
    }
    json result={{"window_visible",IsWindowVisible(windowHandle)!=FALSE},{"non_client_border",{origin.x-outer.left,origin.y-outer.top,outer.right-origin.x-client.right,outer.bottom-origin.y-client.bottom}},{"webview_covers_edge",native!=8},{"native_resize_targets",native},{"edges",results}};
    if(argc>1){std::ofstream out(argv[1]);out<<result.dump(2);}DestroyWindow(windowHandle);return 0;
}
