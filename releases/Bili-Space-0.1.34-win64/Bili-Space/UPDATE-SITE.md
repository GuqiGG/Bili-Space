# Bili-Space 更新网站部署

当前版本：0.1.34。此文件及 update-site 只是已准备的本地部署材料，尚未替你上传或部署。
作者沿用此前“无作者”要求显示为“未署名”。如需改名，同时修改 assets/app-info.json、src/app_info.hpp 及网站页脚，并重新构建。

## 客户端如何收到提醒

固定读取：`https://bili.gvqi.top/updates/windows-x64.json`（HTTPS、200，不接受重定向）。
设置 → 关于与更新：版本号、作者、检查更新、更新日志、忽略此版本、查看检查日志。
默认启动时检查一次。网站未部署/断网/清单损坏时显示错误，未检测到有效强制更新前不锁住客户端。
普通更新：设置按钮出现粉色提示点，可下载或忽略**这个版本**，之后的新版本仍会提醒。
强制更新：退出当前网页并暂停播放，显示不可跳过的更新界面；允许检查、下载或退出，不允许继续旧版。
已确认的强制清单会在本机缓存，重启/离线不会通过；安装满足要求的新版本后解除。
客户端不是 DRM：本地管理员仍可修改程序/数据。没有网站连接时也不可能得知全新的强制通知。

更新包在客户端原生下载并验证**字节数和 SHA256**，失败删除临时包；不是静默安装器。
下载完成 → 打开更新包目录 → 退出客户端（托盘也要退出）→ 完整解压覆盖旧安装目录 → 运行 Bili-Space.exe。
用户数据仍保留在旧 `%LOCALAPPDATA%\BetterBiliSpace`，避免换名后掉登录；不会把它打进包。
操作日志：上述数据目录下 `updates\update.log`（UTC 时间），不记录 Cookie/令牌。

## 最简单部署：Cloudflare Worker + R2

也可用自己的 Nginx/静态服务器，把 public 里的文件按原目录放在 HTTPS 域名下即可。
以下方案用 Worker 从 R2 读取网站和 ZIP，不依赖 GitHub 跳转，也不把大包塞进 Worker 代码。
Cloudflare 账户可能要求开通 R2；请先查看其计费与额度，不保证全部免费。

1. 确保你拥有 gvqi.top，并已接入 Cloudflare DNS。
2. Cloudflare 控制台 → R2 → 创建桶 **bili-space-releases**，保持桶私有。
3. Workers & Pages → 创建 Worker，命名 **bili-space-updates**，复制 `update-site/worker.js` 的代码部署。
4. Worker → Settings → Bindings：添加 R2 bucket，变量名 **RELEASES**，选择上面的桶。
5. Worker → Settings → Domains & Routes：添加 Custom Domain **bili.gvqi.top**。等待证书和 DNS 生效；若有同名冲突记录，先检查再调整，勿误删其他服务。
6. 将 `update-site/public` 的内容上传到 R2，**对象键必须如下，不能额外带 public/ 前缀**：
   - `index.html`
   - `site.js`
   - `site.css`
   - `releases/Bili-Space-0.1.34-win64.zip`
   - `updates/windows-x64.json`
7. **先上传 ZIP，最后上传清单**。清单使用 no-store，旧 ZIP 地址保持不可变。
8. 浏览器打开首页及清单地址确认，再到客户端点击“检查更新”。清单指向 0.1.34 时当前客户端应显示最新版本。

也可从 update-site 目录用 Wrangler（命令供你自己运行，此次没有执行部署）：

```powershell
npx wrangler login
npx wrangler r2 bucket create bili-space-releases
npx wrangler deploy
npx wrangler r2 object put bili-space-releases/index.html --file public/index.html --remote
npx wrangler r2 object put bili-space-releases/site.js --file public/site.js --remote
npx wrangler r2 object put bili-space-releases/site.css --file public/site.css --remote
npx wrangler r2 object put bili-space-releases/releases/Bili-Space-0.1.34-win64.zip --file public/releases/Bili-Space-0.1.34-win64.zip --remote
npx wrangler r2 object put bili-space-releases/updates/windows-x64.json --file public/updates/windows-x64.json --remote
```

## 以后发布新版本与日志

先统一 package.json、package-lock.json、CMakeLists.txt、src/app_info.hpp、src/app.rc、assets/app-info.json、assets/bridge.js 中的版本并构建打包。版本严格使用三段数字，如 0.1.35；不是按字符串大小比较。
在项目根目录执行（下面以未来 0.1.35 为例，需先有对应真实包）：

```powershell
python scripts/make_update_manifest.py --package releases/Bili-Space-0.1.35-win64.zip --version 0.1.35 --min-version 0.1.0 --changelog "修复播放器布局" --changelog "优化下载体验" --copy-package
```

脚本自动计算包体大小/SHA256，生成 public/updates/windows-x64.json 并复制包到 public/releases。
不要手填假哈希，不要把测试/个人数据打进包。SHA256只能证明包与清单一致，**不代替代码签名**；务必保护域名、Cloudflare账户和上传权限。

清单关键字段：

| 字段 | 作用 |
|---|---|
| version | 最新版本；必须高于客户端才会提示升级 |
| minimumSupportedVersion | 低于它的旧客户端必须升级，即使 force 为 false |
| force | true：所有比 version 旧的客户端都必须升级，忽略记录无效 |
| changelog | 字符串数组，每一项一条更新日志，作为纯文本显示 |
| downloadUrl | 只能是该域名 releases/Bili-Space-x.y.z-win64.zip 的 HTTPS 直链 |
| sha256 / size | 真实 ZIP 的哈希及字节数，客户端下载后校验 |

**强制例子**：在生成命令加 `--force`；或 `--min-version 0.1.35`（仅低于它的版本强制）。只在确认新包可下载、测试通过后使用。
**撤回强制**：同一个有效最新版本清单改 force=false，并降低 minimumSupportedVersion，上传；被锁客户端点击“重新检查”后解除。离线客户端无法收到撤回，需联网。
**坏包回滚**：不要给旧 URL 换内容；修复后发更高版本的新 ZIP 和清单。相同/更低版本绝不强制降级。

官方部署依据：
- https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
