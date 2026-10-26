from pathlib import Path
import json
R=Path.cwd();p=R/'assets/enhance.js';s=p.read_text(encoding='utf8')
replacements={
 '只显示常去的分区。':'分区','番剧与访问，一个开关。':'网络代理','顶部，只放你需要的。':'顶部栏','让空间，像你。':'个性化','掌握每一秒。':'进度条','只留下你想看的。':'页面净化','细节，多看一点。':'播放','熟悉的能力，内置。':'扩展',
 '点左上角的小箭头展开，勾选后立即生效；没选的分区不会占位。当前 ${chosen} / ${total}。':'已选 ${chosen} / ${total}',
 '内置 Mihomo（Clash 兼容内核）。只代理这个客户端，不改系统代理，不开 TUN，不接管全局网络。':'Mihomo · 仅代理客户端',
 "${on?'当前已开启。关闭后立即改为直连。':'当前关闭。开启后客户端会自动重启一次以接管网络。'}":'更改后重启客户端',
 '切换节点即时生效，不需要重启。':'',
 '默认只代理 B站相关域名，其余流量直连。开启后所有流量走节点。':'所有客户端流量通过代理',
 '点“检测出口地区”查看当前 IP 落在哪个国家或地区。':'尚未检测',
 '选择客户端顶部显示的内容，立即生效并自动保存。标题始终按窗口居中。':'',
 "key==='headerBrand'?'在窗口正中显示 Bili Space。':'控制顶部的'+label+'是否显示。'":"''",
 '关闭后导航移至左侧，最小化、最大化、关闭按钮移至头像右侧。':'',
 '少一点干扰，多一点喜欢。每次调整，都会自动保存。':'',
 '自动保存，不再反复询问；托盘右键始终可退出。':'',
 '只决定遮罩何时消失，不改变视频加载速度；自动保存，下一次打开视频时使用。':'',
 '视频加载动画结束时机':'加载动画结束时机',
 '页面界面就绪（更快）':'页面就绪',
 '仅在客户端运行时读取新复制的文本；识别完整 BV 号或 B站视频链接，不记录、不上传内容，不主动弹出窗口打扰你。':'读取新复制的 BV 号或视频链接',
 '一处强调，保持一个色彩。':'',
 '使用你已安装的 DouyinSans；未安装时回退到系统字体。':'需安装 DouyinSans',
 '让界面随屏幕变大，而不是缩在左上角。':'',
 '按设计内容宽度排版；数值越小，界面越大。':'数值越小，界面越大',
 '进度条的颜色、粗细与形状，由你决定。':'',
 '保持原生拖动与预览行为。':'',
 '关闭时跟随 B站播放器自动隐藏。':'',
 '识别明确的广告位，而不是凭内容标签猜测；不删除评论和普通推荐。':'',
 '图二中的动态、热门、番剧、动画等频道区域。':'',
 '最高 200%，与播放器音量叠加。先调低原音量，过度放大会失真；不支持安全处理时保留原声。':'超过 100% 可能失真',
 '实验功能仅在客户端设置中提供；画中画没有标题栏。':'',
 '超分和补帧可能卡顿、闪烁、抖动或产生伪影，不保证改善画质。开启即表示你了解测试风险，异常请关闭。':'超分与补帧仍在测试，可能卡顿、闪烁或产生伪影。',
 '本地 Anime4K CNN / WebGPU；帧不上传，不出本机。':'Anime4K · WebGPU',
 '60/120fps 为调度上限，不保证实际性能；不会增加源视频帧数。':'调度上限，不增加源帧数',
 'Anime4K 固定 ×2 推理，再按目标倍率缩放；只处理真正需要放大的画面。':'',
 ' · RIFE 光流重投影，按源帧率固定的短呈现缓冲 + 推理延迟':'',
 '本地固定版本，不下载远程更新，不绕过会员、地区或版权限制。':'',
 '多 CDN / Range 并发缓冲。开关变更后需刷新页面。':'更改后刷新页面',
 '仅首页推荐按钮。视频页、搜索页、隐藏直播与插件广告过滤均关闭。拉黑会同步至 B站账号。':'仅首页 · 同步至 B站黑名单',
 '点击后选择保存位置，直接在客户端内下载。无需安装或启动其他软件。':'',
 '修改即时生效 · 自动保存':'',
 "searchSuggestStatus=query?'正在获取官方联想…':''":"searchSuggestStatus=''",
 "searchSuggestStatus='输入关键词，获取官方搜索联想'":"searchSuggestStatus=''",
 "searchSuggestStatus||'输入关键词，获取官方搜索联想'":"searchSuggestStatus||''",
 "'暂无官方联想'":"'暂无建议'",
 "'官方联想暂时不可用'":"'暂时无法获取建议'",
 "'B站搜索历史暂时不可用'":"'暂时无法获取历史记录'",
 '留出空间，专注喜欢。':'',
 '启动时自动检查 · 更新源 bili.gvqi.top':'更新源 · bili.gvqi.top',
 '普通更新可以忽略；网站标记强制更新或最低支持版本高于当前版本时，需更新后才能继续使用。下载后校验 SHA256；请退出客户端、解压替换旧版并重启。更新日志由网站清单提供。':'下载校验后，退出客户端并解压替换旧版。',
 "toast('已重新检查当前页面')":"void 0",
 "toast('视频链接已复制')":"void 0",
 "toast('正在检测下载器…')":"void 0",
 '正在重启客户端以启用内置免费节点…':'正在重启…',
 '正在重启客户端启用代理…':'正在重启…','正在重启客户端关闭代理…':'正在重启…',
 '已保存；刷新页面后切换线程撕裂者':'刷新页面后生效',
 '已切换分流方式；重启客户端后完整生效':'重启后生效',
 '警告：测试版超分/补帧已开启，可能卡顿或闪烁，可在设置 → 播放中关闭。':'测试功能已开启：超分/补帧可能卡顿或闪烁。',
}
changed=[]
for a,b in replacements.items():
 if a in s:s=s.replace(a,b);changed.append(a)
 else:print('NOT FOUND',a)
# Delete explanatory paragraphs, not state-bearing nodes or risk warnings.
for start in ['分区只是快捷入口，','红黄绿窗口控制始终保留，','${icon(\'appearance\')} 内容保持清晰，','<strong>非破坏式过滤</strong>','<strong>真实处理，可随时关闭</strong>','线程撕裂者与首页拉黑保留原有功能。']:
 marker='<div class="note">'+start
 i=s.find(marker)
 if i>=0:
  j=s.index('</div>',i)+6;s=s[:i]+s[j:]
# Keep the actual proxy risk and supported download formats, without an essay.
a=s.index('<div class="note"><strong>为什么开了代理还看不了番剧？');b=s.index('</div>',a)+6
s=s[:a]+'<div class="note">节点出口需符合番剧授权地区。免费节点来源不受信任，请勿用于敏感账户。</div>'+s[b:]
a=s.index('<div class="note">采用 WBI 解析');b=s.index('</div>',a)+6
s=s[:a]+'<div class="note">支持 AVC / AAC 单视频下载；暂不支持批量、多段与番剧。</div>'+s[b:]
s=s.replace('<p class="subtitle"></p>','').replace('<span class="hint"></span>','')
s=s.replace('${APP_META.version} · 为专注而设计<br>','${APP_META.version}')
s=s.replace('${hint}</span>','${hint}</span>') # dynamic hint wrapper below
s=s.replace('${title}<span class="hint">${hint}</span>','${title}${hint?`<span class="hint">${hint}</span>`:\'\'}')
# Do not announce an empty loading explanation in the search panel.
s=s.replace("if(!searchSuggestions.length){const status=", "if(!searchSuggestions.length&&searchSuggestStatus){const status=")
p.write_text(s,encoding='utf8',newline='\n')
# Native download status is operational state, not advertising.
p=R/'src/main.cpp';s=p.read_text(encoding='utf8').replace('内置下载器，无需其他软件','下载器就绪').replace('正在内置下载，请勿退出客户端…','下载已开始');p.write_text(s,encoding='utf8',newline='\n')
# Move the historical implementation diary off the product front page.
(R/'docs/IMPLEMENTATION-NOTES.md').write_bytes((R/'verification/presentation35-baseline/README.md').read_bytes())
(R/'verification/presentation35-copy-changes.json').write_text(json.dumps(changed,ensure_ascii=False,indent=2),encoding='utf8')
