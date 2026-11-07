#pragma once
// The video dock: a per-pixel-alpha layered window beside the main window, drawn with GDI+.
// Every value eases towards its target each frame (fast first, then slow), so changes can be interrupted.
namespace Gdiplus{using std::min;using std::max;}
#include <gdiplus.h>
namespace dock{
using namespace Gdiplus;
// A damped spring: interruptible because it carries velocity; under-damped values give the small bounce.
struct Spring{float value=0,velocity=0;bool step(float target,float dt,float stiffness,float damping){float a=stiffness*(target-value)-damping*velocity;velocity+=a*dt;value+=velocity*dt;if(std::fabs(target-value)<.0008f&&std::fabs(velocity)<.01f){value=target;velocity=0;return false;}return true;}};
bool reduceMotion(){BOOL on=TRUE;SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION,0,&on,0);return !on;}
struct Item{Tab* tab{};Spring y,scale{.5f,0};float alpha=0,white=0,hover=0;bool placed=false;std::string cover;std::unique_ptr<Bitmap> image;bool fetching=false;};
HWND window{};ULONG_PTR gdiplusToken{};std::vector<std::unique_ptr<Item>> items;Item home;Spring pill,homeScale;float pillHeight=0,shown=0,homeShown=0,tipAlpha=0;
int hovered=-2,pressed=-2;bool closeHovered=false,tracking=false,animating=false,outside=true;ULONGLONG lastFrame=0;std::string tipText;
constexpr UINT coverMessage=WM_APP+91;constexpr float ITEM=44,PAD=10,GAP=10,RADIUS=22,INNER=12,MARGIN=26,TIP=300,OFFSET=12;
struct CoverReply{Tab* tab;std::string url,bytes;};
float scale(){using Dpi=UINT(WINAPI*)(HWND);static auto dpi=reinterpret_cast<Dpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));return dpi?dpi(windowHandle)/96.f:1.f;}
void rounded(GraphicsPath& p,float x,float y,float w,float h,float r){r=std::min(r,std::min(w,h)/2);float d=r*2;p.AddArc(x,y,d,d,180,90);p.AddArc(x+w-d,y,d,d,270,90);p.AddArc(x+w-d,y+h-d,d,d,0,90);p.AddArc(x,y+h-d,d,d,90,90);p.CloseFigure();}
void softShadow(Graphics& g,float x,float y,float w,float h,float r,float strength,float spread){
    for(int i=12;i>=1;--i){float t=i/12.f,grow=spread*t;GraphicsPath p;rounded(p,x-grow,y-grow+spread*.45f,w+grow*2,h+grow*2,r+grow);SolidBrush b(Color(BYTE(std::min(255.f,strength*(1-t)*(1-t)*9.f)),0,0,0));g.FillPath(&b,&p);}
}
std::wstring wideTitle(const std::string& s){return wide(s.empty()?std::string("正在打开视频…"):s);}
// Cover thumbnails come only from Bilibili's image CDN and are decoded at dock size.
void fetchCover(Item& item){
    if(item.fetching||item.cover.empty())return;std::string url=item.cover;if(url.rfind("//",0)==0)url="https:"+url;if(url.rfind("http://",0)==0)url="https://"+url.substr(7);
    auto at=url.find('@');if(at!=std::string::npos)url.resize(at);
    URL_COMPONENTS c{};c.dwStructSize=sizeof(c);wchar_t host[256]{},path[2048]{};c.lpszHostName=host;c.dwHostNameLength=255;c.lpszUrlPath=path;c.dwUrlPathLength=2047;auto wurl=wide(url);
    if(url.size()>1800||!WinHttpCrackUrl(wurl.c_str(),DWORD(wurl.size()),0,&c)||c.nScheme!=INTERNET_SCHEME_HTTPS)return;std::wstring h=host;
    if(!(h.size()>10&&h.compare(h.size()-10,10,L".hdslb.com")==0))return;
    item.fetching=true;Tab* tab=item.tab;std::wstring hostName=h,file=std::wstring(path)+L"@160w_160h_1c.png";HWND target=window;
    std::thread([tab,hostName,file,url,target]{
        std::string bytes;auto session=WinHttpOpen(L"Bili-Space",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
        if(session){WinHttpSetTimeouts(session,3000,3000,5000,8000);auto conn=WinHttpConnect(session,hostName.c_str(),INTERNET_DEFAULT_HTTPS_PORT,0);
            auto req=conn?WinHttpOpenRequest(conn,L"GET",file.c_str(),nullptr,L"https://www.bilibili.com/",WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE):nullptr;
            if(req&&WinHttpSendRequest(req,WINHTTP_NO_ADDITIONAL_HEADERS,0,nullptr,0,0,0)&&WinHttpReceiveResponse(req,nullptr)){DWORD status=0,size=sizeof(status);WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);
                if(status==200){char buffer[16384];DWORD n=0;while(WinHttpReadData(req,buffer,sizeof(buffer),&n)&&n){bytes.append(buffer,n);if(bytes.size()>4*1024*1024){bytes.clear();break;}}}}
            if(req)WinHttpCloseHandle(req);if(conn)WinHttpCloseHandle(conn);WinHttpCloseHandle(session);}
        if(!IsWindow(target))return;auto reply=new CoverReply{tab,url,std::move(bytes)};if(!PostMessageW(target,coverMessage,0,reinterpret_cast<LPARAM>(reply)))delete reply;
    }).detach();
}
void acceptCover(CoverReply* reply){
    std::unique_ptr<CoverReply> owned(reply);
    for(auto& item:items)if(item->tab==reply->tab){item->fetching=false;if(reply->bytes.empty())return;
        HGLOBAL memory=GlobalAlloc(GMEM_MOVEABLE,reply->bytes.size());if(!memory)return;memcpy(GlobalLock(memory),reply->bytes.data(),reply->bytes.size());GlobalUnlock(memory);
        IStream* stream{};if(FAILED(CreateStreamOnHGlobal(memory,TRUE,&stream))){GlobalFree(memory);return;}
        std::unique_ptr<Bitmap> source(Bitmap::FromStream(stream));stream->Release();if(!source||source->GetLastStatus()!=Ok)return;
        // Pre-scale once into a square centre crop so each frame only blits a small bitmap.
        const int side=160;auto square=std::make_unique<Bitmap>(side,side,PixelFormat32bppPARGB);{Graphics g(square.get());g.SetInterpolationMode(InterpolationModeHighQualityBicubic);float w=float(source->GetWidth()),h=float(source->GetHeight()),crop=std::min(w,h);g.DrawImage(source.get(),RectF(0,0,side,side),(w-crop)/2,(h-crop)/2,crop,crop,UnitPixel);}
        item->image=std::move(square);animating=true;SetTimer(window,1,16,nullptr);return;}
}
float approach(float value,float target,float dt,float tau=.075f){return value+(target-value)*(1-std::exp(-dt/tau));}
bool shouldShow(){return window&&!videoTabs().empty()&&IsWindowVisible(windowHandle)&&!IsIconic(windowHandle)&&!full&&!pip&&!closePending;}
// Layout in DIPs relative to the pill's top edge.
float contentHeight(){float h=PAD*2+homeShown*(ITEM+GAP);if(!items.empty())h+=items.size()*ITEM+(items.size()-1)*GAP;else h=std::max(h-GAP*homeShown,PAD*2+ITEM);return h;}
void place(){
    if(!window)return;float s=scale();RECT main{};GetWindowRect(windowHandle,&main);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(MonitorFromWindow(windowHandle,MONITOR_DEFAULTTONEAREST),&mi);
    const int pillW=int((ITEM+PAD*2)*s),margin=int(MARGIN*s),tip=int(TIP*s),gap=int(OFFSET*s);
    outside=!IsZoomed(windowHandle)&&main.right+gap+pillW+margin<=mi.rcWork.right;
    int width=margin*2+pillW+tip,height=int(std::ceil(pillHeight*s))+margin*2;
    int x=outside?main.right+gap-margin:main.right-gap-pillW-margin-tip;
    int centre=(std::max(main.top,mi.rcWork.top)+std::min(main.bottom,mi.rcWork.bottom))/2,y=centre-height/2;y=std::max(int(mi.rcWork.top),std::min(y,int(mi.rcWork.bottom)-height));
    HDC screen=GetDC(nullptr);HDC memory=CreateCompatibleDC(screen);BITMAPINFO bi{};bi.bmiHeader={sizeof(BITMAPINFOHEADER),width,-height,1,32,BI_RGB};void* bits{};
    HBITMAP dib=CreateDIBSection(screen,&bi,DIB_RGB_COLORS,&bits,nullptr,0);auto previous=SelectObject(memory,dib);
    {Bitmap canvas(width,height,width*4,PixelFormat32bppPARGB,static_cast<BYTE*>(bits));Graphics g(&canvas);g.SetSmoothingMode(SmoothingModeAntiAlias);g.SetPixelOffsetMode(PixelOffsetModeHalf);g.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);g.Clear(Color(0,0,0,0));
        const float px=float(outside?margin:margin+tip),py=float(margin),pw=float(pillW),ph=pillHeight*s,a=shown;
        const bool dark=surfaceDark;
        if(a>.01f){
            softShadow(g,px,py,pw,ph,RADIUS*s,a*1.0f,14*s);
            GraphicsPath pill;rounded(pill,px,py,pw,ph,RADIUS*s);SolidBrush fill(dark?Color(BYTE(232*a),30,30,34):Color(BYTE(238*a),252,252,253));g.FillPath(&fill,&pill);
            g.SetClip(&pill);
            auto drawTile=[&](float cy,float tileScale,float alpha,float white,float hover,Bitmap* image,bool isHome,bool active){
                if(alpha<.01f)return;float size=ITEM*s*tileScale,cx=px+pw/2,x=cx-size/2,y=py+cy*s+(ITEM*s-size)/2;
                g.ResetClip();softShadow(g,x,y,size,size,INNER*s*tileScale,alpha*(active?1.6f:.8f),(active?9:5)*s);g.SetClip(&pill);
                GraphicsPath tile;rounded(tile,x,y,size,size,INNER*s*tileScale);
                if(isHome){SolidBrush b(dark?Color(BYTE(alpha*255),52,52,58):Color(BYTE(alpha*255),236,236,240));g.FillPath(&b,&tile);
                    Pen pen(dark?Color(BYTE(alpha*235),240,240,244):Color(BYTE(alpha*235),40,40,46),1.8f*s*tileScale);pen.SetLineJoin(LineJoinRound);pen.SetStartCap(LineCapRound);pen.SetEndCap(LineCapRound);
                    float u=size/24.f;PointF roof[]={{x+5.5f*u,y+11.5f*u},{x+12*u,y+6*u},{x+18.5f*u,y+11.5f*u}};g.DrawLines(&pen,roof,3);
                    GraphicsPath body;rounded(body,x+7.5f*u,y+10.5f*u,9*u,8*u,2.2f*u);g.DrawPath(&pen,&body);
                }else{
                    GraphicsPath clip;rounded(clip,x,y,size,size,INNER*s*tileScale);g.SetClip(&clip);
                    if(image){ImageAttributes ia;ColorMatrix cm={{{1,0,0,0,0},{0,1,0,0,0},{0,0,1,0,0},{0,0,0,alpha,0},{0,0,0,0,1}}};ia.SetColorMatrix(&cm);g.DrawImage(image,RectF(x,y,size,size),0,0,REAL(image->GetWidth()),REAL(image->GetHeight()),UnitPixel,&ia);}
                    else{SolidBrush b(dark?Color(BYTE(alpha*255),50,50,56):Color(BYTE(alpha*255),232,232,236));g.FillRectangle(&b,x,y,size,size);
                        SolidBrush play(dark?Color(BYTE(alpha*150),235,235,240):Color(BYTE(alpha*140),40,40,46));float u=size/24.f;PointF tri[]={{x+10*u,y+8*u},{x+10*u,y+16*u},{x+16.5f*u,y+12*u}};g.FillPolygon(&play,tri,3);}
                    if(white>.01f){SolidBrush w(Color(BYTE(std::min(1.f,white)*alpha*46),255,255,255));g.FillRectangle(&w,x,y,size,size);}
                    g.SetClip(&pill);
                    if(hover>.01f){float r=8*s,ox=x+size-r*1.25f,oy=y+r*.25f;GraphicsPath dot;dot.AddEllipse(ox-r,oy,r*2,r*2);SolidBrush b(Color(BYTE(alpha*hover*(closeHovered?235:200)),closeHovered?232:24,closeHovered?72:24,closeHovered?84:28));g.FillPath(&b,&dot);
                        Pen x1(Color(BYTE(alpha*hover*255),255,255,255),1.5f*s);x1.SetStartCap(LineCapRound);x1.SetEndCap(LineCapRound);float k=r*.42f;g.DrawLine(&x1,ox-k,oy+r-k,ox+k,oy+r+k);g.DrawLine(&x1,ox+k,oy+r-k,ox-k,oy+r+k);}
                }
            };
            drawTile(PAD,homeScale.value*(.6f+.4f*homeShown),homeShown*a,0,0,nullptr,true,false);
            if(homeShown>.01f&&!items.empty()){SolidBrush line(dark?Color(BYTE(36*a*homeShown),255,255,255):Color(BYTE(28*a*homeShown),0,0,0));g.FillRectangle(&line,px+pw/2-10*s,py+(PAD+ITEM+GAP/2)*s-.5f*s,20*s,1*s);}
            for(size_t i=0;i<items.size();++i){auto& it=*items[i];drawTile(it.y.value,it.scale.value,it.alpha*a,it.white,it.hover,it.image.get(),false,it.tab==activeTab);}
            g.ResetClip();
            if(tipAlpha>.01f&&!tipText.empty()&&hovered>=0&&hovered<int(items.size())){
                auto title=wideTitle(tipText);FontFamily family(L"Microsoft YaHei UI");Font font(&family,13*s,FontStyleBold,UnitPixel);StringFormat fmt;fmt.SetTrimming(StringTrimmingEllipsisCharacter);fmt.SetFormatFlags(StringFormatFlagsNoWrap);fmt.SetLineAlignment(StringAlignmentCenter);
                RectF bounds;g.MeasureString(title.c_str(),-1,&font,PointF(0,0),&fmt,&bounds);float tw=std::min(bounds.Width+24*s,float(tip)-20*s),th=34*s,cy=py+(items[hovered]->y.value+ITEM/2)*s-th/2,slide=(1-tipAlpha)*6*s;
                float tx=outside?px+pw+12*s-slide:px-12*s-tw+slide;softShadow(g,tx,cy,tw,th,10*s,tipAlpha,8*s);
                GraphicsPath bubble;rounded(bubble,tx,cy,tw,th,10*s);SolidBrush bg(dark?Color(BYTE(240*tipAlpha),38,38,44):Color(BYTE(244*tipAlpha),255,255,255));g.FillPath(&bg,&bubble);
                SolidBrush ink(dark?Color(BYTE(255*tipAlpha),242,242,246):Color(BYTE(255*tipAlpha),28,28,32));g.DrawString(title.c_str(),-1,&font,RectF(tx+12*s,cy,tw-24*s,th),&fmt,&ink);
            }
        }
    }
    POINT origin{x,y},zero{0,0};SIZE size{width,height};BLENDFUNCTION blend{AC_SRC_OVER,0,255,AC_SRC_ALPHA};
    UpdateLayeredWindow(window,screen,&origin,&size,memory,&zero,0,&blend,ULW_ALPHA);
    SelectObject(memory,previous);DeleteObject(dib);DeleteDC(memory);ReleaseDC(nullptr,screen);
    if(shown>.01f&&!IsWindowVisible(window))ShowWindow(window,SW_SHOWNOACTIVATE);else if(shown<=.01f&&IsWindowVisible(window)&&!shouldShow())ShowWindow(window,SW_HIDE);
}
void step(){
    ULONGLONG now=GetTickCount64();float dt=std::min(.032f,lastFrame?float(now-lastFrame)/1000.f:.016f);lastFrame=now;bool moving=false;const bool calm=reduceMotion();
    auto move=[&](float& v,float target,float tau=.075f){float n=approach(v,target,dt,tau);if(std::fabs(n-target)<.002f)n=target;if(n!=v)moving=true;v=n;};
    // Bouncy springs for size, a firmer one for position; reduced motion uses critically damped springs.
    auto bounce=[&](Spring& sp,float target){float k=calm?300.f:560.f,d=calm?2*std::sqrt(k):21.f;for(int i=0;i<2;++i)moving|=sp.step(target,dt/2,k,d);};
    auto glide=[&](Spring& sp,float target){float k=calm?320.f:420.f,d=calm?2*std::sqrt(k):31.f;for(int i=0;i<2;++i)moving|=sp.step(target,dt/2,k,d);};
    move(shown,shouldShow()?1.f:0.f,.06f);move(homeShown,activeTab&&activeTab->video?1.f:0.f,.07f);
    bounce(homeScale,hovered==-1?(pressed==-1?.94f:1.12f):1.f);
    float y=PAD+homeShown*(ITEM+GAP);
    for(size_t i=0;i<items.size();++i){auto& it=*items[i];bool active=it.tab==activeTab;if(!it.placed){it.y.value=y;it.placed=true;}
        // Dock-style magnification: the hovered tile swells and its neighbours lean in a little.
        float lift=0;if(hovered>=0){int d=std::abs(int(i)-hovered);lift=d==0?.16f:d==1?.05f:0.f;}
        float target=(active?1.08f:1.f)+lift;if(int(i)==pressed)target=.94f;
        glide(it.y,y);bounce(it.scale,target);move(it.alpha,1.f,.07f);move(it.white,active?1.f:0.f,.08f);move(it.hover,int(i)==hovered?1.f:0.f,.06f);y+=ITEM+GAP;}
    glide(pill,contentHeight());pillHeight=std::max(PAD*2+ITEM*.5f,pill.value);move(tipAlpha,hovered>=0?1.f:0.f,.05f);
    place();if(!moving){animating=false;KillTimer(window,1);lastFrame=0;}
}
void kick(){if(!window)return;if(!animating){animating=true;lastFrame=0;SetTimer(window,1,16,nullptr);}step();}
int hit(POINT p,bool* onClose){
    float s=scale();RECT r{};GetWindowRect(window,&r);const float pillW=(ITEM+PAD*2)*s,margin=MARGIN*s,tip=TIP*s;float px=outside?margin:margin+tip,py=margin;float lx=p.x-r.left-px,ly=p.y-r.top-py;
    if(onClose)*onClose=false;if(lx<0||lx>pillW||ly<0||ly>pillHeight*s)return -3;
    if(homeShown>.5f&&ly>=PAD*s&&ly<=(PAD+ITEM)*s)return -1;
    for(size_t i=0;i<items.size();++i){float top=items[i]->y.value*s;if(ly>=top-GAP*s/2&&ly<=top+ITEM*s+GAP*s/2){if(onClose){float cx=lx-(pillW/2+ITEM*s/2-8*s*1.25f),cy=ly-(top+8*s*1.25f);*onClose=cx*cx+cy*cy<=(10*s)*(10*s);}return int(i);}}
    return -2;
}
LRESULT CALLBACK proc(HWND h,UINT msg,WPARAM wp,LPARAM lp){
    switch(msg){
    case WM_MOUSEACTIVATE:return MA_NOACTIVATE;
    case WM_TIMER:step();return 0;
    case coverMessage:acceptCover(reinterpret_cast<CoverReply*>(lp));return 0;
    case WM_SETCURSOR:{POINT p;GetCursorPos(&p);if(hit(p,nullptr)>=-1){SetCursor(LoadCursorW(nullptr,IDC_HAND));return TRUE;}break;}
    case WM_MOUSEMOVE:{if(!tracking){TRACKMOUSEEVENT t{sizeof(t),TME_LEAVE,h,0};TrackMouseEvent(&t);tracking=true;}POINT p;GetCursorPos(&p);bool onClose=false;int now=hit(p,&onClose);if(now<-1)now=-2;
        if(now!=hovered||onClose!=closeHovered){hovered=now;closeHovered=onClose;if(now>=0)tipText=items[now]->tab->title;kick();}return 0;}
    case WM_MOUSELEAVE:tracking=false;hovered=-2;pressed=-2;closeHovered=false;kick();return 0;
    case WM_LBUTTONDOWN:{POINT p;GetCursorPos(&p);pressed=hit(p,nullptr);kick();return 0;}
    case WM_LBUTTONUP:{POINT p;GetCursorPos(&p);bool onClose=false;int target=hit(p,&onClose);if(target!=pressed)return 0;pressed=-2;
        if(target==-1&&homeTab)activateTab(homeTab);else if(target>=0&&target<int(items.size())){Tab* t=items[target]->tab;if(onClose)closeTab(t);else if(t->controller)activateTab(t);}return 0;}
    case WM_MBUTTONUP:{POINT p;GetCursorPos(&p);int target=hit(p,nullptr);if(target>=0&&target<int(items.size()))closeTab(items[target]->tab);return 0;}
    }
    return DefWindowProcW(h,msg,wp,lp);
}
void init(){
    if(window)return;GdiplusStartupInput input;if(GdiplusStartup(&gdiplusToken,&input,nullptr)!=Ok)return;
    WNDCLASSEXW wc{sizeof(wc)};wc.lpfnWndProc=proc;wc.hInstance=GetModuleHandleW(nullptr);wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.lpszClassName=L"BiliSpaceVideoDock";RegisterClassExW(&wc);
    window=CreateWindowExW(WS_EX_LAYERED|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE,wc.lpszClassName,L"",WS_POPUP,0,0,1,1,windowHandle,nullptr,wc.hInstance,nullptr);
    pillHeight=PAD*2+ITEM;pill.value=pillHeight;homeScale.value=1;
}
void shutdown(){if(window){DestroyWindow(window);window=nullptr;}items.clear();home.image.reset();if(gdiplusToken){GdiplusShutdown(gdiplusToken);gdiplusToken=0;}}
}
void dockSync(){
    if(!dock::window)dock::init();if(!dock::window)return;auto list=videoTabs();
    std::vector<std::unique_ptr<dock::Item>> next;
    for(auto t:list){std::unique_ptr<dock::Item> item;for(auto& old:dock::items)if(old&&old->tab==t){item=std::move(old);break;}
        if(!item){item=std::make_unique<dock::Item>();item->tab=t;}
        if(item->cover!=t->cover){item->cover=t->cover;item->image.reset();item->fetching=false;dock::fetchCover(*item);}
        next.push_back(std::move(item));}
    dock::items=std::move(next);if(dock::hovered>=int(dock::items.size()))dock::hovered=-2;if(dock::hovered>=0)dock::tipText=dock::items[dock::hovered]->tab->title;dock::kick();
}
void dockLayout(){if(dock::window)dock::kick();}
