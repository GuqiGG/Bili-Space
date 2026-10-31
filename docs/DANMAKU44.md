# 弹幕 44 · 原生播放器弹幕设置扩展

本地开发补充，未创建 Release。

## 背景

客户端已有可选的本地弹幕层（`assets/community44.js`）：开启后隐藏播放器自带弹幕节点，用同一份官方弹幕数据（WBI 签名的 `seg.so` 分段）自己渲染，从而能控制密度、透明度、速度和屏蔽词。本次只扩展这一层的设置项，不改播放器、不上传任何弹幕内容。

## 新增设置

| 键 | 默认 | 范围 | 作用 |
| --- | --- | --- | --- |
| `mergeRepeats` | 开 | 布尔 | 同屏重复弹幕合并成一条 |
| `mergeWindow` | 6 秒 | 2–15 | 合并的时间窗，超过就另起一条 |
| `maxPerSecond` | 20 条 | 0–60（0=不限） | 每秒最多渲染条数，超出的进入洪峰计数 |
| `areaScroll` | 开 | 布尔 | 滚动弹幕（mode 1/2/3/6） |
| `areaTop` | 开 | 布尔 | 顶部弹幕（mode 5） |
| `areaBottom` | 开 | 布尔 | 底部弹幕（mode 4） |
| `fontScale` | 100% | 50–150 | 字号缩放，基准仍是容器宽度自适应 |
| `filterNoise` | 关 | 布尔 | 过滤纯符号与连续单字刷屏 |

`keywords` 增加 `re:` 前缀：`re:^6+$` 按正则匹配（不区分大小写，编译失败按普通文本处理）。

## 行为细节

- **重复合并**：同一 `mode + 归一化文本` 在 `mergeWindow` 内重复出现时复用同一条 DOM，文本更新为 `原文 ×N`，N 是原生弹幕条数（上限 9999）。`mode` 参与 key，避免顶部/底部/滚动被合到同一条车道上。
- **洪峰角标**：超过 `maxPerSecond` 或车道占满时计入 `floodDropped`，舞台上出现 `弹幕 ×N` 角标；3 秒没有新增丢弃就自动消失，不占用弹幕车道。
- **区域过滤**同时作用于合并 key 之外的入口判断，被关掉的区域既不入场也不参与合并。
- 设置经 `cleanState`（JS）与 `sanitizeCommunity44`（C++）双重白名单/夹紧；默认值在两端保持一致，避免"改了重启就丢"。
- 不保存弹幕正文、URL、cookie；`community44.json` 仍然只有设置、观看时长、已读动态 ID 与账号 ID。

## 画中画层对齐

画中画弹幕（`PipDanmaku`）复用同一份社区设置：`danmakuEnabled` 控制是否接管，`density/opacity/speed/keywords` 原有；本轮补上 `filterNoise`、`areaScroll/areaTop/areaBottom` 与重复合并（同一 `mode + 归一化文本` 在 `mergeWindow` 内合并为 `原文 ×N`）。画中画不做每秒上限与洪峰角标——小窗车道本身就少，`density` 已经够用，避免在 480×270 的画面里再叠一层提示。

## 验收

- `tests/community44.test.cjs` 21 项（新增 6 项：合并计数、洪峰角标、区域、正则+噪声、字号、默认值/夹紧）。
- 全量前端 `node --test tests/*.test.cjs`：218 项通过。
- `scripts/test_community44_native.ps1`：原生状态序列化/夹紧/通知适配器通过。
- `scripts/build.ps1` 构建成功，`--test` 启动冒烟到 `Bili-Space ready`。
