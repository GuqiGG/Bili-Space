"""Prepare a release manifest; does not upload or deploy anything."""
from pathlib import Path
import argparse,hashlib,json,re,shutil,datetime

def make(package,version,minimum,force,notes):
 for v in [version,minimum]:
  if not re.fullmatch(r'(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})',v):raise ValueError('Use major.minor.patch')
 if tuple(map(int,minimum.split('.')))>tuple(map(int,version.split('.'))):raise ValueError('minimum must not exceed latest')
 if package.name!=f'Bili-Space-{version}-win64.zip':raise ValueError('Package filename/version mismatch')
 if not notes:raise ValueError('Changelog is required')
 return dict(schema=1,appId='bili-space',platform='windows-x64',version=version,minimumSupportedVersion=minimum,force=force,releaseDate=datetime.datetime.now(datetime.timezone.utc).isoformat(),downloadUrl=f'https://bili.gvqi.top/releases/{package.name}',sha256=hashlib.file_digest(package.open('rb'),'sha256').hexdigest(),size=package.stat().st_size,changelog=notes)

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--package',type=Path,required=True);p.add_argument('--version',required=True);p.add_argument('--min-version',default='0.1.0');p.add_argument('--force',action='store_true');p.add_argument('--changelog',action='append',required=True);p.add_argument('--out',type=Path,default=Path('update-site/public/updates/windows-x64.json'));p.add_argument('--copy-package',action='store_true');a=p.parse_args()
 m=make(a.package,a.version,a.min_version,a.force,a.changelog);a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf8')
 if a.copy_package:
  dest=a.out.parent.parent/'releases'/a.package.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(a.package,dest)
 print(json.dumps(m,ensure_ascii=False,indent=2))
