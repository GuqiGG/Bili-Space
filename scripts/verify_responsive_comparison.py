from pathlib import Path
import subprocess,json
r=Path.cwd();dist=r/'dist/assets/enhance.js';candidate=dist.read_bytes();original=(r/'verification/responsive-baseline/enhance.js').read_bytes();events=[]
try:
 for label,data in [('BASELINE',original),('MODIFIED',candidate),('ROLLBACK',original)]:
  dist.write_bytes(data);p=subprocess.run(['python','scripts/verify_responsive_layout.py'],capture_output=True,text=True,encoding='utf8');report=json.loads((r/'verification/responsive-layout.json').read_text(encoding='utf8'));events.append({'label':label,'command':p.args,'stdout':p.stdout,'stderr':p.stderr,'exit_status':p.returncode,'report':report});print(label,'exit',p.returncode,'result',report.get('result'),flush=True);assert (p.returncode==0)==(label=='MODIFIED')
finally:dist.write_bytes(candidate)
(r/'verification/responsive-comparison.json').write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding='utf8')
