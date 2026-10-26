from pathlib import Path
import json,sys
s=Path(sys.argv[1]).read_text(encoding='utf8');print(json.dumps({"avatar_card":"accountStatsRequest" in s,"animated_lamps":"transition:transform 240ms cubic-bezier" in s,"aligned_home":"top:50%;height:32px;width:64px" in s,"first_frame_gate":"requestVideoFrameCallback(shown)" in s,"native_curtain":"controller->put_IsVisible(FALSE)" in s,"ready_handshake":"surface-ready" in s},sort_keys=True))
