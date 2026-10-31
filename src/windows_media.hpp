#pragma once
// Native desktop SMTC + taskbar toolbar. Include after the application's JSON/Win32 headers.
#include <shobjidl.h>
#include <windows.media.h>
#include <systemmediatransportcontrolsinterop.h>
#include <roapi.h>
#include <winstring.h>
#include <atomic>
#include <functional>
#include <array>

namespace bili_windows_media {
using namespace ABI::Windows::Media;
using Handler=ABI::Windows::Foundation::ITypedEventHandler<SystemMediaTransportControls*,SystemMediaTransportControlsButtonPressedEventArgs*>;
constexpr UINT commandMessage=WM_APP+160;
constexpr UINT previousButton=45001,toggleButton=45002,nextButton=45003;
template<class T>struct Com {T* p{};Com()=default;Com(const Com&)=delete;Com& operator=(const Com&)=delete;~Com(){reset();}void reset(){if(p){p->Release();p=nullptr;}}T** out(){reset();return &p;}T* operator->()const{return p;}explicit operator bool()const{return p!=nullptr;}};
// The bundled MinGW SDK forward-declares these ABI interfaces but omits their methods.
// Method order follows Microsoft's Windows metadata (windows-rs Windows/Media and Storage/Streams).
struct VideoPropertiesAbi:IInspectable {
 virtual HRESULT STDMETHODCALLTYPE get_Title(HSTRING*)=0;virtual HRESULT STDMETHODCALLTYPE put_Title(HSTRING)=0;
 virtual HRESULT STDMETHODCALLTYPE get_Subtitle(HSTRING*)=0;virtual HRESULT STDMETHODCALLTYPE put_Subtitle(HSTRING)=0;
};
struct StreamReferenceStaticsAbi:IInspectable {
 virtual HRESULT STDMETHODCALLTYPE CreateFromFile(IInspectable*,IInspectable**)=0;
 virtual HRESULT STDMETHODCALLTYPE CreateFromUri(ABI::Windows::Foundation::IUriRuntimeClass*,ABI::Windows::Storage::Streams::IRandomAccessStreamReference**)=0;
 virtual HRESULT STDMETHODCALLTYPE CreateFromStream(IInspectable*,IInspectable**)=0;
};
constexpr GUID streamStaticsIid{0x857309dc,0x3fbf,0x4e7d,{0x98,0x6f,0xef,0x3b,0x1a,0x07,0xa9,0x64}};
// These interfaces may be included before main's MinGW MIDL_INTERFACE remapping.
// Explicit ABI IIDs avoid depending on compiler uuid attributes on system types.
constexpr GUID agileObjectIid{0x94ea2b94,0xe9cc,0x49e0,{0xc0,0xff,0xee,0x64,0xca,0x8f,0x5b,0x90}};
constexpr GUID taskbarList3Iid{0xea1afb91,0x9e28,0x4b86,{0x90,0xe9,0x9e,0x9f,0x8a,0x5e,0xef,0xaf}};
struct State {bool active=false,paused=true,previous=false,next=false;std::string title,artist,artwork;};
inline std::string boundedText(const nlohmann::json& j,const char* name,size_t limit){
 auto i=j.find(name);if(i==j.end()||!i->is_string())return {};auto text=i->get<std::string>();if(text.size()>limit)return {};
 for(auto& c:text)if(static_cast<unsigned char>(c)<32)c=' ';return text;
}
inline bool boolField(const nlohmann::json& j,const char* key,bool fallback=false){auto i=j.find(key);return i!=j.end()&&i->is_boolean()?i->get<bool>():fallback;}
inline bool artworkAllowed(const std::string& url){
 if(url.empty())return true;if(url.size()>2048||url.find_first_of("\r\n\t\\")!=std::string::npos)return false;
 // No credentials, ports, local files, arbitrary hosts or script URLs are passed to the shell.
 static const std::regex safe(R"(^https://[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:hdslb\.com|biliimg\.com)/[^\s]*$)");return std::regex_match(url,safe);
}
inline State parse(const nlohmann::json& value){
 State s;if(!value.is_object())return s;s.title=boundedText(value,"title",600);s.artist=boundedText(value,"artist",300);
 s.active=boolField(value,"active",!s.title.empty());s.paused=boolField(value,"paused",true);s.previous=s.active&&boolField(value,"canPrevious");s.next=s.active&&boolField(value,"canNext");
 auto art=boundedText(value,"artwork",2048);if(artworkAllowed(art))s.artwork=art;if(!s.active){s.title.clear();s.artist.clear();s.artwork.clear();s.paused=true;}return s;
}
inline std::wstring utf16(const std::string& text){if(text.empty())return {};int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),int(text.size()),nullptr,0);if(n<=0)return {};std::wstring out(n,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),int(text.size()),out.data(),n);return out;}
struct ButtonHandler final:Handler {
 std::atomic<ULONG> refs{1};std::atomic<HWND> window;
 explicit ButtonHandler(HWND h):window(h){}
 HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out)override{if(!out)return E_POINTER;*out=nullptr;if(id==IID_IUnknown||id==__uuidof(Handler)||id==agileObjectIid){*out=static_cast<Handler*>(this);AddRef();return S_OK;}return E_NOINTERFACE;}
 ULONG STDMETHODCALLTYPE AddRef()override{return ++refs;}ULONG STDMETHODCALLTYPE Release()override{auto n=--refs;if(!n)delete this;return n;}
 HRESULT STDMETHODCALLTYPE Invoke(ISystemMediaTransportControls*,ISystemMediaTransportControlsButtonPressedEventArgs* args)override{
  try{if(!args)return E_POINTER;SystemMediaTransportControlsButton b{};if(FAILED(args->get_Button(&b)))return S_OK;HWND h=window.load();DWORD pid{};
   if(h&&GetWindowThreadProcessId(h,&pid)&&pid==GetCurrentProcessId())PostMessageW(h,commandMessage,WPARAM(b),0);return S_OK;
  }catch(...){return E_FAIL;}
 }
};
class Service {
 HWND window{};DWORD thread{};std::function<void(const std::string&)> sink;State current;Com<ITaskbarList3> taskbar;bool buttonsAdded=false;
 std::array<HICON,4> icons{};Com<ISystemMediaTransportControls> smtc;Com<ISystemMediaTransportControlsDisplayUpdater> display;
 ButtonHandler* handler{};EventRegistrationToken buttonToken{};bool subscribed=false,roBalanced=false;HMODULE combase{};HRESULT lastResult=E_PENDING;
 using Init=HRESULT(WINAPI*)(RO_INIT_TYPE);using Uninit=void(WINAPI*)();using Create=HRESULT(WINAPI*)(PCNZWCH,UINT32,HSTRING*);using Delete=HRESULT(WINAPI*)(HSTRING);using Activate=HRESULT(WINAPI*)(HSTRING,REFIID,void**);
 Init roInit{};Uninit roUninit{};Create createString{};Delete deleteString{};Activate activate{};
 UINT buttonCreated=RegisterWindowMessageW(L"TaskbarButtonCreated"),explorerCreated=RegisterWindowMessageW(L"TaskbarCreated");
 struct String {Service& owner;HSTRING value{};String(Service& s,const std::wstring& text):owner(s){if(owner.createString)owner.createString(text.data(),UINT32(text.size()),&value);}~String(){if(value&&owner.deleteString)owner.deleteString(value);}};
 HICON makeIcon(int kind){
  BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);info.bmiHeader.biWidth=24;info.bmiHeader.biHeight=-24;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;void* pixels{};HDC dc=CreateCompatibleDC(nullptr);HBITMAP image=CreateDIBSection(dc,&info,DIB_RGB_COLORS,&pixels,nullptr,0);if(!dc||!image||!pixels){if(image)DeleteObject(image);if(dc)DeleteDC(dc);return nullptr;}memset(pixels,0,24*24*4);auto old=SelectObject(dc,image);auto brush=CreateSolidBrush(RGB(128,128,128));auto previousBrush=SelectObject(dc,brush);auto previousPen=SelectObject(dc,GetStockObject(NULL_PEN));
  if(kind==0){POINT p[]={{17,5},{7,12},{17,19}};Polygon(dc,p,3);Rectangle(dc,5,5,8,20);}else if(kind==1){POINT p[]={{7,5},{17,12},{7,19}};Polygon(dc,p,3);Rectangle(dc,17,5,20,20);}else if(kind==2){POINT p[]={{7,4},{19,12},{7,20}};Polygon(dc,p,3);}else{Rectangle(dc,6,4,10,21);Rectangle(dc,14,4,18,21);}
  SelectObject(dc,previousPen);SelectObject(dc,previousBrush);SelectObject(dc,old);DeleteObject(brush);DeleteDC(dc);auto* rgba=static_cast<DWORD*>(pixels);for(int i=0;i<24*24;i++)if(rgba[i]&0xffffff)rgba[i]|=0xff000000;
  HBITMAP mask=CreateBitmap(24,24,1,1,nullptr);ICONINFO icon{TRUE,0,0,mask,image};HICON result=mask?CreateIconIndirect(&icon):nullptr;if(mask)DeleteObject(mask);DeleteObject(image);return result;
 }
 void createTaskbar(){taskbar.reset();buttonsAdded=false;if(SUCCEEDED(CoCreateInstance(CLSID_TaskbarList,nullptr,CLSCTX_INPROC_SERVER,taskbarList3Iid,reinterpret_cast<void**>(taskbar.out())))){if(FAILED(taskbar->HrInit()))taskbar.reset();}}
 std::array<THUMBBUTTON,3> buttons(){
  std::array<THUMBBUTTON,3> b{};const UINT ids[]={previousButton,toggleButton,nextButton};const wchar_t* text[]={L"上一集",current.paused?L"播放":L"暂停",L"下一集"};const bool enabled[]={current.previous,current.active,current.next};
  for(int i=0;i<3;i++){b[i].dwMask=THB_ICON|THB_TOOLTIP|THB_FLAGS;b[i].iId=ids[i];b[i].hIcon=icons[i==0?0:i==2?1:current.paused?2:3];b[i].dwFlags=enabled[i]?THBF_ENABLED:THBF_DISABLED;lstrcpynW(b[i].szTip,text[i],260);}return b;
 }
 void updateButtons(){if(taskbar&&buttonsAdded){auto b=buttons();taskbar->ThumbBarUpdateButtons(window,UINT(b.size()),b.data());}}
 void initializeSmtc(){
  combase=LoadLibraryW(L"combase.dll");if(!combase){lastResult=HRESULT_FROM_WIN32(GetLastError());return;}
  roInit=reinterpret_cast<Init>(GetProcAddress(combase,"RoInitialize"));roUninit=reinterpret_cast<Uninit>(GetProcAddress(combase,"RoUninitialize"));createString=reinterpret_cast<Create>(GetProcAddress(combase,"WindowsCreateString"));deleteString=reinterpret_cast<Delete>(GetProcAddress(combase,"WindowsDeleteString"));activate=reinterpret_cast<Activate>(GetProcAddress(combase,"RoGetActivationFactory"));if(!roInit||!roUninit||!createString||!deleteString||!activate){lastResult=E_NOTIMPL;return;}
  lastResult=roInit(RO_INIT_SINGLETHREADED);if(FAILED(lastResult))return;roBalanced=true;Com<ISystemMediaTransportControlsInterop> factory;String name(*this,L"Windows.Media.SystemMediaTransportControls");lastResult=activate(name.value,__uuidof(ISystemMediaTransportControlsInterop),reinterpret_cast<void**>(factory.out()));if(FAILED(lastResult))return;
  lastResult=factory->GetForWindow(window,__uuidof(ISystemMediaTransportControls),reinterpret_cast<void**>(smtc.out()));if(FAILED(lastResult))return;
  lastResult=smtc->get_DisplayUpdater(display.out());if(FAILED(lastResult)){smtc.reset();return;}handler=new ButtonHandler(window);lastResult=smtc->add_ButtonPressed(handler,&buttonToken);if(FAILED(lastResult)){handler->Release();handler=nullptr;display.reset();smtc.reset();return;}subscribed=true;smtc->put_IsEnabled(false);
 }
 void thumbnail(const std::string& url){
  if(!display)return;display->put_Thumbnail(nullptr);if(url.empty())return;Com<ABI::Windows::Foundation::IUriRuntimeClassFactory> uriFactory;String uriClass(*this,L"Windows.Foundation.Uri");if(FAILED(activate(uriClass.value,__uuidof(ABI::Windows::Foundation::IUriRuntimeClassFactory),reinterpret_cast<void**>(uriFactory.out()))))return;
  Com<ABI::Windows::Foundation::IUriRuntimeClass> uri;String address(*this,utf16(url));if(FAILED(uriFactory->CreateUri(address.value,uri.out())))return;Com<StreamReferenceStaticsAbi> streamFactory;String streamClass(*this,L"Windows.Storage.Streams.RandomAccessStreamReference");if(FAILED(activate(streamClass.value,streamStaticsIid,reinterpret_cast<void**>(streamFactory.out()))))return;
  ABI::Windows::Storage::Streams::IRandomAccessStreamReference* reference{};if(SUCCEEDED(streamFactory->CreateFromUri(uri.p,&reference))&&reference){display->put_Thumbnail(reference);reinterpret_cast<IUnknown*>(reference)->Release();}
 }
 void command(const std::string& name){if(!current.active||!sink)return;if(name=="previous"&&!current.previous)return;if(name=="next"&&!current.next)return;try{sink(name);}catch(...){} }
public:
 ~Service(){shutdown();}
 bool init(HWND h,std::function<void(const std::string&)> send){shutdown();window=h;thread=GetCurrentThreadId();sink=std::move(send);for(int i=0;i<4;i++)icons[i]=makeIcon(i);createTaskbar();initializeSmtc();return bool(smtc);}
 void accept(const nlohmann::json& input){
  if(!window||GetCurrentThreadId()!=thread)return;State next=parse(input);bool metadata=next.title!=current.title||next.artist!=current.artist||next.artwork!=current.artwork||next.active!=current.active;current=std::move(next);updateButtons();if(!smtc)return;
  smtc->put_IsEnabled(current.active);smtc->put_IsPlayEnabled(current.active);smtc->put_IsPauseEnabled(current.active);smtc->put_IsPreviousEnabled(current.previous);smtc->put_IsNextEnabled(current.next);smtc->put_PlaybackStatus(!current.active?MediaPlaybackStatus_Closed:current.paused?MediaPlaybackStatus_Paused:MediaPlaybackStatus_Playing);
  if(metadata&&display){display->ClearAll();if(current.active){display->put_Type(MediaPlaybackType_Video);IVideoDisplayProperties* raw{};if(SUCCEEDED(display->get_VideoProperties(&raw))&&raw){auto* props=reinterpret_cast<VideoPropertiesAbi*>(raw);String title(*this,utf16(current.title)),artist(*this,utf16(current.artist));props->put_Title(title.value);props->put_Subtitle(artist.value);props->Release();}thumbnail(current.artwork);}display->Update();}
 }
 bool message(UINT msg,WPARAM w,LPARAM l){
  if(!window)return false;
  if(msg==explorerCreated){createTaskbar();return false;}
  if(msg==buttonCreated){createTaskbar();if(taskbar){auto b=buttons();buttonsAdded=SUCCEEDED(taskbar->ThumbBarAddButtons(window,UINT(b.size()),b.data()));if(!buttonsAdded)buttonsAdded=SUCCEEDED(taskbar->ThumbBarUpdateButtons(window,UINT(b.size()),b.data()));}return false;}
  if(msg==commandMessage){switch(int(w)){case SystemMediaTransportControlsButton_Play:command("play");break;case SystemMediaTransportControlsButton_Pause:case SystemMediaTransportControlsButton_Stop:command("pause");break;case SystemMediaTransportControlsButton_Previous:command("previous");break;case SystemMediaTransportControlsButton_Next:command("next");break;}return true;}
  if(msg==WM_COMMAND&&HIWORD(w)==THBN_CLICKED){switch(LOWORD(w)){case previousButton:command("previous");return true;case toggleButton:command("toggle");return true;case nextButton:command("next");return true;}return false;}
  if(msg==WM_APPCOMMAND&&!smtc){switch(GET_APPCOMMAND_LPARAM(l)){case APPCOMMAND_MEDIA_PLAY_PAUSE:command("toggle");return true;case APPCOMMAND_MEDIA_PLAY:command("play");return true;case APPCOMMAND_MEDIA_PAUSE:case APPCOMMAND_MEDIA_STOP:command("pause");return true;case APPCOMMAND_MEDIA_NEXTTRACK:command("next");return true;case APPCOMMAND_MEDIA_PREVIOUSTRACK:command("previous");return true;}}return false;
 }
 nlohmann::json status()const{
  nlohmann::json out={{"smtc",bool(smtc)},{"taskbar",bool(taskbar)},{"toolbar",buttonsAdded},{"active",current.active},{"hresult",static_cast<unsigned long>(lastResult)}};
  if(smtc){MediaPlaybackStatus playback{};boolean enabled{};if(SUCCEEDED(smtc->get_PlaybackStatus(&playback)))out["nativePlaybackStatus"]=int(playback);if(SUCCEEDED(smtc->get_IsEnabled(&enabled)))out["nativeEnabled"]=bool(enabled);}
  if(display){IVideoDisplayProperties* raw{};if(SUCCEEDED(display->get_VideoProperties(&raw))&&raw){auto* props=reinterpret_cast<VideoPropertiesAbi*>(raw);HSTRING title{};if(SUCCEEDED(props->get_Title(&title))&&title){using Raw=PCWSTR(WINAPI*)(HSTRING,UINT32*);auto getRaw=reinterpret_cast<Raw>(GetProcAddress(combase,"WindowsGetStringRawBuffer"));if(getRaw){UINT32 n{};auto w=getRaw(title,&n);int count=WideCharToMultiByte(CP_UTF8,0,w,int(n),nullptr,0,nullptr,nullptr);std::string text(count,0);if(count)WideCharToMultiByte(CP_UTF8,0,w,int(n),text.data(),count,nullptr,nullptr);out["nativeTitle"]=text;}deleteString(title);}props->Release();}}
  return out;
 }
 void shutdown(){if(taskbar&&buttonsAdded){auto disabled=buttons();for(auto& b:disabled)b.dwFlags=THBF_DISABLED|THBF_HIDDEN;taskbar->ThumbBarUpdateButtons(window,UINT(disabled.size()),disabled.data());}if(handler)handler->window.store(nullptr);if(smtc){smtc->put_IsEnabled(false);if(subscribed)smtc->remove_ButtonPressed(buttonToken);}subscribed=false;display.reset();smtc.reset();if(handler){handler->Release();handler=nullptr;}taskbar.reset();buttonsAdded=false;for(auto& icon:icons){if(icon)DestroyIcon(icon);icon=nullptr;}if(roBalanced&&roUninit)roUninit();roBalanced=false;if(combase)FreeLibrary(combase);combase=nullptr;window=nullptr;thread=0;sink={};current={};}
#ifdef BILI_WINDOWS_MEDIA_TEST
 HRESULT testSmtcButton(ISystemMediaTransportControlsButtonPressedEventArgs* args){return handler?handler->Invoke(nullptr,args):E_NOTIMPL;}
#endif
};
inline Service service;
}
inline bool windowsMediaInit(HWND hwnd,std::function<void(const std::string&)> send){return bili_windows_media::service.init(hwnd,std::move(send));}
inline void windowsMediaAccept(const nlohmann::json& state){bili_windows_media::service.accept(state);}
inline bool windowsMediaMessage(UINT msg,WPARAM w,LPARAM l){return bili_windows_media::service.message(msg,w,l);}
inline void windowsMediaShutdown(){bili_windows_media::service.shutdown();}
inline nlohmann::json windowsMediaStatus(){return bili_windows_media::service.status();}
