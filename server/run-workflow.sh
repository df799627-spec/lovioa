#!/bin/bash
# 运行 DeepSeek Prompt Workflow（自动加载 .env）
# 用法同 deepseek-prompt-workflow.js

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

cd "$SCRIPT_DIR"
node deepseek-prompt-workflow.js "$@"