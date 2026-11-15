# Markdown 图片渲染

给 MaiBot 提供 `render_markdown_image` 工具，把 Markdown、表格、代码块或 diff 排成 PNG，交给原生 `reply` 附件发送到当前聊天。模型可通过 MaiBot 的 `tool_search` 发现工具。

工具返回图片后，由模型调用 `reply`，将图片的 `media_index` 放入 `attach_pic`，并通过 `msg_id` 关联用户消息。是否显示引用由适配器处理。MaiBot 可能对工具返回的图片安排后台识图，因此可能产生额外的模型调用。

- 不依赖代码 Agent、浏览器、独立服务或其他容器。每次调用启动一个 Node.js 进程，完成后退出。
- mdshot + Shiki，逻辑宽度 400 像素、2 倍密度，图片高度随内容变化。
- Shiki 语法随 npm 依赖安装，仅按文本中实际出现的代码围栏及 diff 文件扩展名加载；无法识别时用普通文本显示。最多为单张图片加载 32 种语言。
- 拉丁代码使用 Iosevka，简体中文使用 Noto Sans SC 可变字体。仅加载当前文本用到的中文字体子集；粗体使用真实字重。字体不在仓库中。
- 默认禁止外部图片加载：mdshot 当前忽略 Markdown 图片；渲染阶段不需要联网。
- 单次 Markdown 最多 24 KiB、250 行，PNG 最多 4 MiB；同一插件最多同时渲染两张。
- 当前 mdshot 版本会将嵌套列表压平，窄图中代码长行也可能在单词中间换行。

## 安装

需要 MaiBot 1.4.5 和 SDK 2.23（兼容范围以 `_manifest.json` 为准）。从插件市场安装，或把本仓库放到 MaiBot 的 `plugins/deerfolo-markdown-image` 后重载插件。目前已在 Linux ARM64 容器中验证。

MaiBot 自动安装清单里的 Python 依赖 `nodeenv`；插件首次启动时在后台准备渲染环境，不需要手动运行 npm。优先复用本机 Node.js 20 及以上和 npm；没有时，通过 nodeenv 从 npmmirror 安装与当前系统架构匹配的 Node.js。npm 依赖优先从 npmmirror 安装，失败时尝试 npm 官方源，并应用 `patches/` 中的 mdshot 钩子。Iosevka 常规和粗体从固定版本的 Fontsource 下载并校验 SHA-256；Noto 字体作为 npm 依赖安装。

安装环境放在 MaiBot 的插件数据目录，后续启动复用，运行渲染不访问网络。首次安装需要联网和可写空间，可能花一两分钟；期间调用工具会提示正在初始化。安装失败时查看插件日志，检查到 npmmirror 和 jsDelivr 的连接后重载插件。Docker 环境中所有操作都在运行 MaiBot 的容器内完成，无须另建容器。

确保工具 `render_markdown_image` 已启用。

## 验证

以下是源码开发时的验证方式；普通用户不需要手动安装 npm 依赖。

```sh
(cd renderer && npm ci)
node --test tests/render.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
```

其中 Python 测试需要 MaiBot SDK，发送接口使用模拟对象，不会向聊天发送消息。也可以手动运行 `node renderer/render.mjs input.md output.png` 查看图片。

## 注意

插件和 Node 进程以 MaiBot 的用户权限运行，不是通用代码沙箱。工具只接受 Markdown 文本，不接受文件路径、命令或任意脚本，但仍应使用可信的插件和依赖。图片格式、长消息以及平台发送限制可能随适配器而异。

依赖和字体版权归各自作者所有；Iosevka 以 SIL OFL 1.1 授权，见 `renderer/font-licenses/Iosevka-OFL.txt`；Noto Sans SC 的授权随其 npm 包提供。mdshot 的钩子补丁见 `renderer/patches/`。
