"""Prepare the renderer with the same npm project on every supported platform."""
import asyncio
import hashlib
import os
from pathlib import Path
import shutil
import sys

NODE_VERSION = "24.22.3"
NPM_REGISTRIES = ("https://registry.npmmirror.com/", "https://registry.npmjs.org/")
NODE_MIRROR = "https://npmmirror.com/mirrors/node/"


async def _run(*args, cwd=None, env=None, timeout=300):
    process = await asyncio.create_subprocess_exec(
        *map(str, args), cwd=cwd, env=env,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    if process.returncode:
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {process.returncode})")
    return stdout.decode("utf-8", errors="replace").strip()


def _installed(path):
    return all((path / name).is_file() for name in (
        "render-stdio.mjs", "node_modules/shiki/package.json", "node_modules/mdshot/package.json",
        "node_modules/@fontsource-variable/noto-sans-sc/unicode.json",
        ".fonts/iosevka-latin-400-normal.woff2", ".fonts/iosevka-latin-700-normal.woff2",
    ))


def _fingerprint(source):
    digest = hashlib.sha256()
    files = [*source.glob("*.mjs"), source / "package.json", source / "package-lock.json"]
    files.extend((source / "patches").glob("*.patch"))
    for path in sorted(files):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


async def _usable_node(path):
    if not path:
        return False
    try:
        version = await _run(path, "--version", timeout=10)
        return int(version.lstrip("v").split(".")[0]) >= 20
    except (OSError, ValueError, RuntimeError, asyncio.TimeoutError):
        return False


async def _node_and_npm(data_dir, require_npm, logger):
    node = shutil.which("node")
    npm = shutil.which("npm")
    if await _usable_node(node) and (npm or not require_npm):
        return Path(node), Path(npm) if npm else None

    env_dir = data_dir / f"node-{NODE_VERSION}"
    node_path = env_dir / ("Scripts/node.exe" if os.name == "nt" else "bin/node")
    npm_path = env_dir / ("Scripts/npm.cmd" if os.name == "nt" else "bin/npm")
    if not await _usable_node(str(node_path)) or not npm_path.exists():
        logger.info("正在准备 Node.js %s，首次安装需要联网", NODE_VERSION)
        env_dir.parent.mkdir(parents=True, exist_ok=True)
        await _run(sys.executable, "-m", "nodeenv", "--prebuilt", "--force",
                   f"--node={NODE_VERSION}", f"--mirror={NODE_MIRROR}", env_dir)
    if not await _usable_node(str(node_path)) or not npm_path.exists():
        raise RuntimeError("Node.js 或 npm 准备失败")
    return node_path, npm_path


async def prepare_renderer(source, data_dir, logger):
    """Reuse a complete install or prepare a versioned copy in plugin data."""
    source, data_dir = Path(source).resolve(), Path(data_dir).resolve()
    target = data_dir / f"renderer-{_fingerprint(source)}"
    ready = _installed(target)
    if not ready and _installed(source):
        data_dir.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.rmtree(target)
        await asyncio.to_thread(shutil.copytree, source, target, ignore=shutil.ignore_patterns("__pycache__"))
        ready = _installed(target)
    node, npm = await _node_and_npm(data_dir, not ready, logger)
    if not ready:
        logger.info("正在从 npmmirror 安装 Markdown 渲染依赖")
        data_dir.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target, ignore=shutil.ignore_patterns("node_modules", ".fonts", "__pycache__"))
        env = os.environ.copy()
        env["PATH"] = str(node.parent) + os.pathsep + env.get("PATH", "")
        env["npm_config_cache"] = str(data_dir / "npm-cache")
        for index, registry in enumerate(NPM_REGISTRIES):
            try:
                await _run(npm, "ci", "--no-audit", "--no-fund", f"--registry={registry}",
                           "--replace-registry-host=always", cwd=target, env=env)
                break
            except (OSError, RuntimeError, asyncio.TimeoutError):
                if index == len(NPM_REGISTRIES) - 1:
                    raise
                logger.warning("npm 镜像安装失败，尝试官方 npm 源")
        if not _installed(target):
            raise RuntimeError("渲染依赖安装不完整")
        await asyncio.to_thread(shutil.rmtree, data_dir / "npm-cache", ignore_errors=True)
    return node, target / "render-stdio.mjs"
