from pathlib import Path
import subprocess,json
r=Path.cwd();o=r/'verification';base=json.loads((o/'native-resize-verification.json').read_text())['events'][0]['command'];events=[]
for label,source in [('BASELINE',o/'links-baseline/main.cpp'),('MODIFIED',r/'src/main.cpp'),('ROLLBACK',o/'links-rollback-main.cpp')]:
 cmd=base.copy();cmd[2]=str(r/'tests/native_links_probe.cpp');cmd[3]='-DTARGET_CPP="'+source.as_posix()+'"';cmd.insert(4,'-DHAS_LINKS='+('1' if 'clipboardVideoUrl' in source.read_text(encoding='utf8') else '0'));cmd[-1]=str(r/'.tools/hidden-resize'/('links-'+label+'.exe'))
 for command in [cmd,[cmd[-1]]]:
  p=subprocess.run(command,capture_output=True,text=True,encoding='utf8');events.append({'label':label,'command':command,'stdout':p.stdout,'stderr':p.stderr,'exit_status':p.returncode});assert p.returncode==0,events[-1]
 print(label,p.stdout.strip(),flush=True)
(o/'links-native.json').write_text(json.dumps({'events':events,'note':'Parser and URL scheme tests only. User clipboard not read or altered; browser not launched.'},ensure_ascii=False,indent=2),encoding='utf8')
