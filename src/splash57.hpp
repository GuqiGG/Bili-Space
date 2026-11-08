#pragma once
// Startup: only the small pink television turns at the centre of where the window will open; the window itself stays
// hidden until the first page is ready, then opens at its remembered size with the system's open animation (fast,
// then settling).
namespace splash{
HWND window{};ULONGLONG started{};ULONG_PTR token{};int showCommand=SW_SHOW;bool waiting=false;
HDC canvasDc{};HBITMAP canvasBitmap{};HGDIOBJ previous{};void* bits{};int side=0;
constexpr UINT_PTR frameTimer=57,fallbackTimer=58;
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
    // Icon space is the 32×32 viewBox of the page's television, drawn 56 px wide (scaled by DPI) at the centre.
    const float k=side/72.f*56.f/32.f;
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
    side=MulDiv(72,dpiFor?dpiFor(main):96,96);
    WNDCLASSW wc{};wc.lpfnWndProc=proc;wc.hInstance=GetModuleHandleW(nullptr);wc.lpszClassName=L"BiliSpaceSplash";RegisterClassW(&wc);
    window=CreateWindowExW(WS_EX_LAYERED|WS_EX_TOOLWINDOW|WS_EX_TOPMOST|WS_EX_NOACTIVATE|WS_EX_TRANSPARENT,wc.lpszClassName,L"",WS_POPUP,(target.left+target.right-side)/2,(target.top+target.bottom-side)/2,side,side,nullptr,nullptr,wc.hInstance,nullptr);
    if(!window)return;
    HDC screenDc=GetDC(nullptr);canvasDc=CreateCompatibleDC(screenDc);BITMAPINFO bi{};bi.bmiHeader={sizeof(BITMAPINFOHEADER),side,-side,1,32,BI_RGB};
    canvasBitmap=CreateDIBSection(screenDc,&bi,DIB_RGB_COLORS,&bits,nullptr,0);previous=SelectObject(canvasDc,canvasBitmap);ReleaseDC(nullptr,screenDc);
    draw();ShowWindow(window,SW_SHOWNOACTIVATE);SetTimer(window,frameTimer,16,nullptr);
    // Never keep the window hidden for long, whatever the page does.
    SetTimer(main,fallbackTimer,9000,nullptr);
}
void close(){
    if(window){KillTimer(window,frameTimer);DestroyWindow(window);window=nullptr;}
    if(canvasDc){SelectObject(canvasDc,previous);DeleteObject(canvasBitmap);DeleteDC(canvasDc);canvasDc=nullptr;canvasBitmap=nullptr;bits=nullptr;}
    if(token){Gdiplus::GdiplusShutdown(token);token=0;}
}
// The first page is ready (or the fallback fired): drop the television and open the window.
void finish(HWND main){
    if(!waiting)return;waiting=false;KillTimer(main,fallbackTimer);close();log("startup: window shown");
    ShowWindow(main,showCommand);SetForegroundWindow(main);UpdateWindow(main);
}
}
