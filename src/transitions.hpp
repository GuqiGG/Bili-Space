#pragma once
#include <wincodec.h>

// Snapshots stay in memory. Navigation/history is never cancelled or replayed.
namespace transitions {
HWND plate{};void cover();void uncover();void resizePlate();
std::string cached,oldImage;HBITMAP bitmap{};UINT64 epoch=0;int index=0,forced=-1;bool active=false,hold=false,reduced=false,capturing=false;std::wstring target;UINT64 localSerial=0x100000000ULL;std::string localTicket;
bool video(const std::wstring& uri){static const std::wregex re(LR"(^https://[^/]+/(?:zh-Hans/|zh-Hant/|en/)?(?:video|bangumi|list|cheese)(?:/|\?|$))",std::regex::icase);return std::regex_search(uri,re);}
std::string encoded(const std::vector<BYTE>& bytes){DWORD n{};CryptBinaryToStringA(bytes.data(),DWORD(bytes.size()),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&n);std::string out(n,'\0');if(!CryptBinaryToStringA(bytes.data(),DWORD(bytes.size()),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,out.data(),&n))return {};while(!out.empty()&&out.back()=='\0')out.pop_back();return "data:image/png;base64,"+out;}
void decode(IStream* stream){
 LARGE_INTEGER zero{};stream->Seek(zero,STREAM_SEEK_SET,nullptr);IWICImagingFactory* factory{};IWICBitmapDecoder* decoder{};IWICBitmapFrameDecode* frame{};IWICFormatConverter* converter{};
 if(SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,__uuidof(IWICImagingFactory),reinterpret_cast<void**>(&factory)))){
  if(SUCCEEDED(factory->CreateDecoderFromStream(stream,nullptr,WICDecodeMetadataCacheOnLoad,&decoder))&&SUCCEEDED(decoder->GetFrame(0,&frame))&&SUCCEEDED(factory->CreateFormatConverter(&converter))&&SUCCEEDED(converter->Initialize(frame,GUID_WICPixelFormat32bppBGRA,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom))){
   UINT w{},h{};converter->GetSize(&w,&h);if(w&&h&&w<=8192&&h<=8192){BITMAPINFO info{};info.bmiHeader={sizeof(BITMAPINFOHEADER),LONG(w),-LONG(h),1,32,BI_RGB};void* pixels{};auto next=CreateDIBSection(nullptr,&info,DIB_RGB_COLORS,&pixels,nullptr,0);if(next&&SUCCEEDED(converter->CopyPixels(nullptr,w*4,w*h*4,static_cast<BYTE*>(pixels)))){if(bitmap)DeleteObject(bitmap);bitmap=next;}else if(next)DeleteObject(next);}
  }
 }
 if(converter)converter->Release();if(frame)frame->Release();if(decoder)decoder->Release();if(factory)factory->Release();
}
void capture(std::function<void(std::string,IStream*)> done){
 if(!webview||capturing){done({},nullptr);return;}IStream* stream{};if(FAILED(CreateStreamOnHGlobal(nullptr,TRUE,&stream))){done({},nullptr);return;}capturing=true;
 auto h=callback<ICoreWebView2CapturePreviewCompletedHandler,HRESULT>([stream,done](HRESULT hr){capturing=false;std::string data;if(SUCCEEDED(hr)){STATSTG stat{};if(SUCCEEDED(stream->Stat(&stat,STATFLAG_NONAME))&&stat.cbSize.QuadPart>0&&stat.cbSize.QuadPart<24*1024*1024){LARGE_INTEGER zero{};stream->Seek(zero,STREAM_SEEK_SET,nullptr);std::vector<BYTE> bytes(size_t(stat.cbSize.QuadPart));ULONG n{};if(SUCCEEDED(stream->Read(bytes.data(),ULONG(bytes.size()),&n))&&n==bytes.size())data=encoded(bytes);}}done(std::move(data),stream);stream->Release();return S_OK;});
 auto hr=webview->CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,stream,h);h->Release();if(FAILED(hr)){capturing=false;stream->Release();done({},nullptr);}
}
void cancel(){uncover();active=hold=false;oldImage.clear();if(controller)controller->put_IsVisible(TRUE);InvalidateRect(windowHandle,nullptr,FALSE);}
void begin(const std::wstring& uri,UINT64 id){
 if(id==epoch){if(video(uri))cancel();target=uri;return;}epoch=id;target=uri;
 if(video(uri)||reduced||cached.empty()||!bitmap){cancel();return;}
 active=hold=true;oldImage=cached;BYTE choice{};do{BCryptGenRandom(nullptr,&choice,1,BCRYPT_USE_SYSTEM_PREFERRED_RNG);}while(choice>=252);index=forced>=0?forced:choice%12;forced=-1;if(testing)log("transition begin "+std::to_string(epoch)+" recipe "+std::to_string(index+1));
 cover();InvalidateRect(windowHandle,nullptr,FALSE);
}
bool paint(HWND hwnd){if(!hold||!bitmap)return false;PAINTSTRUCT ps{};auto dc=BeginPaint(hwnd,&ps);RECT r{};GetClientRect(hwnd,&r);BITMAP b{};GetObjectW(bitmap,sizeof(b),&b);auto memory=CreateCompatibleDC(dc);auto previous=SelectObject(memory,bitmap);SetStretchBltMode(dc,HALFTONE);StretchBlt(dc,0,0,r.right,r.bottom,memory,0,0,b.bmWidth,b.bmHeight,SRCCOPY);SelectObject(memory,previous);DeleteDC(memory);EndPaint(hwnd,&ps);return true;}
LRESULT CALLBACK plateProc(HWND hwnd,UINT message,WPARAM w,LPARAM l){if(message==WM_NCHITTEST)return HTTRANSPARENT;if(message==WM_ERASEBKGND)return 1;if(message==WM_PAINT){paint(hwnd);return 0;}return DefWindowProcW(hwnd,message,w,l);}
void resizePlate(){if(!plate||!hold)return;RECT r{};GetClientRect(windowHandle,&r);SetWindowPos(plate,HWND_TOP,0,0,r.right,r.bottom,SWP_SHOWWINDOW|SWP_NOACTIVATE);InvalidateRect(plate,nullptr,FALSE);}
void cover(){if(!plate){WNDCLASSW c{};c.lpfnWndProc=plateProc;c.hInstance=GetModuleHandleW(nullptr);c.lpszClassName=L"BiliTransitionPlate";RegisterClassW(&c);plate=CreateWindowExW(WS_EX_NOACTIVATE|WS_EX_TRANSPARENT,c.lpszClassName,L"",WS_CHILD|WS_VISIBLE,0,0,1,1,windowHandle,nullptr,c.hInstance,nullptr);}resizePlate();UpdateWindow(plate);}
void uncover(){if(plate)ShowWindow(plate,SW_HIDE);}
void message(const json& m){
 auto a=m.value("action",std::string{});if(testing&&a!="snapshot"&&a!="inspect")log("transition message "+a+" id "+m.value("id",std::string{}));
 if(testing&&a=="force"){auto n=m.value("index",-1);if(n>=0&&n<12)forced=n;return;}
 if(testing&&a=="inspect"){execute("window.__transitionNative="+json{{"cached",!cached.empty()},{"bitmap",bitmap!=nullptr},{"active",active},{"hold",hold},{"capturing",capturing},{"index",index}}.dump());return;}
 if(a=="local-begin"){
  auto token=m.value("token",std::string{});if(token.size()>80)return;localTicket=token;auto uri=wide(m.value("url",std::string{}));reduced=m.value("reduced",false);
  capture([token,uri](std::string data,IStream* stream){if(token!=localTicket)return;if(data.empty()||reduced){cancel();execute("window.TransitionManager?.commitLocal("+json{{"localToken",token}}.dump()+")");return;}cached=data;decode(stream);begin(uri,++localSerial);if(!active){execute("window.TransitionManager?.commitLocal("+json{{"localToken",token}}.dump()+")");return;}execute("window.TransitionManager?.accept("+json{{"id",std::to_string(epoch)},{"index",index},{"old",oldImage},{"localToken",token}}.dump()+")");});return;
 }
 if(a=="snapshot"){reduced=m.value("reduced",false);if(active||reduced)return;const auto owner=epoch;capture([owner](std::string data,IStream* stream){if(owner!=epoch||active||data.empty())return;cached=std::move(data);decode(stream);});return;}
 if(a=="arrive"){if(active&&!video(target))execute("window.TransitionManager?.accept("+json{{"id",std::to_string(epoch)},{"index",index},{"old",oldImage}}.dump()+")");return;}
 if(!active||m.value("id",std::string{})!=std::to_string(epoch))return;
 if(a=="attached"){hold=false;uncover();if(controller)controller->put_IsVisible(TRUE);}
 else if(a=="ready"){hold=true;cover();InvalidateRect(windowHandle,nullptr,FALSE);execute("window.TransitionManager?.prepareSnapshot()");}
 else if(a=="capture-new"){if(capturing){execute("setTimeout(()=>window.TransitionManager?.prepareSnapshot(),24)");return;}const auto owner=epoch;capture([owner](std::string data,IStream*){if(!active||epoch!=owner)return;if(data.empty()){cancel();execute("window.TransitionManager?.cancel()");return;}execute("window.TransitionManager?.present("+json{{"id",std::to_string(owner)},{"image",data}}.dump()+")");});}
 else if(a=="done"||a=="cancel"){cancel();}
}
void shutdown(){if(plate){DestroyWindow(plate);plate=nullptr;}if(bitmap){DeleteObject(bitmap);bitmap=nullptr;}cached.clear();oldImage.clear();}
}
