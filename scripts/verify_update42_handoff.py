from pathlib import Path
import json,subprocess,hashlib,time,shutil
R=Path(__file__).resolve().parents[1];out=R/'verification/update42-handoff';out.mkdir(exist_ok=True)
fixture=(R/'verification/update38-worker/fixture.exe').read_bytes();results={}
for mode in ['handoff','mixed-case','unrelated-parent']:
    d=out/mode;d.mkdir(exist_ok=True);profile=d/'profile/updates';profile.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(R/'verification/update42-handoff.exe',d/'Bili-Space.exe')
    app=d/'Bili-Space.exe'
    if mode=='unrelated-parent':shutil.copyfile(app,d/'other.exe');app=d/'other.exe'
    if mode=='mixed-case':app=Path(str(app).swapcase())
    pkg=profile/'Bili-Space-0.1.42-Setup.exe';pkg.write_bytes(fixture)
    sentinel=d/'profile/settings.json';sentinel.write_text('{"preserve":true}')
    (d/'restarted.txt').unlink(missing_ok=True)
    m=dict(schema=1,appId='bili-space',platform='windows-x64',version='0.1.99',minimumSupportedVersion='0.1.0',force=False,downloadUrl='https://bili.gvqi.top/releases/Bili-Space-0.1.99-win64.zip',sha256='a'*64,size=100,changelog=['handoff fixture'],setupUrl='https://github.com/GuqiGG/Bili-Space/releases/download/v0.1.99/Bili-Space-0.1.99-Setup.exe',setupSha256=hashlib.sha256(fixture).hexdigest(),setupSize=len(fixture),package=str(pkg))
    # Install worker checks version independently of release availability.
    m['version']='0.1.42';m['setupUrl']=m['setupUrl'].replace('0.1.99','0.1.42');m['downloadUrl']=m['downloadUrl'].replace('0.1.99','0.1.42')
    f=d/'manifest.json';f.write_text(json.dumps(m))
    p=subprocess.run([str(app),str(f)],capture_output=True,timeout=25);assert p.returncode==0,p.stderr
    v=json.loads(p.stdout)
    if mode=='unrelated-parent':
        assert v['clientKeptOpen'] and not v['busy'],v
        assert not (d/'installer-args.txt').exists()
    else:
        assert not v['clientKeptOpen'] and v['busy'],v
        result=profile/'install-result.json'
        for _ in range(150):
            if result.exists() and (d/'restarted.txt').exists():break
            time.sleep(.1)
        assert json.loads(result.read_text(encoding='utf-8'))['success']
        assert (d/'restarted.txt').exists()
        assert json.loads((profile/'install-job.json').read_text())['readyEvent']
    assert sentinel.read_text()=='{"preserve":true}'
    results[mode]={'command':p.args,'exit':p.returncode,'stdout':p.stdout.decode('utf-8'),'stderr':p.stderr.decode('utf-8'),'settings_preserved':True}
print(json.dumps(results,ensure_ascii=True,indent=2));(out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
