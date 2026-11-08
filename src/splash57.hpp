#pragma once
// Startup: only the small pink television turns at the centre of where the window will open; the window itself stays
// hidden until the first page is ready, then opens at its remembered size with the system's open animation (fast,
// then settling).
namespace splash{
HWND window{};ULONGLONG started{},revealStart{};RECT revealFrom{};ULONG_PTR token{};int showCommand=SW_SHOW;bool waiting=false;
HDC canvasDc{};HBITMAP canvasBitmap{};HGDIOBJ previous{};void* bits{};int side=0;
constexpr UINT_PTR frameTimer=57,fallbackTimer=58,revealTimer=59;constexpr double revealMs=460;
void rounded(Gdiplus::GraphicsPath& p,float x,float y,float w,float h,float r){float d=r*2;p.AddArc(x,y,d,d,180,90);p.AddArc(x+w-d,y,d,d,270,90);p.AddArc(x+w-d,y+h-d,d,d,0,90);p.AddArc(x,y+h-d,d,d,90,90);p.CloseFigure();}
// The same television and spin as the page's loading screen: 700 ms a turn on cubic-bezier(.77,0,.175,1).
double spinEase(double x){
    auto bez=[](double t,double a,double b){double u=1-t;return 3*u*u*t*a+3*u*t*t*b+t*t*t;};
    double lo=0,hi=1,t=x;for(int i=0;i<24;i++){t=(lo+hi)/2;if(bez(t,.77,.175)<x)lo=t;else hi=t;}
    return bez(t,0,1);
}
void draw(){
    if(!window||!bits)return;using namespace Gdiplus;
    std::memset(bits,0,size_t(side)*side*4);
    Bitmap canvas(side,side,side*4,PixelFormat32bppPARGB,static_cast<BYTE*>(bits));Graphics g(&canvas);
    g.SetSmoothingMode(SmoothingModeAntiAlias);g.SetPixelOffsetMode(PixelOffsetModeHalf);
    const double phase=double((GetTickCount64()-started)%700)/700.;
    // Icon space is the 32×32 viewBox of the page's television, drawn 88 px wide (scaled by DPI) at the centre.
    const float k=side/112.f*88.f/32.f;
    g.TranslateTransform(side/2.f,side/2.f);g.RotateTransform(float(spinEase(phase)*360.));g.ScaleTransform(k,k);g.TranslateTransform(-16.f,-16.f);
    const Color pink(255,251,114,153);
    Pen antenna(pink,3.f);antenna.SetStartCap(LineCapRound);antenna.SetEndCap(LineCapRound);antenna.SetLineJoin(LineJoinRound);
    PointF ears[3]={{10.f,3.f},{16.f,8.f},{22.f,3.f}};g.DrawLines(&antenna,ears,3);
    GraphicsPath body;rounded(body,3.f,8.f,26.f,21.f,6.f);SolidBrush fill(pink);g.FillPath(&fill,&body);
    Pen eye(Color(255,255,255,255),3.f);eye.SetStartCap(LineCapRound);eye.SetEndCap(LineCapRound);
    g.DrawLine(&eye,10.f,16.f,10.f,21.f);g.DrawLine(&eye,22.f,16.f,22.f,21.f);
    HDC screenDc=GetDC(nullptr);RECT r{};GetWindowRect(window,&r);POINT origin{r.left,r.top},zero{0,0};SIZE size{side,side};BLENDFUNCTION blend{AC_SRC_OVER,0,255,AC_SRC_ALPHA};
    UpdateLayeredWindow(window,screenDc,&origin,&size,canvasDc,&zero,0,&blend,ULW_ALPHA);ReleaseDC(nullptr,screenDc);
}
LRESULT CALLBACK proc(HWND h,UINT msg,WPARAM wp,LPARAM lp){
    if(msg==WM_TIMER&&wp==frameTimer){draw();return 0;}
    if(msg==WM_NCHITTEST)return HTTRANSPARENT;
    return DefWindowProcW(h,msg,wp,lp);
}
// Places the hidden main window, then shows the turning television at the centre of where it will open.
void begin(HWND main,int command){
    showCommand=command;waiting=true;started=GetTickCount64();
    Gdiplus::GdiplusStartupInput input;if(Gdiplus::GdiplusStartup(&token,&input,nullptr)!=Gdiplus::Ok){token=0;return;}
    RECT target{};if(command==SW_SHOWMAXIMIZED){MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(MonitorFromWindow(main,MONITOR_DEFAULTTONEAREST),&mi);target=mi.rcWork;}else GetWindowRect(main,&target);
    using Dpi=UINT(WINAPI*)(HWND);static auto dpiFor=reinterpret_cast<Dpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));
    side=MulDiv(112,dpiFor?dpiFor(main):96,96);
    WNDCLASSW wc{};wc.lpfnWndProc=proc;wc.hInstance=GetModuleHandleW(nullptr);wc.lpszClassName=L"BiliSpaceSplash";RegisterClassW(&wc);
    window=CreateWindowExW(WS_EX_LAYERED|WS_EX_TOOLWINDOW|WS_EX_TOPMOST|WS_EX_NOACTIVATE|WS_EX_TRANSPARENT,wc.lpszClassName,L"",WS_POPUP,(target.left+target.right-side)/2,(target.top+target.bottom-side)/2,side,side,nullptr,nullptr,wc.hInstance,nullptr);
    if(!window)return;
    HDC screenDc=GetDC(nullptr);canvasDc=CreateCompatibleDC(screenDc);BITMAPINFO bi{};bi.bmiHeader={sizeof(BITMAPINFOHEADER),side,-side,1,32,BI_RGB};
    canvasBitmap=CreateDIBSection(screenDc,&bi,DIB_RGB_COLORS,&bits,nullptr,0);previous=SelectObject(canvasDc,canvasBitmap);ReleaseDC(nullptr,screenDc);
    draw();ShowWindow(window,SW_SHOWNOACTIVATE);SetTimer(window,frameTimer,16,nullptr);
    // The window is shown now with nothing visible (an empty window region), so the page renders while the television
    // turns; the reveal then uncovers a finished page instead of a blank one.
    BOOL off=TRUE;DwmSetWindowAttribute(main,DWMWA_TRANSITIONS_FORCEDISABLED,&off,sizeof(off));
    SetWindowRgn(main,CreateRectRgn(0,0,0,0),FALSE);ShowWindow(main,showCommand==SW_SHOWMAXIMIZED?SW_SHOWMAXIMIZED:SW_SHOWNOACTIVATE);
    // Never keep the window hidden for long, whatever the page does.
    SetTimer(main,fallbackTimer,9000,nullptr);
}
void close(){
    if(window){KillTimer(window,frameTimer);DestroyWindow(window);window=nullptr;}
    if(canvasDc){SelectObject(canvasDc,previous);DeleteObject(canvasBitmap);DeleteDC(canvasDc);canvasDc=nullptr;canvasBitmap=nullptr;bits=nullptr;}
    if(token){Gdiplus::GdiplusShutdown(token);token=0;}
}
// The first page is ready (or the fallback fired): drop the television and open the window.
// The window opens out of the television: it is shown at full size, but only a television-sized rounded square at the
// television's place is visible, and that window region grows to the whole window on an ease-out curve (fast, then
// settling). The page is laid out once at full size, so nothing reflows during the opening.
void reveal(HWND main){
    double t=std::min(1.,(GetTickCount64()-revealStart)/revealMs),e=1-std::pow(1-t,4);
    RECT full{};GetWindowRect(main,&full);const int w=full.right-full.left,h=full.bottom-full.top;
    auto lerp=[&](double a,double b){return int(std::lround(a+(b-a)*e));};
    const int l=lerp(revealFrom.left,0),tp=lerp(revealFrom.top,0),r=lerp(revealFrom.right,w),b=lerp(revealFrom.bottom,h),radius=lerp(side*.5,16);
    if(t>=1){KillTimer(main,revealTimer);SetWindowRgn(main,nullptr,TRUE);BOOL off=FALSE;DwmSetWindowAttribute(main,DWMWA_TRANSITIONS_FORCEDISABLED,&off,sizeof(off));return;}
    SetWindowRgn(main,CreateRoundRectRgn(l,tp,r+1,b+1,radius,radius),TRUE);
}
void finish(HWND main){
    if(!waiting)return;waiting=false;KillTimer(main,fallbackTimer);
    RECT tv{};if(window)GetWindowRect(window,&tv);
    if(!IsWindowVisible(main)){BOOL off=TRUE;DwmSetWindowAttribute(main,DWMWA_TRANSITIONS_FORCEDISABLED,&off,sizeof(off));SetWindowRgn(main,CreateRectRgn(0,0,0,0),FALSE);ShowWindow(main,showCommand==SW_SHOWMAXIMIZED?SW_SHOWMAXIMIZED:SW_SHOWNOACTIVATE);}
    RECT full{};GetWindowRect(main,&full);
    if(!tv.right){tv={(full.left+full.right-side)/2,(full.top+full.bottom-side)/2,(full.left+full.right+side)/2,(full.top+full.bottom+side)/2};}
    revealFrom={tv.left-full.left,tv.top-full.top,tv.right-full.left,tv.bottom-full.top};revealStart=GetTickCount64();
    SetWindowRgn(main,CreateRoundRectRgn(revealFrom.left,revealFrom.top,revealFrom.right+1,revealFrom.bottom+1,side/2,side/2),FALSE);
    SetForegroundWindow(main);UpdateWindow(main);close();log("startup: window shown");
    SetTimer(main,revealTimer,8,nullptr);
}
}
