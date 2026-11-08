#pragma once
// Visual hosting: every WebView renders into a DirectComposition visual instead of its own child window, so views can
// later be layered (a persistent header above the page). Mouse input and the cursor are forwarded by the host window.
// Win7, a failed DirectComposition start or the windowedWebView setting fall back to ordinary windowed hosting.
#include <dcomp.h>
namespace comp{
// IID_IDCompositionDevice; the MinGW header declares the interface without its GUID.
constexpr GUID deviceIid{0xC37EA93A,0xE7AA,0x450D,{0xB1,0x6F,0x97,0x46,0xCB,0x04,0x07,0xF3}};
struct View{ICoreWebView2CompositionController* composition{};IDCompositionVisual* visual{};};
IDCompositionDevice* device{};IDCompositionTarget* target{};IDCompositionVisual* root{};bool ready=false,failed=false,tracking=false;
std::map<ICoreWebView2Controller*,View> views;
bool init(){
    if(ready)return true;if(failed)return false;
#ifdef BILI_LEGACY_WIN7
    failed=true;return false;
#endif
    if(config.value("windowedWebView",false)){failed=true;return false;}
    using Create=HRESULT(WINAPI*)(IUnknown*,REFIID,void**);
    auto library=LoadLibraryW(L"dcomp.dll");auto create=library?reinterpret_cast<Create>(GetProcAddress(library,"DCompositionCreateDevice2")):nullptr;
    if(!create||FAILED(create(nullptr,deviceIid,reinterpret_cast<void**>(&device)))||!device){failed=true;log("composition: unavailable, using windowed WebView");return false;}
    if(FAILED(device->CreateTargetForHwnd(windowHandle,TRUE,&target))||FAILED(device->CreateVisual(&root))||FAILED(target->SetRoot(root))){failed=true;log("composition: target failed, using windowed WebView");return false;}
    device->Commit();ready=true;log("composition: visual hosting ready");return true;
}
ICoreWebView2CompositionController* forController(ICoreWebView2Controller* c){auto it=views.find(c);return it==views.end()?nullptr:it->second.composition;}
// Creates a controller through visual hosting when available and hands it to the ordinary completion handler.
void createController(ICoreWebView2Environment* env,ICoreWebView2CreateCoreWebView2ControllerCompletedHandler* done){
    ICoreWebView2Environment3* env3{};
    if(!init()||FAILED(env->QueryInterface(__uuidof(ICoreWebView2Environment3),reinterpret_cast<void**>(&env3)))||!env3){env->CreateCoreWebView2Controller(windowHandle,done);return;}
    done->AddRef();
    auto created=callback<ICoreWebView2CreateCoreWebView2CompositionControllerCompletedHandler,HRESULT,ICoreWebView2CompositionController*>([done](HRESULT hr,ICoreWebView2CompositionController* cc){
        ICoreWebView2Controller* c{};
        if(SUCCEEDED(hr)&&cc&&SUCCEEDED(cc->QueryInterface(__uuidof(ICoreWebView2Controller),reinterpret_cast<void**>(&c)))){
            IDCompositionVisual* visual{};device->CreateVisual(&visual);root->AddVisual(visual,TRUE,nullptr);cc->put_RootVisualTarget(visual);device->Commit();
            cc->AddRef();views[c]={cc,visual};
            EventRegistrationToken token;auto cursor=callback<ICoreWebView2CursorChangedEventHandler,ICoreWebView2CompositionController*,IUnknown*>([](ICoreWebView2CompositionController* sender,IUnknown*){
                if(forController(controller)==sender){HCURSOR h{};sender->get_Cursor(&h);POINT p;GetCursorPos(&p);if(WindowFromPoint(p)==windowHandle)SetCursor(h);}return S_OK;});
            cc->add_CursorChanged(cursor,&token);cursor->Release();
        }
        HRESULT result=done->Invoke(c?S_OK:(FAILED(hr)?hr:E_FAIL),c);done->Release();if(c)c->Release();return result;
    });
    env3->CreateCoreWebView2CompositionController(windowHandle,created);created->Release();env3->Release();
}
void forget(ICoreWebView2Controller* c){
    auto it=views.find(c);if(it==views.end())return;
    if(root&&it->second.visual)root->RemoveVisual(it->second.visual);if(it->second.visual)it->second.visual->Release();if(it->second.composition)it->second.composition->Release();
    views.erase(it);if(device)device->Commit();
}
// Forwards a mouse message from the host window to the visible view. Returns false when the view is windowed.
bool forwardMouse(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp){
    auto cc=forController(controller);if(!cc)return false;
    POINT point{GET_X_LPARAM(lp),GET_Y_LPARAM(lp)};UINT32 data=0;COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS keys=COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS(GET_KEYSTATE_WPARAM(wp));
    switch(msg){
    case WM_MOUSEWHEEL:case WM_MOUSEHWHEEL:data=UINT32(GET_WHEEL_DELTA_WPARAM(wp));ScreenToClient(hwnd,&point);break;
    case WM_XBUTTONDOWN:case WM_XBUTTONUP:case WM_XBUTTONDBLCLK:data=GET_XBUTTON_WPARAM(wp);break;
    case WM_MOUSELEAVE:tracking=false;keys=COREWEBVIEW2_MOUSE_EVENT_VIRTUAL_KEYS(0);point={0,0};break;
    case WM_MOUSEMOVE:if(!tracking){TRACKMOUSEEVENT t{sizeof(t),TME_LEAVE,hwnd,0};TrackMouseEvent(&t);tracking=true;}break;
    }
    if(msg==WM_LBUTTONDOWN||msg==WM_RBUTTONDOWN||msg==WM_MBUTTONDOWN||msg==WM_XBUTTONDOWN)SetCapture(hwnd);
    if((msg==WM_LBUTTONUP||msg==WM_RBUTTONUP||msg==WM_MBUTTONUP||msg==WM_XBUTTONUP)&&!(GET_KEYSTATE_WPARAM(wp)&(MK_LBUTTON|MK_RBUTTON|MK_MBUTTON|MK_XBUTTON1|MK_XBUTTON2)))ReleaseCapture();
    if(msg!=WM_MOUSELEAVE){RECT bounds{};controller->get_Bounds(&bounds);point.x-=bounds.left;point.y-=bounds.top;}
    cc->SendMouseInput(COREWEBVIEW2_MOUSE_EVENT_KIND(msg),keys,data,point);return true;
}
bool setCursor(){auto cc=forController(controller);if(!cc)return false;HCURSOR h{};cc->get_Cursor(&h);SetCursor(h?h:LoadCursorW(nullptr,IDC_ARROW));return true;}
void shutdown(){for(auto& [c,v]:views){if(v.visual)v.visual->Release();if(v.composition)v.composition->Release();}views.clear();if(root){root->Release();root=nullptr;}if(target){target->Release();target=nullptr;}if(device){device->Release();device=nullptr;}ready=false;}
}
