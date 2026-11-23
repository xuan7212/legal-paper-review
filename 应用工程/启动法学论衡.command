#!/bin/zsh
set -eu

cd "${0:A:h}"

if command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
else
  node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [[ ! -x "$node_bin" ]]; then
  print "请先安装 Node.js 22.13 或更新版本，再双击此文件。"
  read "?按回车关闭窗口。"
  exit 1
fi

export PATH="${node_bin:h}:$PATH"
exec "$node_bin" scripts/launch.mjs "$@"
