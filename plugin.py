import asyncio
import base64
from pathlib import Path

from maibot_sdk import Field, MaiBotPlugin, PluginConfigBase, Tool
from maibot_sdk.types import ToolParameterInfo, ToolParamType

from .renderer_setup import prepare_renderer

MAX_INPUT_BYTES = 24 * 1024
MAX_LINES = 250
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
RENDERER_DIR = Path(__file__).resolve().parent / "renderer"


class PluginSettings(PluginConfigBase):
    enabled: bool = True
    config_version: str = "1.0.0"


class Settings(PluginConfigBase):
    plugin: PluginSettings = Field(default_factory=PluginSettings)


class MarkdownImagePlugin(MaiBotPlugin):
    config_model = Settings

    def __init__(self):
        super().__init__()
        self._render_slots = asyncio.Semaphore(2)
        self._setup_task = None

    async def on_load(self):
        self._start_setup()

    async def on_unload(self):
        if self._setup_task and not self._setup_task.done():
            self._setup_task.cancel()
            try:
                await self._setup_task
            except asyncio.CancelledError:
                pass

    def _start_setup(self):
        if self._setup_task is None:
            self._setup_task = asyncio.create_task(self._prepare())
        return self._setup_task

    async def _prepare(self):
        try:
            result = await prepare_renderer(RENDERER_DIR, self.ctx.paths.data_dir, self.ctx.logger)
        except Exception as error:
            self.ctx.logger.warning("Markdown 渲染组件初始化失败：%s", error)
            return None
        self.ctx.logger.info("Markdown 渲染组件已就绪")
        return result

    async def on_config_update(self, scope, config_data, version):
        if scope == "self":
            self.set_plugin_config(config_data)

    @Tool(
        "render_markdown_image",
        description=(
            "把完整 Markdown、表格、带语言的代码块或 diff 渲染成可附在回复中的图片。"
            "适合用户要求图片，或较长 Markdown、表格、代码需要保留排版时使用；"
            "参数是要展示的完整 Markdown 文本，不是文件路径。调用后需用 reply 发送返回的图片。"
        ),
        parameters=[ToolParameterInfo(
            name="markdown", param_type=ToolParamType.STRING, required=True,
            description="完整 Markdown 内容；代码块请注明语言，diff 使用 diff 代码块。",
        )],
        timeout_ms=60000,
    )
    async def render_markdown_image(self, markdown: str, **kwargs):
        stream_id = str(kwargs.get("stream_id") or "").strip()
        if not stream_id:
            return {"success": False, "content": "无法确定当前聊天，图片未发送。"}
        if not isinstance(markdown, str) or not markdown.strip():
            return {"success": False, "content": "Markdown 内容为空，图片未发送。"}
        data = markdown.encode("utf-8")
        if len(data) > MAX_INPUT_BYTES or markdown.count("\n") + 1 > MAX_LINES:
            return {"success": False, "content": "内容超过单图限制（24 KiB 或 250 行），请精简内容后重试。"}
        try:
            ready = await asyncio.wait_for(asyncio.shield(self._start_setup()), timeout=2)
        except asyncio.TimeoutError:
            return {"success": False, "content": "图片渲染组件正在初始化，请稍后再试。"}
        if not ready:
            return {"success": False, "content": "图片渲染组件初始化失败，请检查插件日志并重载插件。"}
        node, renderer = ready

        async with self._render_slots:
            try:
                process = await asyncio.create_subprocess_exec(
                    str(node), str(renderer), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            except OSError as error:
                self.ctx.logger.warning("无法启动 Markdown 渲染：%s", error)
                return {"success": False, "content": "图片渲染服务不可用，图片未发送。"}
            try:
                image, stderr = await asyncio.wait_for(process.communicate(data), timeout=40)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return {"success": False, "content": "图片渲染超时，图片未发送。"}
            except asyncio.CancelledError:
                process.kill()
                await process.wait()
                raise

        if process.returncode != 0 or not image.startswith(PNG_SIGNATURE) or len(image) > 4 * 1024 * 1024:
            detail = stderr.decode("utf-8", errors="replace").strip()[:200]
            self.ctx.logger.warning("Markdown 渲染失败：%s", detail or "未得到有效 PNG")
            return {"success": False, "content": "图片渲染失败，图片未发送。"}
        return {
            "success": True,
            "content": (
                "图片已生成，尚未发送。请调用 reply，msg_id 填写请求生成图片的真实聊天消息编号，"
                "在 attach_pic 中用 media_index 引用本工具返回的图片并发送。"
            ),
            "content_items": [{
                "type": "image",
                "data": base64.b64encode(image).decode("ascii"),
                "mime_type": "image/png",
                "name": "markdown.png",
            }],
        }


def create_plugin():
    return MarkdownImagePlugin()
