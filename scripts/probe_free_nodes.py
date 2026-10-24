import yaml,json,subprocess,time,requests,socket
from pathlib import Path
r=Path.cwd();out=r/'verification/free-node-test';out.mkdir(exist_ok=True)
nodes=yaml.safe_load((r/'runtime/free-candidates.yaml').read_text())['proxies'][1:]
cfg={'mixed-port':17989,'external-controller':'127.0.0.1:17990','secret':'local-free-check','allow-lan':False,'bind-address':'127.0.0.1','mode':'rule','log-level':'warning','proxies':nodes,'proxy-groups':[{'name':'TEST','type':'select','proxies':[n['name'] for n in nodes]}],'rules':['MATCH,TEST']}
f=out/'config.json';f.write_text(json.dumps(cfg),encoding='utf8');log=open(out/'core.log','wb');p=subprocess.Popen([str(r/'runtime/mihomo.exe'),'-d',str(out),'-f',str(f)],stdout=log,stderr=log,creationflags=0x08000000)
results=[]
try:
 for _ in range(60):
  try:
   if requests.get('http://127.0.0.1:17990/version',headers={'Authorization':'Bearer local-free-check'},timeout=.2).status_code==200:break
  except:time.sleep(.1)
 for n in nodes:
  requests.put('http://127.0.0.1:17990/proxies/TEST',json={'name':n['name']},headers={'Authorization':'Bearer local-free-check'},timeout=2)
  t=time.monotonic();result={'name':n['name'],'server':n['server'],'cookies_sent':False}
  try:
   response=requests.get('https://example.com/',proxies={'https':'http://127.0.0.1:17989'},timeout=6);result.update(status=response.status_code,success=response.status_code==200 and 'Example Domain' in response.text)
  except Exception as e:result.update(error=str(e),success=False)
  result['seconds']=round(time.monotonic()-t,3);results.append(result);print(json.dumps(result))
finally:p.terminate();p.wait();log.close()
(r/'verification/free-nodes-results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
working=[n for n,x in zip(nodes,results) if x['success']]
if working:(r/'runtime/free-candidates.yaml').write_text(yaml.safe_dump({'proxies':working},allow_unicode=True,sort_keys=False),encoding='utf8')
else:(r/'runtime/free-candidates.yaml').write_text('# No verified working free candidate on 2026-10-24. Import your own trusted provider.\nproxies: []\n')
