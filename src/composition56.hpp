#pragma once
// Visual hosting: every WebView renders into a DirectComposition visual instead of its own child window. Pages live
// in a content layer and the persistent header view in a layer above it. The host window forwards mouse input to
// the header where it draws (its reported regions) and to the visible page everywhere else.
// Win7, a failed DirectComposition start or the windowedWebView setting fall back to windowed hosting.
#include <dcomp.h>
#include <d3d11.h>
void stepActive(int direction);
namespace comp{
// IID_IDCompositionDevice; the MinGW header declares the interface without its GUID.
constexpr GUID deviceIid{0xC37EA93A,0xE7AA,0x450D,{0xB1,0x6F,0x97,0x46,0xCB,0x04,0x07,0xF3}};
struct View{ICoreWebView2CompositionController* composition{};IDCompositionVisual* visual{};};
IDCompositionDevice* device{};IDCompositionTarget* target{};IDCompositionVisual *root{},*contentLayer{},*chromeLayer{};bool ready=false,failed=false,tracking=false;
std::map<ICoreWebView2Controller*,View> views;
// Header view state: the regions it currently draws (physical client pixels) and whether a modal dialog takes all input.
ICoreWebView2Controller* chromeController{};bool chromeVisible=false,chromeModal=false;std::vector<RECT> chromeRects;
ICoreWebView2Controller *pointerTarget{},*capturedTarget{},*focusTarget{};
// A Direct3D device lets the compositor hold pictures of its own (for the fullscreen transition), which it then moves and
// fades on the GPU. Loaded at run time; without it the transition is simply skipped.
ID3D11Device* d3d{};ID3D11DeviceContext* d3dContext{};
IUnknown* renderingDevice(){
    using Create=HRESULT(WINAPI*)(IDXGIAdapter*,D3D_DRIVER_TYPE,HMODULE,UINT,const D3D_FEATURE_LEVEL*,UINT,UINT,ID3D11Device**,D3D_FEATURE_LEVEL*,ID3D11DeviceContext**);
    auto library=LoadLibraryW(L"d3d11.dll");auto create=library?reinterpret_cast<Create>(GetProcAddress(library,"D3D11CreateDevice")):nullptr;if(!create)return nullptr;
    for(auto type:{D3D_DRIVER_TYPE_HARDWARE,D3D_DRIVER_TYPE_WARP})if(SUCCEEDED(create(nullptr,type,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&d3d,nullptr,&d3dContext)))break;
    if(!d3d)return nullptr;IDXGIDevice* dxgi{};if(FAILED(d3d->QueryInterface(__uuidof(IDXGIDevice),reinterpret_cast<void**>(&dxgi)))){d3dContext->Release();d3d->Release();d3d=nullptr;d3dContext=nullptr;return nullptr;}
    return dxgi;
}
bool init(){
    if(ready)return true;if(failed)return false;
#ifdef BILI_LEGACY_WIN7
    failed=true;return false;
#endif
    if(config.value("windowedWebView",false)){failed=true;return false;}
    using Create=HRESULT(WINAPI*)(IUnknown*,REFIID,void**);
    auto library=LoadLibraryW(L"dcomp.dll");auto create=library?reinterpret_cast<Create>(GetProcAddress(library,"DCompositionCreateDevice2")):nullptr;
    IUnknown* rendering=create?renderingDevice():nullptr;const HRESULT made=create?create(rendering,deviceIid,reinterpret_cast<void**>(&device)):E_FAIL;if(rendering)rendering->Release();
    if(!create||FAILED(made)||!device){failed=true;log("composition: unavailable, using windowed WebView");return false;}
    if(FAILED(device->CreateTargetForHwnd(windowHandle,TRUE,&target))||FAILED(device->CreateVisual(&root))||FAILED(device->CreateVisual(&contentLayer))||FAILED(device->CreateVisual(&chromeLayer))){failed=true;log("composition: target failed, using windowed WebView");return false;}
    // The header layer is explicitly placed in front of the content layer.
    root->AddVisual(contentLayer,FALSE,nullptr);root->AddVisual(chromeLayer,TRUE,contentLayer);target->SetRoot(root);
    device->Commit();ready=true;log("composition: visual hosting ready");return true;
}
// Visual hosting must be told that bounds are physical pixels and that content rasterizes at the window's own DPI;
// otherwise it scales the bounds again and the views draw 25% too large at 125% scaling, with input offset to match.
// Fullscreen transition: when the window jumps to or from fullscreen the page needs a frame or two to draw at the new
// size, and its old-size frame would flash meanwhile. The page layer is hidden across the jump and, once the page has
// drawn at the new size, it fades in from a slight zoom; the compositor runs the motion, so a busy page cannot stall it.
IDCompositionEffectGroup* fade{};IDCompositionMatrixTransform* zoom{};
bool hideContent(){
    if(!ready||!contentLayer)return false;
    if(!fade&&FAILED(device->CreateEffectGroup(&fade)))return false;
    fade->SetOpacity(0.f);contentLayer->SetEffect(fade);contentLayer->SetTransform(static_cast<IDCompositionTransform*>(nullptr));device->Commit();return true;
}
// Ease-out cubic v(t)=a+d(3u-3u^2+u^3), u=t/T, written as the polynomial in t that DirectComposition evaluates.
IDCompositionAnimation* easeOut(float from,float to,double T){IDCompositionAnimation* a{};if(FAILED(device->CreateAnimation(&a)))return nullptr;const double d=double(to)-from;
    a->AddCubic(0,from,float(3*d/T),float(-3*d/(T*T)),float(d/(T*T*T)));a->End(T,to);return a;}
void revealContent(float scale,float width,float height,double seconds){
    if(!ready||!contentLayer||!fade)return;
    if(seconds<=0){fade->SetOpacity(1.f);device->Commit();return;}
    if(auto a=easeOut(0.f,1.f,seconds)){fade->SetOpacity(a);a->Release();}else fade->SetOpacity(1.f);
    if(scale!=1.f&&(zoom||SUCCEEDED(device->CreateMatrixTransform(&zoom)))){
        // Scaled about the centre of the window.
        const float x=width/2*(1-scale),y=height/2*(1-scale);D2D_MATRIX_3X2_F start{};start._11=scale;start._22=scale;start._31=x;start._32=y;zoom->SetMatrix(start);
        for(auto [row,column,from]:{std::tuple{0,0,scale},std::tuple{1,1,scale},std::tuple{2,0,x},std::tuple{2,1,y}})if(auto a=easeOut(from,row==2?0.f:1.f,seconds)){zoom->SetMatrixElement(row,column,a);a->Release();}
        contentLayer->SetTransform(zoom);
    }
    device->Commit();
}
// Shows the page layer at once, drawn through a transform that starts at (scale, x, y) and eases out to identity.
void revealFrom(float scale,float x,float y,double seconds,double fadeSeconds=0){
    if(!ready||!contentLayer)return;
    if(fade){if(fadeSeconds>0)if(auto a=easeOut(0.f,1.f,fadeSeconds)){fade->SetOpacity(a);a->Release();}else fade->SetOpacity(1.f);else fade->SetOpacity(1.f);}
    if(seconds>0&&(scale!=1.f||x!=0.f||y!=0.f)&&(zoom||SUCCEEDED(device->CreateMatrixTransform(&zoom)))){
        D2D_MATRIX_3X2_F start{};start._11=scale;start._22=scale;start._31=x;start._32=y;zoom->SetMatrix(start);
        for(auto [row,column,from,to]:{std::tuple{0,0,scale,1.f},std::tuple{1,1,scale,1.f},std::tuple{2,0,x,0.f},std::tuple{2,1,y,0.f}})if(auto a=easeOut(from,to,seconds)){zoom->SetMatrixElement(row,column,a);a->Release();}
        contentLayer->SetTransform(zoom);
    }
    device->Commit();
}
// Transition pictures live in a layer under the page layer: what the screen showed, a black veil over it, and the video.
IDCompositionVisual* underLayer{};
struct Picture{IDCompositionVisual* visual{};IDCompositionSurface* surface{};int width=0,height=0;
    void release(){if(visual)visual->Release();if(surface)surface->Release();*this=Picture{};}};
Picture pagePicture,veilPicture,videoPicture;IDCompositionEffectGroup* veil{};IDCompositionMatrixTransform *veilSize{},*videoMotion{};
bool upload(Picture& p,const uint32_t* pixels,int w,int h){
    p.release();if(!ready||!d3d||w<=0||h<=0)return false;
    if(FAILED(device->CreateSurface(UINT(w),UINT(h),DXGI_FORMAT_B8G8R8A8_UNORM,DXGI_ALPHA_MODE_IGNORE,&p.surface)))return false;
    ID3D11Texture2D* texture{};POINT at{};if(FAILED(p.surface->BeginDraw(nullptr,__uuidof(ID3D11Texture2D),reinterpret_cast<void**>(&texture),&at))){p.release();return false;}
    D3D11_BOX box{UINT(at.x),UINT(at.y),0,UINT(at.x+w),UINT(at.y+h),1};d3dContext->UpdateSubresource(texture,0,&box,pixels,UINT(w*4),0);texture->Release();p.surface->EndDraw();
    if(FAILED(device->CreateVisual(&p.visual))){p.release();return false;}p.visual->SetContent(p.surface);p.width=w;p.height=h;return true;
}
bool upload(Picture& p,HBITMAP bitmap){
    BITMAP info{};if(!bitmap||!GetObjectW(bitmap,sizeof(info),&info))return false;const int w=info.bmWidth,h=info.bmHeight;if(w<=0||h<=0)return false;
    std::vector<uint32_t> pixels(size_t(w)*size_t(h));BITMAPINFO bi{};bi.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);bi.bmiHeader.biWidth=w;bi.bmiHeader.biHeight=-h;bi.bmiHeader.biPlanes=1;bi.bmiHeader.biBitCount=32;bi.bmiHeader.biCompression=BI_RGB;
    HDC dc=GetDC(nullptr);const int lines=GetDIBits(dc,bitmap,0,UINT(h),pixels.data(),&bi,DIB_RGB_COLORS);ReleaseDC(nullptr,dc);if(lines!=h)return false;
    for(auto& px:pixels)px|=0xFF000000u;return upload(p,pixels.data(),w,h);
}
void place(IDCompositionMatrixTransform*& t,IDCompositionVisual* v,float scale,float x,float y){
    if(!t&&FAILED(device->CreateMatrixTransform(&t)))return;D2D_MATRIX_3X2_F m{};m._11=scale;m._22=scale;m._31=x;m._32=y;t->SetMatrix(m);v->SetTransform(t);
}
// Puts the screen picture (and a clear veil over it) under the page layer at a place in client pixels.
bool stagePage(HBITMAP shot,POINT at,float veilOpacity=0.f){
    if(!ready||!d3d)return false;
    if(!underLayer){if(FAILED(device->CreateVisual(&underLayer)))return false;root->AddVisual(underLayer,FALSE,contentLayer);}
    if(shot&&!upload(pagePicture,shot))return false;if(!pagePicture.visual)return false;
    if(!veilPicture.visual){const uint32_t black=0xFF000000u;if(!upload(veilPicture,&black,1,1))return false;veilPicture.visual->SetBitmapInterpolationMode(DCOMPOSITION_BITMAP_INTERPOLATION_MODE_NEAREST_NEIGHBOR);}
    if(!veil&&FAILED(device->CreateEffectGroup(&veil)))return false;veil->SetOpacity(veilOpacity);veilPicture.visual->SetEffect(veil);
    underLayer->RemoveAllVisuals();underLayer->AddVisual(pagePicture.visual,FALSE,nullptr);underLayer->AddVisual(veilPicture.visual,TRUE,pagePicture.visual);
    pagePicture.visual->SetOffsetX(float(at.x));pagePicture.visual->SetOffsetY(float(at.y));
    place(veilSize,veilPicture.visual,1.f,float(at.x),float(at.y));if(veilSize){veilSize->SetMatrixElement(0,0,float(pagePicture.width));veilSize->SetMatrixElement(1,1,float(pagePicture.height));}
    device->Commit();return true;
}
void movePage(POINT at){
    if(!pagePicture.visual)return;pagePicture.visual->SetOffsetX(float(at.x));pagePicture.visual->SetOffsetY(float(at.y));
    if(veilSize){veilSize->SetMatrixElement(2,0,float(at.x));veilSize->SetMatrixElement(2,1,float(at.y));}device->Commit();
}
void veilTo(float from,float to,double seconds){if(!veil)return;if(auto a=easeOut(from,to,seconds)){veil->SetOpacity(a);a->Release();}else veil->SetOpacity(to);device->Commit();}
// The fullscreen video picture, on top of the veil; it shrinks from covering the window onto the player's place.
bool stageVideo(HBITMAP shot,const D2D_RECT_F& clip){
    if(!underLayer||!upload(videoPicture,shot))return false;
    underLayer->AddVisual(videoPicture.visual,TRUE,veilPicture.visual);place(videoMotion,videoPicture.visual,1.f,0.f,0.f);videoPicture.visual->SetClip(clip);device->Commit();return true;
}
void videoTo(float scale,float x,float y,double seconds){
    if(!videoMotion)return;
    for(auto [row,column,from,to]:{std::tuple{0,0,1.f,scale},std::tuple{1,1,1.f,scale},std::tuple{2,0,0.f,x},std::tuple{2,1,0.f,y}})if(auto a=easeOut(from,to,seconds)){videoMotion->SetMatrixElement(row,column,a);a->Release();}
    device->Commit();
}
// Holds the video picture still on the player's place, cut to the player's box (rect in client pixels).
void videoAt(float scale,float x,float y){
    if(!videoPicture.visual)return;place(videoMotion,videoPicture.visual,scale,x,y);device->Commit();
}
// The player cut out of the screen picture (crop in picture pixels), shown where it was and grown at once to the place
// the fullscreen video will occupy, so the motion starts with the key press rather than after the page has re-laid out.
IDCompositionVisual* cropVisual{};IDCompositionMatrixTransform* cropMotion{};
bool growCrop(const RECT& crop,POINT at,float scale,float x,float y,double seconds){
    if(!ready||!pagePicture.surface||!underLayer||crop.right<=crop.left||crop.bottom<=crop.top||!(scale>0.f))return false;
    if(!cropVisual){if(FAILED(device->CreateVisual(&cropVisual)))return false;}
    cropVisual->SetContent(pagePicture.surface);cropVisual->SetClip(D2D_RECT_F{float(crop.left),float(crop.top),float(crop.right),float(crop.bottom)});
    underLayer->RemoveVisual(cropVisual);underLayer->AddVisual(cropVisual,TRUE,veilPicture.visual);
    place(cropMotion,cropVisual,1.f,float(at.x),float(at.y));
    for(auto [row,column,from,to]:{std::tuple{0,0,1.f,scale},std::tuple{1,1,1.f,scale},std::tuple{2,0,float(at.x),x},std::tuple{2,1,float(at.y),y}})if(auto a=easeOut(from,to,seconds)){cropMotion->SetMatrixElement(row,column,a);a->Release();}
    device->Commit();return true;
}
// The live page layer fades in over the pictures (it is already where they lead), then they can go.
void crossIn(double seconds){if(!ready||!contentLayer)return;contentLayer->SetTransform(static_cast<IDCompositionTransform*>(nullptr));if(fade){if(auto a=easeOut(0.f,1.f,seconds)){fade->SetOpacity(a);a->Release();}else fade->SetOpacity(1.f);}device->Commit();}
// Blocks until the compositor has shown what was committed (the pictures are on screen before the page layer goes).
void shown(){if(ready)device->WaitForCommitCompletion();}
// Takes the pictures out of the tree; keepPage leaves the screen picture ready for the way back.
void clearUnder(bool keepPage){
    if(underLayer)underLayer->RemoveAllVisuals();if(cropVisual){cropVisual->Release();cropVisual=nullptr;}if(cropMotion){cropMotion->Release();cropMotion=nullptr;}videoPicture.release();if(videoMotion){videoMotion->Release();videoMotion=nullptr;}if(!keepPage)pagePicture.release();if(ready)device->Commit();
}
// The header layer fades with the page's fullscreen motion instead of popping.
IDCompositionEffectGroup* chromeFade{};
void fadeChrome(float from,float to,double seconds){if(!ready||!chromeLayer)return;if(!chromeFade&&FAILED(device->CreateEffectGroup(&chromeFade)))return;
    if(auto a=easeOut(from,to,seconds)){chromeFade->SetOpacity(a);a->Release();}else chromeFade->SetOpacity(to);chromeLayer->SetEffect(chromeFade);device->Commit();}
void hideChrome(){if(!ready||!chromeLayer)return;if(!chromeFade&&FAILED(device->CreateEffectGroup(&chromeFade)))return;chromeFade->SetOpacity(0.f);chromeLayer->SetEffect(chromeFade);device->Commit();}
void settleChrome(){if(ready&&chromeLayer){chromeLayer->SetEffect(nullptr);device->Commit();}}
// After the motion the effect and transform are removed, so the page draws straight to the screen again.
void settleContent(){if(!ready||!contentLayer)return;contentLayer->SetEffect(nullptr);contentLayer->SetTransform(static_cast<IDCompositionTransform*>(nullptr));device->Commit();}
// Windows' own "Text size" setting (Accessibility) enlarges web content in ordinary hosting; visual hosting sets the
// rasterization scale itself, so it has to include that factor too or text comes out smaller than before.
double textScaleFactor(){DWORD value=100,size=sizeof(value);if(RegGetValueW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Accessibility",L"TextScaleFactor",RRF_RT_REG_DWORD,nullptr,&value,&size)!=ERROR_SUCCESS)value=100;return std::clamp<DWORD>(value,100,225)/100.0;}
void applyScale(ICoreWebView2Controller* c){
    ICoreWebView2Controller3* c3{};if(!c||FAILED(c->QueryInterface(__uuidof(ICoreWebView2Controller3),reinterpret_cast<void**>(&c3)))||!c3)return;
    using Dpi=UINT(WINAPI*)(HWND);static auto dpi=reinterpret_cast<Dpi>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));
    auto h1=c3->put_ShouldDetectMonitorScaleChanges(FALSE),h2=c3->put_BoundsMode(COREWEBVIEW2_BOUNDS_MODE_USE_RAW_PIXELS),h3=c3->put_RasterizationScale((dpi?dpi(windowHandle)/96.0:1.0)*textScaleFactor());double scale{};c3->get_RasterizationScale(&scale);
    (void)h1;(void)h2;(void)h3;(void)scale;c3->Release();
}
void applyScaleToAll(){for(auto& [c,v]:views)applyScale(c);}
ICoreWebView2CompositionController* forController(ICoreWebView2Controller* c){auto it=views.find(c);return it==views.end()?nullptr:it->second.composition;}
// Creates a controller through visual hosting when available and hands it to the ordinary completion handler.
void createController(ICoreWebView2Environment* env,ICoreWebView2CreateCoreWebView2ControllerCompletedHandler* done,bool header=false){
    ICoreWebView2Environment3* env3{};
    if(!init()||FAILED(env->QueryInterface(__uuidof(ICoreWebView2Environment3),reinterpret_cast<void**>(&env3)))||!env3){if(header)return;env->CreateCoreWebView2Controller(windowHandle,done);return;}
    done->AddRef();
    auto created=callback<ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler,HRESULT,ICoreWebView2CompositionController*>([done,header](HRESULT hr,ICoreWebView2CompositionController* cc){
        ICoreWebView2Controller* c{};
        if(SUCCEEDED(hr)&&cc&&SUCCEEDED(cc->QueryInterface(__uuidof(ICoreWebView2Controller),reinterpret_cast<void**>(&c)))){
            IDCompositionVisual* visual{};device->CreateVisual(&visual);(header?chromeLayer:contentLayer)->AddVisual(visual,TRUE,nullptr);cc->put_RootVisualTarget(visual);device->Commit();
            cc->AddRef();views[c]={cc,visual};applyScale(c);
            EventRegistrationToken token;auto cursor=callback<ICoreWebView2CursorChangedEventHandler,ICoreWebView2CompositionController*,IUnknown*>([](ICoreWebView2CompositionController* sender,IUnknown*){
                if(forController(pointerTarget?pointerTarget:controller)==sender){HCURSOR h{};sender->get_Cursor(&h);POINT p;GetCursorPos(&p);if(WindowFromPoint(p)==windowHandle)SetCursor(h);}return S_OK;});
            cc->add_CursorChanged(cursor,&token);cursor->Release();
        }
        HRESULT result=done->Invoke(c?S_OK:(FAILED(hr)?hr:E_FAIL),c);done->Release();if(c)c->Release();return result;
    });
    env3->CreateCoreWebView2CompositionController(windowHandle,created);created->Release();env3->Release();
}
void forget(ICoreWebView2Controller* c){
    auto it=views.find(c);if(it==views.end())return;
    if(pointerTarget==c)pointerTarget=nullptr;if(capturedTarget==c)capturedTarget=nullptr;if(focusTarget==c)focusTarget=nullptr;
    if(it->second.visual){if(contentLayer)contentLayer->RemoveVisual(it->second.visual);if(chromeLayer)chromeLayer->RemoveVisual(it->second.visual);it->second.visual->Release();}
    if(it->second.composition)it->second.composition->Release();
    views.erase(it);if(device)device->Commit();
}
// The header receives the pointer where it draws something (or everywhere while a modal dialog is open).
ICoreWebView2Controller* targetAt(POINT client){
    if(chromeController&&chromeVisible){if(chromeModal)return chromeController;for(auto& r:chromeRects)if(PtInRect(&r,client))return chromeController;}
    return controller;
}
void send(ICoreWebView2Controller* c,COREWEBVIEW2_MOUSE_EVENT_KIND kind,COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS keys,UINT32 data,POINT point){
    auto cc=forController(c);if(!cc)return;
    // Input points are physical pixels relative to the view; WebView2 applies the rasterization scale itself.
    if(kind!=COREWEBVIEW2_MOUSE_EVENT_KIND_LEAVE){RECT bounds{};c->get_Bounds(&bounds);point.x-=bounds.left;point.y-=bounds.top;}
    auto hr=cc->SendMouseInput(kind,keys,data,point);
    (void)hr;
}
// Forwards a mouse message from the host window to the view under the pointer. Returns false when the view is windowed.
bool forwardMouse(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp){
    if(!forController(controller))return false;
    POINT point{GET_X_LPARAM(lp),GET_Y_LPARAM(lp)};UINT32 data=0;COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS keys=COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS(GET_KEYSTATE_WPARAM(wp));
    switch(msg){
    case WM_MOUSEWHEEL:case WM_MOUSEHWHEEL:data=UINT32(GET_WHEEL_DELTA_WPARAM(wp));ScreenToClient(hwnd,&point);break;
    // Mouse side buttons step history through the host instead of the page's own back/forward.
    case WM_XBUTTONDOWN:case WM_XBUTTONDBLCLK:return true;
    case WM_XBUTTONUP:stepActive(GET_XBUTTON_WPARAM(wp)==XBUTTON1?-1:1);return true;
    case WM_MOUSELEAVE:tracking=false;if(pointerTarget&&!capturedTarget)send(pointerTarget,COREWEBVIEW2_MOUSE_EVENT_KIND_LEAVE,COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS(0),0,{0,0});pointerTarget=nullptr;return true;
    case WM_MOUSEMOVE:if(!tracking){TRACKMOUSEEVENT t{sizeof(t),TME_LEAVE,hwnd,0};TrackMouseEvent(&t);tracking=true;}break;
    }
    ICoreWebView2Controller* target=capturedTarget?capturedTarget:targetAt(point);
    if(target!=pointerTarget){if(pointerTarget&&views.count(pointerTarget))send(pointerTarget,COREWEBVIEW2_MOUSE_EVENT_KIND_LEAVE,COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS(0),0,{0,0});pointerTarget=target;}
    const bool down=msg==WM_LBUTTONDOWN||msg==WM_RBUTTONDOWN||msg==WM_MBUTTONDOWN||msg==WM_XBUTTONDOWN;
    if(down){SetCapture(hwnd);capturedTarget=target;if(focusTarget!=target){target->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);focusTarget=target;}}
    send(target,COREWEBVIEW2_MOUSE_EVENT_KIND(msg),keys,data,point);
    if((msg==WM_LBUTTONUP||msg==WM_RBUTTONUP||msg==WM_MBUTTONUP||msg==WM_XBUTTONUP)&&!(GET_KEYSTATE_WPARAM(wp)&(MK_LBUTTON|MK_RBUTTON|MK_MBUTTON|MK_XBUTTON1|MK_XBUTTON2))){capturedTarget=nullptr;ReleaseCapture();}
    return true;
}
bool setCursor(){auto cc=forController(pointerTarget?pointerTarget:controller);if(!cc)return false;HCURSOR h{};cc->get_Cursor(&h);SetCursor(h?h:LoadCursorW(nullptr,IDC_ARROW));return true;}
void shutdown(){for(auto& [c,v]:views){if(v.visual)v.visual->Release();if(v.composition)v.composition->Release();}views.clear();for(auto p:{&chromeLayer,&contentLayer,&root})if(*p){(*p)->Release();*p=nullptr;}if(target){target->Release();target=nullptr;}if(device){device->Release();device=nullptr;}ready=false;}
}
