# IDOL CALL MIX

一个运行在浏览器里的地下偶像音乐游戏原型：左侧使用方向键控制偶像舞步，右侧使用鼠标或触屏完成 OTA 应援音符。

在线试玩：[idol-call-mix.ryang-max.chatgpt.site](https://idol-call-mix.ryang-max.chatgpt.site)

## 已实现

- 方向键下落式舞步：← / ↓ / ↑ / →
- 点击式应援音符：Tap / Clap / Burst
- `PERFECT`、`GOOD`、`BAD`、`MISS` 时间判定与偏差显示
- 音乐与 JSON 谱面上传、谱面导出
- 可视化谱面编辑器，支持实时录制舞步、放置应援音符和划分段落
- 《OIDEMASE!!～極楽～》自制默认谱面
- 桌面与触屏操作

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

然后访问终端显示的本地地址。

生产构建：

```bash
npm run build
```

## 默认音乐

出于音乐版权考虑，开源仓库不包含《OIDEMASE!!～極楽～》音频。若你拥有合法音频文件，请将其保存为：

```text
public/oidemase.mp3
```

也可以直接在网页右上角点击“音乐”，临时载入本地音频。

## 谱面格式

默认谱面位于 `data/oidemase-default-chart.json`。谱面主要包含：

- `duration`：歌曲时长，单位为秒
- `sections`：舞蹈与应援区段
- `danceNotes`：方向键音符；内部兼容 `W/A/S/D`
- `cheerNotes`：应援音符，包含时间、位置和类型
- `calls`：可选的 Call 词及提示

游戏中的方向键与谱面内部键值对应如下：

| 谱面键值 | 游戏按键 | 动作 |
| --- | --- | --- |
| `A` | ← | 向左 |
| `S` | ↓ | 下蹲 |
| `W` | ↑ | 跳跃 |
| `D` | → | 向右 |

你可以在游戏内编辑谱面并导出 JSON，再替换默认谱面文件。

## 技术栈

- React 19
- TypeScript
- Vinext / Vite
- Base UI 与 Lucide 图标
- Web Audio API

## 许可

项目源代码采用 [MIT License](./LICENSE)。音乐、团体名称及其他第三方素材不因本许可证而获得授权，请在使用和再发布前自行确认相应权利。
