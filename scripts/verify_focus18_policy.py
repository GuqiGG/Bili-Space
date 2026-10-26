from pathlib import Path
import re,json,subprocess,sys
R=Path.cwd();source=Path(sys.argv[1]);s=source.read_text(encoding='utf8');helper=re.search(r'constexpr UINT restoreWebFocusMessage=WM_APP\+73;\nvoid restoreWebFocus\(\)\{.*?\n\}',s,re.S);cases=re.search(r'    case WM_ACTIVATE:.*?(?=    case WM_PAINT:)',s,re.S)
if not helper or not cases:
 print(json.dumps({'installed':False,'activationRestoresWebFocus':False,'nativeFocusRestoresWebFocus':False}));sys.exit(0)
cpp=r'''
#include <iostream>
#include <string>
using UINT=unsigned;using WPARAM=unsigned long long;using HWND=int;using HRESULT=int;
constexpr UINT WM_APP=0x8000,WM_ACTIVATE=6,WM_SETFOCUS=7,WA_INACTIVE=0;
constexpr int COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC=0;
unsigned LOWORD(WPARAM v){return v&65535;}unsigned HIWORD(WPARAM v){return (v>>16)&65535;}
int hwnd=1,windowHandle=1,foreground=1,moves=0,posted=0,lastReason=-1;bool visible=true,iconic=false,closePending=false,testing=false;
struct Controller{HRESULT MoveFocus(int reason){++moves;lastReason=reason;return 0;}}instance,*controller=&instance;
int GetForegroundWindow(){return foreground;}bool IsWindowVisible(int){return visible;}bool IsIconic(int){return iconic;}
void log(std::string){}void PostMessageW(int,UINT,WPARAM,int){++posted;}
HELPER
int dispatch(UINT msg,WPARAM wp=0){switch(msg){CASES default:break;}return 0;}
int main(){int checks=0;auto check=[&](bool condition,const char* label){if(!condition){std::cerr<<label<<" failed\n";std::exit(1);}++checks;};
restoreWebFocus();check(moves==1&&lastReason==COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC,"foreground restores programmatically");
foreground=2;restoreWebFocus();check(moves==1,"background never steals focus");foreground=1;
visible=false;restoreWebFocus();check(moves==1,"hidden guard");visible=true;
iconic=true;restoreWebFocus();check(moves==1,"minimized guard");iconic=false;
closePending=true;restoreWebFocus();check(moves==1,"closing guard");closePending=false;
controller=nullptr;restoreWebFocus();check(moves==1,"initialization guard");controller=&instance;
dispatch(WM_ACTIVATE,0);check(posted==0,"deactivation ignored");dispatch(WM_ACTIVATE,(1ull<<16)|1);check(posted==0,"minimized activation ignored");
dispatch(WM_ACTIVATE,1);check(posted==1&&moves==1,"activation defers focus until queue");dispatch(restoreWebFocusMessage);check(moves==2,"activation queued restore");
dispatch(WM_SETFOCUS);check(posted==2,"native focus queues restore");dispatch(restoreWebFocusMessage);check(moves==3,"native focus restore");
std::cout<<"{\"installed\":true,\"activationRestoresWebFocus\":true,\"nativeFocusRestoresWebFocus\":true,\"mockChecks\":"<<checks<<"}\n";
}
'''.replace('HELPER',helper.group()).replace('CASES',cases.group())
out=R/'verification/focus18-native-check';out.with_suffix('.cpp').write_text(cpp,encoding='utf8')
cmd=[str(R/'.tools/zig/zig-windows-x86_64-0.13.0/zig.exe'),'c++',str(out.with_suffix('.cpp')),'-std=c++20','-target','x86_64-windows-gnu','-O1','-o',str(out.with_suffix('.exe'))]
b=subprocess.run(cmd,capture_output=True,text=True)
if b.returncode:print(b.stdout,b.stderr);sys.exit(b.returncode)
r=subprocess.run([str(out.with_suffix('.exe'))],capture_output=True,text=True);print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr);sys.exit(r.returncode)
