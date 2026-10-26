from pathlib import Path
import sys,json
s=Path(sys.argv[1]).read_text(encoding="utf-8")
print(json.dumps({"close_to_tray":"if(trayReady&&!testing){ShowWindow(hwnd,SW_HIDE)" in s,"double_click_restore":"lp==WM_LBUTTONDBLCLK" in s,"explicit_exit":"selected==3)DestroyWindow" in s,"explorer_restart":"msg==taskbarCreated" in s,"cleanup":"Shell_NotifyIconW(NIM_DELETE" in s,"single_instance":"FindWindowW(L\"BetterBiliSpace\"" in s}))
