from pathlib import Path
import yaml,json,subprocess,time,requests
ROOT=Path.cwd();OUT=ROOT/'verification/bundled-node-test';OUT.mkdir(exist_ok=True)
nodes=yaml.safe_load((ROOT/'runtime/free-candidates.yaml').read_text(encoding='utf8'))['proxies'];assert nodes and all(not n.get('skip-cert-verify',False) for n in nodes)
cfg={'mixed-port':17989,'external-controller':'127.0.0.1:17990','secret':'bundled-anonymous-test','allow-lan':False,'bind-address':'127.0.0.1','mode':'rule','proxies':nodes,'proxy-groups':[{'name':'TEST','type':'select','proxies':[n['name'] for n in nodes]}],'rules':['MATCH,TEST'],'log-level':'warning'}
f=OUT/'config.json';f.write_text(json.dumps(cfg),encoding='utf8');log=open(OUT/'core.log','wb');p=subprocess.Popen([str(ROOT/'runtime/mihomo.exe'),'-d',str(OUT),'-f',str(f)],stdout=log,stderr=log,creationflags=0x08000000);result=[]
s=requests.Session();s.trust_env=False;H={'Authorization':'Bearer bundled-anonymous-test'}
try:
 for _ in range(80):
  try:
   if s.get('http://127.0.0.1:17990/version',headers=H,timeout=.3).status_code==200:break
  except:time.sleep(.1)
 for n in nodes:
  r=s.put('http://127.0.0.1:17990/proxies/TEST',json={'name':n['name']},headers=H,timeout=2);assert r.status_code==204
  item={'name':n['name'],'type':n['type'],'tls_verification_disabled':False,'account_cookies_sent':False,'mainland_anime_tested':False};begin=time.monotonic()
  try:
   r=s.get('https://example.com/',proxies={'https':'http://127.0.0.1:17989'},timeout=10);item.update(status=r.status_code,example_domain_verified='Example Domain' in r.text and r.status_code==200)
  except Exception as e:item.update(error=str(e),example_domain_verified=False)
  item['seconds']=round(time.monotonic()-begin,3);result.append(item);print(json.dumps(item,ensure_ascii=True))
finally:p.terminate();p.wait();log.close()
(ROOT/'verification/bundled-nodes-verified.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');assert all(x['example_domain_verified'] for x in result)
