#pragma once
// The video dock: a per-pixel-alpha layered window beside the main window, drawn with GDI+.
// It runs on its own thread so page loads on the main UI thread never stall its animation; the main
// thread hands it a snapshot of the tabs and receives clicks back as window messages.
namespace Gdiplus{using std::min;using std::max;}
#include <gdiplus.h>
constexpr UINT dockActionMessage=WM_APP+93;
namespace dock{
using namespace Gdiplus;
struct Entry{uintptr_t id=0;std::string title,cover;bool active=false;};
struct State{bool show=false,video=false,zoomed=false,dark=true;RECT main{};UINT dpi=96;std::vector<Entry> entries;};
std::mutex stateLock;State latest;std::thread worker;std::atomic<HWND> window{nullptr};std::atomic<bool> running{false};
constexpr UINT stateMessage=WM_APP+90,coverMessage=WM_APP+91,quitMessage=WM_APP+92;
constexpr float ITEM=44,PAD=8,GAP=8,RADIUS=20,INNER=12,MARGIN=26,TIP=300,OFFSET=12,CLOSE=10;

// ---- everything below runs on the dock thread ----
// A damped spring: interruptible because it carries velocity; under-damped values give the small bounce.
struct Spring{float value=0,velocity=0;bool step(float target,float dt,float stiffness,float damping){float a=stiffness*(target-value)-damping*velocity;velocity+=a*dt;value+=velocity*dt;if(std::fabs(target-value)<.0008f&&std::fabs(velocity)<.01f){value=target;velocity=0;return false;}return true;}};
struct Item{Entry entry;Spring y,scale{.5f,0};float alpha=0,white=0,hover=0;bool placed=false,fetching=false;std::unique_ptr<Bitmap> image;std::string imageFor;};
struct CoverReply{uintptr_t id;std::string cover,bytes;};
ULONG_PTR gdiplusToken{};State view;std::vector<std::unique_ptr<Item>> items;Spring pill,homeScale{1,0};float shown=0,homeShown=0,tipAlpha=0,pillHeight=PAD*2+ITEM;
int hovered=-2,pressed=-2;bool closeHovered=false,tracking=false,animating=false,outside=true;ULONGLONG lastFrame=0;std::string tipText;std::unique_ptr<GraphicsPath> homeGlyph;
HDC canvasDc{};HBITMAP canvasBitmap{};HGDIOBJ canvasPrevious{};void* canvasBits{};int canvasW=0,canvasH=0;

bool reduceMotion(){BOOL on=TRUE;SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION,0,&on,0);return !on;}
float scale(){return view.dpi/96.f;}
void rounded(GraphicsPath& p,float x,float y,float w,float h,float r){r=std::min(r,std::min(w,h)/2);float d=r*2;p.AddArc(x,y,d,d,180,90);p.AddArc(x+w-d,y,d,d,270,90);p.AddArc(x+w-d,y+h-d,d,d,0,90);p.AddArc(x,y+h-d,d,d,90,90);p.CloseFigure();}
void softShadow(Graphics& g,float x,float y,float w,float h,float r,float strength,float spread){
    for(int i=12;i>=1;--i){float t=i/12.f,grow=spread*t;GraphicsPath p;rounded(p,x-grow,y-grow+spread*.45f,w+grow*2,h+grow*2,r+grow);SolidBrush b(Color(BYTE(std::min(255.f,strength*(1-t)*(1-t)*9.f)),0,0,0));g.FillPath(&b,&p);}
}
// The home glyph is the supplied SVG path (viewBox -4.5 0 32 32), parsed once into a GDI+ path.
std::unique_ptr<GraphicsPath> parseGlyph(const char* d){
    auto path=std::make_unique<GraphicsPath>(FillModeWinding);float cx=0,cy=0,sx=0,sy=0;char cmd=0;const char* p=d;
    auto skip=[&]{while(*p==' '||*p==','||*p=='\n')++p;};auto number=[&]{skip();char* end=nullptr;float v=std::strtof(p,&end);p=end;return v;};
    auto isNum=[&]{skip();return (*p>='0'&&*p<='9')||*p=='-'||*p=='.'||*p=='+';};
    while(true){skip();if(!*p)break;if(!isNum())cmd=*p++;bool rel=cmd>='a'&&cmd<='z';
        switch(cmd|32){
        case 'm':{float x=number(),y=number();if(rel){x+=cx;y+=cy;}path->StartFigure();cx=sx=x;cy=sy=y;cmd=rel?'l':'L';break;}
        case 'l':{float x=number(),y=number();if(rel){x+=cx;y+=cy;}path->AddLine(cx,cy,x,y);cx=x;cy=y;break;}
        case 'h':{float x=number();if(rel)x+=cx;path->AddLine(cx,cy,x,cy);cx=x;break;}
        case 'v':{float y=number();if(rel)y+=cy;path->AddLine(cx,cy,cx,y);cy=y;break;}
        case 'c':{float a[6];for(auto& v:a)v=number();if(rel)for(int i=0;i<6;i+=2){a[i]+=cx;a[i+1]+=cy;}path->AddBezier(cx,cy,a[0],a[1],a[2],a[3],a[4],a[5]);cx=a[4];cy=a[5];break;}
        case 'z':path->CloseFigure();cx=sx;cy=sy;break;
        default:return path;}
    }
    return path;
}
void fetchCover(Item& item){
    if(item.fetching||item.entry.cover.empty()||item.imageFor==item.entry.cover)return;std::string url=item.entry.cover;if(url.rfind("//",0)==0)url="https:"+url;if(url.rfind("http://",0)==0)url="https://"+url.substr(7);
    auto at=url.find('@');if(at!=std::string::npos)url.resize(at);
    URL_COMPONENTS c{};c.dwStructSize=sizeof(c);wchar_t host[256]{},path[2048]{};c.lpszHostName=host;c.dwHostNameLength=255;c.lpszUrlPath=path;c.dwUrlPathLength=2047;auto wurl=wide(url);
    if(url.size()>1800||!WinHttpCrackUrl(wurl.c_str(),DWORD(wurl.size()),0,&c)||c.nScheme!=INTERNET_SCHEME_HTTPS)return;std::wstring h=host;
    if(!(h.size()>10&&h.compare(h.size()-10,10,L".hdslb.com")==0))return;
    item.fetching=true;uintptr_t id=item.entry.id;std::string cover=item.entry.cover;std::wstring hostName=h,file=std::wstring(path)+L"@160w_160h_1c.png";HWND target=window;
    std::thread([id,cover,hostName,file,target]{
        std::string bytes;auto session=WinHttpOpen(L"Bili-Space",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,WINHTTP_NO_PROXY_NAME,WINHTTP_NO_PROXY_BYPASS,0);
        if(session){WinHttpSetTimeouts(session,3000,3000,5000,8000);auto conn=WinHttpConnect(session,hostName.c_str(),INTERNET_DEFAULT_HTTPS_PORT,0);
            auto req=conn?WinHttpOpenRequest(conn,L"GET",file.c_str(),nullptr,L"https://www.bilibili.com/",WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE):nullptr;
            if(req&&WinHttpSendRequest(req,WINHTTP_NO_ADDITIONAL_HEADERS,0,nullptr,0,0,0)&&WinHttpReceiveResponse(req,nullptr)){DWORD status=0,size=sizeof(status);WinHttpQueryHeaders(req,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr);
                if(status==200){char buffer[16384];DWORD n=0;while(WinHttpReadData(req,buffer,sizeof(buffer),&n)&&n){bytes.append(buffer,n);if(bytes.size()>4*1024*1024){bytes.clear();break;}}}}
            if(req)WinHttpCloseHandle(req);if(conn)WinHttpCloseHandle(conn);WinHttpCloseHandle(session);}
        if(!IsWindow(target))return;auto reply=new CoverReply{id,cover,std::move(bytes)};if(!PostMessageW(target,coverMessage,0,reinterpret_cast<LPARAM>(reply)))delete reply;
    }).detach();
}
void kick();
void acceptCover(CoverReply* reply){
    std::unique_ptr<CoverReply> owned(reply);
    for(auto& item:items)if(item->entry.id==reply->id){item->fetching=false;if(reply->bytes.empty()||item->entry.cover!=reply->cover)return;
        HGLOBAL memory=GlobalAlloc(GMEM_MOVEABLE,reply->bytes.size());if(!memory)return;memcpy(GlobalLock(memory),reply->bytes.data(),reply->bytes.size());GlobalUnlock(memory);
        IStream* stream{};if(FAILED(CreateStreamOnHGlobal(memory,TRUE,&stream))){GlobalFree(memory);return;}
        std::unique_ptr<Bitmap> source(Bitmap::FromStream(stream));stream->Release();if(!source||source->GetLastStatus()!=Ok)return;
        const int side=160;auto square=std::make_unique<Bitmap>(side,side,PixelFormat32bppPARGB);{Graphics g(square.get());g.SetInterpolationMode(InterpolationModeHighQualityBicubic);g.SetPixelOffsetMode(PixelOffsetModeHalf);float w=float(source->GetWidth()),h=float(source->GetHeight()),crop=std::min(w,h);g.DrawImage(source.get(),RectF(0,0,side,side),(w-crop)/2,(h-crop)/2,crop,crop,UnitPixel);}
        item->image=std::move(square);item->imageFor=reply->cover;kick();return;}
}
float approach(float value,float target,float dt,float tau=.075f){return value+(target-value)*(1-std::exp(-dt/tau));}
float contentHeight(){float h=PAD*2+homeShown*(ITEM+GAP);if(!items.empty())h+=items.size()*ITEM+(items.size()-1)*GAP;else h=std::max(h-GAP*homeShown,PAD*2+ITEM);return h;}
void ensureCanvas(int w,int h){
    if(canvasDc&&w==canvasW&&h==canvasH)return;
    if(canvasDc){SelectObject(canvasDc,canvasPrevious);DeleteObject(canvasBitmap);DeleteDC(canvasDc);}
    HDC screen=GetDC(nullptr);canvasDc=CreateCompatibleDC(screen);BITMAPINFO bi{};bi.bmiHeader={sizeof(BITMAPINFOHEADER),w,-h,1,32,BI_RGB};
    canvasBitmap=CreateDIBSection(screen,&bi,DIB_RGB_COLORS,&canvasBits,nullptr,0);canvasPrevious=SelectObject(canvasDc,canvasBitmap);ReleaseDC(nullptr,screen);canvasW=w;canvasH=h;
}
struct Geometry{float px,py,pw;int x,y,w,h;};
Geometry geometry(){
    float s=scale();HMONITOR monitor=MonitorFromRect(&view.main,MONITOR_DEFAULTTONEAREST);MONITORINFO mi{sizeof(mi)};GetMonitorInfoW(monitor,&mi);const RECT& main=view.main;
    const int pillW=int((ITEM+PAD*2)*s),margin=int(MARGIN*s),tip=int(TIP*s),gap=int(OFFSET*s);
    outside=!view.zoomed&&main.right+gap+pillW+margin<=mi.rcWork.right;
    Geometry g{};g.w=margin*2+pillW+tip;g.h=int(std::ceil(pillHeight*s))+margin*2;g.x=outside?main.right+gap-margin:main.right-gap-pillW-margin-tip;
    int centre=(std::max(main.top,mi.rcWork.top)+std::min(main.bottom,mi.rcWork.bottom))/2;g.y=std::max(int(mi.rcWork.top),std::min(centre-g.h/2,int(mi.rcWork.bottom)-g.h));
    g.px=float(outside?margin:margin+tip);g.py=float(margin);g.pw=float(pillW);return g;
}
void paint(){
    HWND h=window;if(!h)return;float s=scale();auto geo=geometry();ensureCanvas(geo.w,geo.h);if(!canvasBits)return;const bool dark=view.dark;const float a=shown;
    {Bitmap canvas(geo.w,geo.h,geo.w*4,PixelFormat32bppPARGB,static_cast<BYTE*>(canvasBits));Graphics g(&canvas);g.SetSmoothingMode(SmoothingModeAntiAlias);g.SetPixelOffsetMode(PixelOffsetModeHalf);g.SetInterpolationMode(InterpolationModeHighQualityBilinear);g.SetTextRenderingHint(TextRenderingHintAntiAliasGridFit);g.Clear(Color(0,0,0,0));
        const float px=geo.px,py=geo.py,pw=geo.pw,ph=pillHeight*s;
        if(a>.01f){
            softShadow(g,px,py,pw,ph,RADIUS*s,a,16*s);
            GraphicsPath shape;rounded(shape,px,py,pw,ph,RADIUS*s);SolidBrush fill(dark?Color(BYTE(236*a),32,32,36):Color(BYTE(240*a),252,252,253));g.FillPath(&fill,&shape);
            auto tile=[&](float cy,float tileScale,float alpha,float white,Bitmap* image,bool isHome,bool active)->RectF{
                float size=ITEM*s*tileScale,cx=px+pw/2,x=cx-size/2,y=py+cy*s+(ITEM*s-size)/2;RectF box(x,y,size,size);if(alpha<.01f)return box;
                softShadow(g,x,y,size,size,INNER*s*tileScale,alpha*(active?1.5f:.75f),(active?9:5)*s);
                GraphicsPath tilePath;rounded(tilePath,x,y,size,size,INNER*s*tileScale);
                if(isHome){SolidBrush b(dark?Color(BYTE(alpha*255),50,50,56):Color(BYTE(alpha*255),238,238,242));g.FillPath(&b,&tilePath);
                    if(homeGlyph){Matrix m;float glyph=size*.5f,u=glyph/32.f;m.Translate(x+(size-glyph)/2+4.5f*u,y+(size-glyph)/2);m.Scale(u,u);GraphicsPath copy;copy.AddPath(homeGlyph.get(),FALSE);copy.Transform(&m);
                        SolidBrush ink(dark?Color(BYTE(alpha*240),240,240,244):Color(BYTE(alpha*240),36,36,42));g.FillPath(&ink,&copy);}
                }else if(image){
                    // A texture-filled rounded path keeps the cover edge anti-aliased (clip regions are not).
                    ImageAttributes ia;ColorMatrix cm={{{1,0,0,0,0},{0,1,0,0,0},{0,0,1,0,0},{0,0,0,alpha,0},{0,0,0,0,1}}};ia.SetColorMatrix(&cm);
                    TextureBrush brush(image,RectF(0,0,REAL(image->GetWidth()),REAL(image->GetHeight())),&ia);brush.SetWrapMode(WrapModeClamp);brush.TranslateTransform(x,y);brush.ScaleTransform(size/image->GetWidth(),size/image->GetHeight());g.FillPath(&brush,&tilePath);
                }else{SolidBrush b(dark?Color(BYTE(alpha*255),50,50,56):Color(BYTE(alpha*255),232,232,236));g.FillPath(&b,&tilePath);
                    SolidBrush play(dark?Color(BYTE(alpha*150),235,235,240):Color(BYTE(alpha*140),40,40,46));float u=size/24.f;PointF tri[]={{x+10*u,y+8*u},{x+10*u,y+16*u},{x+16.5f*u,y+12*u}};g.FillPolygon(&play,tri,3);}
                if(!isHome&&white>.01f){SolidBrush w(Color(BYTE(std::min(1.f,white)*alpha*40),255,255,255));g.FillPath(&w,&tilePath);}
                return box;
            };
            tile(PAD,homeScale.value*(.6f+.4f*homeShown),homeShown*a,0,nullptr,true,false);
            if(homeShown>.01f&&!items.empty()){SolidBrush line(dark?Color(BYTE(34*a*homeShown),255,255,255):Color(BYTE(26*a*homeShown),0,0,0));g.FillRectangle(&line,px+pw/2-10*s,py+(PAD+ITEM+GAP/2)*s-.5f*s,20*s,1*s);}
            for(size_t i=0;i<items.size();++i){auto& it=*items[i];auto box=tile(it.y.value,it.scale.value,it.alpha*a,it.white,it.image.get(),false,it.entry.active);
                // The close button sits on the tile's top-right corner and may overhang it.
                if(it.hover>.01f){float r=CLOSE*s*(.75f+.25f*it.hover),cx=box.X+box.Width-r*.3f,cy=box.Y+r*.3f;softShadow(g,cx-r,cy-r,r*2,r*2,r,it.hover*a,4*s);
                    GraphicsPath dot;dot.AddEllipse(cx-r,cy-r,r*2,r*2);SolidBrush b(closeHovered&&int(i)==hovered?Color(BYTE(a*it.hover*245),232,72,84):(dark?Color(BYTE(a*it.hover*245),62,62,68):Color(BYTE(a*it.hover*245),255,255,255)));g.FillPath(&b,&dot);
                    Pen x1(closeHovered&&int(i)==hovered?Color(BYTE(a*it.hover*255),255,255,255):(dark?Color(BYTE(a*it.hover*255),240,240,244):Color(BYTE(a*it.hover*255),40,40,46)),1.7f*s);x1.SetStartCap(LineCapRound);x1.SetEndCap(LineCapRound);float k=r*.38f;g.DrawLine(&x1,cx-k,cy-k,cx+k,cy+k);g.DrawLine(&x1,cx+k,cy-k,cx-k,cy+k);}
            }
            if(tipAlpha>.01f&&!tipText.empty()&&hovered>=0&&hovered<int(items.size())){
                auto title=wide(tipText);FontFamily family(L"Microsoft YaHei UI");Font font(&family,13*s,FontStyleBold,UnitPixel);StringFormat fmt;fmt.SetTrimming(StringTrimmingEllipsisCharacter);fmt.SetFormatFlags(StringFormatFlagsNoWrap);fmt.SetLineAlignment(StringAlignmentCenter);
                RectF bounds;g.MeasureString(title.c_str(),-1,&font,PointF(0,0),&fmt,&bounds);float tw=std::min(bounds.Width+24*s,TIP*s-20*s),th=34*s,cy=py+(items[hovered]->y.value+ITEM/2)*s-th/2,slide=(1-tipAlpha)*6*s;
                float tx=outside?px+pw+12*s-slide:px-12*s-tw+slide;softShadow(g,tx,cy,tw,th,10*s,tipAlpha,9*s);
                GraphicsPath bubble;rounded(bubble,tx,cy,tw,th,10*s);SolidBrush bg(dark?Color(BYTE(244*tipAlpha),40,40,46):Color(BYTE(248*tipAlpha),255,255,255));g.FillPath(&bg,&bubble);
                SolidBrush ink(dark?Color(BYTE(255*tipAlpha),242,242,246):Color(BYTE(255*tipAlpha),28,28,32));g.DrawString(title.c_str(),-1,&font,RectF(tx+12*s,cy,tw-24*s,th),&fmt,&ink);
            }
        }
    }
    HDC screen=GetDC(nullptr);POINT origin{geo.x,geo.y},zero{0,0};SIZE size{geo.w,geo.h};BLENDFUNCTION blend{AC_SRC_OVER,0,255,AC_SRC_ALPHA};
    UpdateLayeredWindow(h,screen,&origin,&size,canvasDc,&zero,0,&blend,ULW_ALPHA);ReleaseDC(nullptr,screen);
    if(shown>.01f&&!IsWindowVisible(h))ShowWindow(h,SW_SHOWNOACTIVATE);else if(shown<=.01f&&!view.show&&IsWindowVisible(h))ShowWindow(h,SW_HIDE);
}
void step(){
    ULONGLONG now=GetTickCount64();float dt=std::min(.032f,lastFrame?float(now-lastFrame)/1000.f:.016f);lastFrame=now;bool moving=false;const bool calm=reduceMotion();
    auto move=[&](float& v,float target,float tau){float n=approach(v,target,dt,tau);if(std::fabs(n-target)<.002f)n=target;if(n!=v)moving=true;v=n;};
    auto bounce=[&](Spring& sp,float target){float k=calm?300.f:560.f,d=calm?2*std::sqrt(k):21.f;for(int i=0;i<2;++i)moving|=sp.step(target,dt/2,k,d);};
    auto glide=[&](Spring& sp,float target){float k=calm?320.f:420.f,d=calm?2*std::sqrt(k):31.f;for(int i=0;i<2;++i)moving|=sp.step(target,dt/2,k,d);};
    move(shown,view.show?1.f:0.f,.06f);move(homeShown,view.video?1.f:0.f,.07f);bounce(homeScale,hovered==-1?(pressed==-1?.94f:1.12f):1.f);
    float y=PAD+homeShown*(ITEM+GAP);
    for(size_t i=0;i<items.size();++i){auto& it=*items[i];if(!it.placed){it.y.value=y;it.placed=true;}
        // Dock-style magnification: the hovered tile swells and its neighbours lean in a little.
        float lift=0;if(hovered>=0){int d=std::abs(int(i)-hovered);lift=d==0?.16f:d==1?.05f:0.f;}
        float target=(it.entry.active?1.08f:1.f)+lift;if(int(i)==pressed)target=.94f;
        glide(it.y,y);bounce(it.scale,target);move(it.alpha,1.f,.07f);move(it.white,it.entry.active?1.f:0.f,.08f);move(it.hover,int(i)==hovered?1.f:0.f,.06f);y+=ITEM+GAP;}
    glide(pill,contentHeight());pillHeight=std::max(PAD*2+ITEM*.5f,pill.value);move(tipAlpha,hovered>=0?1.f:0.f,.05f);
    paint();if(!moving){animating=false;KillTimer(window,1);lastFrame=0;}
}
void kick(){HWND h=window;if(!h)return;if(!animating){animating=true;lastFrame=0;SetTimer(h,1,8,nullptr);}step();}
void acceptState(){
    {std::lock_guard<std::mutex> guard(stateLock);view=latest;}
    std::vector<std::unique_ptr<Item>> next;
    for(auto& e:view.entries){std::unique_ptr<Item> item;for(auto& old:items)if(old&&old->entry.id==e.id){item=std::move(old);break;}
        if(!item)item=std::make_unique<Item>();bool coverChanged=item->entry.cover!=e.cover;item->entry=e;if(coverChanged){item->fetching=false;fetchCover(*item);}next.push_back(std::move(item));}
    items=std::move(next);if(hovered>=int(items.size()))hovered=-2;if(hovered>=0)tipText=items[hovered]->entry.title;kick();
}
int hit(POINT p,bool* onClose){
    float s=scale();RECT r{};GetWindowRect(window,&r);auto geo=geometry();float lx=p.x-r.left-geo.px,ly=p.y-r.top-geo.py;if(onClose)*onClose=false;
    // The close button overhangs the tile, so it is tested before the pill bounds.
    if(onClose&&hovered>=0&&hovered<int(items.size())){auto& it=*items[hovered];float size=ITEM*s*it.scale.value,top=it.y.value*s+(ITEM*s-size)/2,rad=CLOSE*s,cx=geo.pw/2+size/2-rad*.3f,cy=top+rad*.3f;if((lx-cx)*(lx-cx)+(ly-cy)*(ly-cy)<=rad*rad*1.3f){*onClose=true;return hovered;}}
    if(lx<0||lx>geo.pw||ly<0||ly>pillHeight*s)return -3;
    if(homeShown>.5f&&ly>=PAD*s&&ly<=(PAD+ITEM)*s)return -1;
    for(size_t i=0;i<items.size();++i){float top=items[i]->y.value*s;if(ly>=top-GAP*s/2&&ly<=top+ITEM*s+GAP*s/2)return int(i);}
    return -2;
}
void act(WPARAM action,uintptr_t id){PostMessageW(windowHandle,dockActionMessage,action,LPARAM(id));}
LRESULT CALLBACK proc(HWND h,UINT msg,WPARAM wp,LPARAM lp){
    switch(msg){
    case WM_MOUSEACTIVATE:return MA_NOACTIVATE;
    case WM_TIMER:step();return 0;
    case stateMessage:acceptState();return 0;
    case coverMessage:acceptCover(reinterpret_cast<CoverReply*>(lp));return 0;
    case WM_SETCURSOR:{POINT p;GetCursorPos(&p);bool c=false;if(hit(p,&c)>=-1){SetCursor(LoadCursorW(nullptr,IDC_HAND));return TRUE;}break;}
    case WM_MOUSEMOVE:{if(!tracking){TRACKMOUSEEVENT t{sizeof(t),TME_LEAVE,h,0};TrackMouseEvent(&t);tracking=true;}POINT p;GetCursorPos(&p);bool onClose=false;int now=hit(p,&onClose);if(now<-1)now=-2;
        if(now!=hovered||onClose!=closeHovered){hovered=now;closeHovered=onClose;if(now>=0)tipText=items[now]->entry.title;kick();}return 0;}
    case WM_MOUSELEAVE:tracking=false;hovered=-2;pressed=-2;closeHovered=false;kick();return 0;
    case WM_LBUTTONDOWN:{POINT p;GetCursorPos(&p);bool c=false;pressed=hit(p,&c);if(c)pressed=-4;kick();return 0;}
    case WM_LBUTTONUP:{POINT p;GetCursorPos(&p);bool onClose=false;int target=hit(p,&onClose);int was=pressed;pressed=-2;kick();
        if(onClose&&was==-4&&target>=0&&target<int(items.size()))act(2,items[target]->entry.id);
        else if(!onClose&&target==was){if(target==-1)act(0,0);else if(target>=0&&target<int(items.size()))act(1,items[target]->entry.id);}return 0;}
    case WM_MBUTTONUP:{POINT p;GetCursorPos(&p);int target=hit(p,nullptr);if(target>=0&&target<int(items.size()))act(2,items[target]->entry.id);return 0;}
    case quitMessage:DestroyWindow(h);return 0;
    case WM_DESTROY:PostQuitMessage(0);return 0;
    }
    return DefWindowProcW(h,msg,wp,lp);
}
void run(HWND owner){
    GdiplusStartupInput input;if(GdiplusStartup(&gdiplusToken,&input,nullptr)!=Ok){running=false;return;}
    homeGlyph=parseGlyph("M19.469 12.594l3.625 3.313c0.438 0.406 0.313 0.719-0.281 0.719h-2.719v8.656c0 0.594-0.5 1.125-1.094 1.125h-4.719v-6.063c0-0.594-0.531-1.125-1.125-1.125h-2.969c-0.594 0-1.125 0.531-1.125 1.125v6.063h-4.719c-0.594 0-1.125-0.531-1.125-1.125v-8.656h-2.688c-0.594 0-0.719-0.313-0.281-0.719l10.594-9.625c0.438-0.406 1.188-0.406 1.656 0l2.406 2.156v-1.719c0-0.594 0.531-1.125 1.125-1.125h2.344c0.594 0 1.094 0.531 1.094 1.125v5.875z");
    WNDCLASSEXW wc{sizeof(wc)};wc.lpfnWndProc=proc;wc.hInstance=GetModuleHandleW(nullptr);wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);wc.lpszClassName=L"BiliSpaceVideoDock";RegisterClassExW(&wc);
    HWND h=CreateWindowExW(WS_EX_LAYERED|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE,wc.lpszClassName,L"",WS_POPUP,0,0,1,1,owner,nullptr,wc.hInstance,nullptr);
    pill.value=pillHeight;window=h;if(h)acceptState();
    MSG m;while(h&&GetMessageW(&m,nullptr,0,0)>0){TranslateMessage(&m);DispatchMessageW(&m);}
    window=nullptr;items.clear();homeGlyph.reset();if(canvasDc){SelectObject(canvasDc,canvasPrevious);DeleteObject(canvasBitmap);DeleteDC(canvasDc);canvasDc=nullptr;}
    GdiplusShutdown(gdiplusToken);running=false;
}
// ---- main thread ----
void publish(State state){
    {std::lock_guard<std::mutex> guard(stateLock);latest=std::move(state);}
    if(!running.exchange(true)){if(worker.joinable())worker.join();worker=std::thread(run,windowHandle);return;}
    if(HWND h=window)PostMessageW(h,stateMessage,0,0);
}
void shutdown(){if(HWND h=window)PostMessageW(h,quitMessage,0,0);if(worker.joinable()){auto started=GetTickCount64();while(running&&GetTickCount64()-started<1500)Sleep(10);if(!running)worker.join();else worker.detach();}}
}
void dockSync(){
    dock::State state;auto list=videoTabs();
    if(list.empty()&&!dock::running)return;
    state.show=!list.empty()&&IsWindowVisible(windowHandle)&&!IsIconic(windowHandle)&&!full&&!pip&&!closePending;
    state.video=activeTab&&activeTab->video;state.zoomed=IsZoomed(windowHandle);state.dark=surfaceDark;GetWindowRect(windowHandle,&state.main);
    using Dpi=UINT(WINAPI*)(HWND);static auto dpi=reinterpret_cast<Dpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));state.dpi=dpi?dpi(windowHandle):96;
    for(auto t:list)state.entries.push_back({reinterpret_cast<uintptr_t>(t),t->title,t->cover,t==activeTab});
    dock::publish(std::move(state));
}
void dockLayout(){if(dock::running)dockSync();}
void dockAction(WPARAM action,LPARAM id){
    Tab* target=nullptr;for(auto t:tabs)if(reinterpret_cast<LPARAM>(t)==id)target=t;
    if(action==0){if(homeTab)activateTab(homeTab);}else if(action==1){if(target&&target->controller)activateTab(target);}else if(action==2&&target)closeTab(target);
}
