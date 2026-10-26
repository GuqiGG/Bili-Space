from pathlib import Path
import subprocess,time,json
R=Path.cwd();stop=R/'verification/focus18.stop';stop.unlink(missing_ok=True)
settings=R/'dist/.appdata/settings.json';backup=settings.read_bytes();d=json.loads(backup);d['config'].update(srMode='off',fiMode='off',proxy=False,clipboardAutoOpen=False,closeAction='exit');settings.write_text(json.dumps(d))
p=subprocess.Popen([str(R/'dist/Bili-Space.exe'),'--test'],cwd=R/'dist');helper=subprocess.Popen(['python',str(R/'scripts/focus18_helper.py')]);print('test processes started',p.pid,helper.pid,flush=True)
try:
 for _ in range(600):
  if stop.exists() or p.poll() is not None:break
  time.sleep(.5)
finally:
 helper.terminate();helper.wait()
 if p.poll() is None:p.terminate();p.wait()
 settings.write_bytes(backup)
 print('test processes closed; settings restored',flush=True)
