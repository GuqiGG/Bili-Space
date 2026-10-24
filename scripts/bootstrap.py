import json,urllib.request,pathlib,zipfile,hashlib,concurrent.futures
root=pathlib.Path.cwd()
def get(url,path):
 path=root/path
 if not path.exists():
  print('Downloading',url,flush=True); urllib.request.urlretrieve(url,path)
 return path
with concurrent.futures.ThreadPoolExecutor() as ex:
 tasks=[ex.submit(get,'https://ziglang.org/download/0.13.0/zig-windows-x86_64-0.13.0.zip',pathlib.Path('.tools/zig.zip')),ex.submit(get,'https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.3537.50',pathlib.Path('.tools/webview2.zip')),ex.submit(get,'https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp',pathlib.Path('vendor/json.hpp'))]
 for t in tasks:t.result()
for name,folder in [('zig','zig'),('webview2','webview2')]:
 expected={'zig':'d859994725ef9402381e557c60bb57497215682e355204d754ee3df75ee3c158','webview2':'5ea526bbd728adda0da4d31219267e96460494a427e4894c4e09d9f320f4b9aa'}[name]
 actual=hashlib.sha256((root/'.tools'/f'{name}.zip').read_bytes()).hexdigest()
 if actual!=expected:raise RuntimeError(f'{name} SHA256 mismatch: {actual}')
 out=root/'.tools'/folder
 if not out.exists():
  with zipfile.ZipFile(root/'.tools'/f'{name}.zip') as z:z.extractall(out)
 print(name,'extracted',flush=True)
print('toolchain ready',flush=True)
