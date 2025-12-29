#!/bin/bash
cd "$(dirname "$0")"

echo "🔄 重启 ComfyDeploy..."

# 停止旧进程
pkill -f "bun.*start" 2>/dev/null
sleep 1

# 加载环境变量
[ -f .env ] && source .env

# 构建
echo "🔨 构建中..."
bun run build || { echo "❌ 构建失败"; exit 1; }

# 启动
nohup bun run start > comfydeploy.log 2>&1 &

echo "✅ 已启动 (PID: $!) | 日志: tail -f comfydeploy.log"
