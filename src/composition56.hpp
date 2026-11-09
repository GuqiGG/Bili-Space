#pragma once
// Visual hosting: every WebView renders into a DirectComposition visual instead of its own child window. Pages live
// in a content layer and the persistent header view in a layer above it. The host window forwards mouse input to
// the header where it draws (its reported regions) and to the visible page everywhere else.
// Win7, a failed DirectComposition start or the windowedWebView setting fall back to windowed hosting.
#include <dcomp.h>
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
bool init(){
    if(ready)return true;if(failed)return false;
#ifdef BILI_LEGACY_WIN7
    failed=true;return false;
#endif
    if(config.value("windowedWebView",false)){failed=true;return false;}
    using Create=HRESULT(WINAPI*)(IUnknown*,REFIID,void**);
    auto library=LoadLibraryW(L"dcomp.dll");auto create=library?reinterpret_cast<Create>(GetProcAddress(library,"DCompositionCreateDevice2")):nullptr;
    if(!create||FAILED(create(nullptr,deviceIid,reinterpret_cast<void**>(&device)))||!device){failed=true;log("composition: unavailable, using windowed WebView");return false;}
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
    fade->SetOpacity(0.f);contentLayer->SetEffect(fade);device->Commit();return true;
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
// The header layer fades with the page's fullscreen motion instead of popping.
IDCompositionEffectGroup* chromeFade{};
void fadeChrome(float from,float to,double seconds){if(!ready||!chromeLayer)return;if(!chromeFade&&FAILED(device->CreateEffectGroup(&chromeFade)))return;
    if(auto a=easeOut(from,to,seconds)){chromeFade->SetOpacity(a);a->Release();}else chromeFade->SetOpacity(to);chromeLayer->SetEffect(chromeFade);device->Commit();}
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
