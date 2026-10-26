from pathlib import Path
import json
p=Path('assets/enhance.js');s=p.read_text(encoding='utf8');repl={
 '只留下想看的。':'页面净化','识别明确的广告容器，不根据标题猜测，不删除评论和正常推荐。':'',
 '图二中的动态、热门、番剧、动画等频道导航。':'',
 '属于你的那一点颜色。':'','让界面跟着屏幕变大，而不是缩在左上角。':'','按这个内容宽度排版；数值越小，界面越大。':'数值越小，界面越大',
 '仅在客户端运行时读取新复制的文本；识别完整 BV 号或 B站视频链接，不记录剪贴板内容，不弹出或抢焦点。':'读取新复制的 BV 号或视频链接',
 "accountProfile?'数据来自 B站；未获取的项目显示 —'+(!accountProfile.banner?'；主页横幅暂未获取':''):'登录后可查看昵称、等级和账号统计'":"accountProfile?'':'登录后查看账户信息'",
 '暂无节点，请用内置免费节点或导入配置':'暂无节点',
 '正在重启客户端以启用代理…':'正在重启…','正在重启客户端以关闭代理…':'正在重启…',
 }
for a,b in repl.items():assert a in s,a;s=s.replace(a,b)
a=s.index('<div class="note"><strong>非破坏式净化</strong>');b=s.index('</div>',a)+6;s=s[:a]+s[b:]
s=s.replace('<p class="subtitle"></p>','').replace('<span class="hint"></span>','').replace(';void 0;',';')
s=s.replace(";void 0;}",";}")
p.write_text(s,encoding='utf8',newline='\n')
# Release metadata: never replace the immutable 0.1.34 release archive.
for f in ['package.json','package-lock.json','CMakeLists.txt','src/app_info.hpp','src/app.rc','assets/app-info.json','assets/bridge.js','assets/enhance.js','src/update_service.hpp']:
 p=Path(f);s=p.read_text(encoding='utf8').replace('0.1.34','0.1.35').replace('0,1,34,0','0,1,35,0');p.write_text(s,encoding='utf8',newline='\n')
# Assertions follow presentation copy, not obsolete wording.
for f in ['tests/input24.test.cjs','tests/search18.test.cjs']:
 p=Path(f)
 if p.exists():
  s=p.read_text(encoding='utf8').replace('暂无官方联想','暂无建议').replace('官方联想暂时不可用','暂时无法获取建议');p.write_text(s,encoding='utf8',newline='\n')
for p in Path('tests').glob('*.test.cjs'):
 s=p.read_text(encoding='utf8')
 if '官方联想暂时不可用' in s:p.write_text(s.replace('官方联想暂时不可用','暂时无法获取建议'),encoding='utf8',newline='\n')
p=Path('tests/update34.test.cjs');s=p.read_text(encoding='utf8').replace("s.querySelector('#app-version').textContent,'0.1.34'","s.querySelector('#app-version').textContent,JSON.parse(fs.readFileSync('assets/app-info.json','utf8')).version");p.write_text(s,encoding='utf8',newline='\n')
