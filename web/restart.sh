#!/bin/bash

# ComfyDeploy Restart Script
# 重启 comfydeploy web 服务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/comfydeploy.log"
PID_FILE="$SCRIPT_DIR/comfydeploy.pid"

echo "=========================================="
echo "ComfyDeploy Restart Script"
echo "=========================================="

# 1. 查找并停止旧进程
echo "[1/2] 查找并停止旧进程..."

# 方法1: 从 PID 文件读取
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "从 PID 文件找到进程: $OLD_PID"
        kill "$OLD_PID" 2>/dev/null
        sleep 2
        # 如果还在运行，强制杀死
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "进程未响应，强制终止..."
            kill -9 "$OLD_PID" 2>/dev/null
        fi
        echo "已停止进程: $OLD_PID"
    fi
    rm -f "$PID_FILE"
fi

# 方法2: 通过进程名查找 next-server 或 bun 相关进程
PIDS=$(pgrep -f "next-server" 2>/dev/null || pgrep -f "bun.*start" 2>/dev/null || pgrep -f "node.*next.*start" 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "找到相关进程: $PIDS"
    for pid in $PIDS; do
        echo "正在停止进程: $pid"
        kill "$pid" 2>/dev/null
    done
    sleep 2
    # 检查是否还有残留进程
    for pid in $PIDS; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "强制终止进程: $pid"
            kill -9 "$pid" 2>/dev/null
        fi
    done
fi

echo "旧进程已清理完成"

# 2. 启动新进程
echo "[2/2] 启动新进程..."
cd "$SCRIPT_DIR"

# 加载 .env 文件中的环境变量
ENV_FILE="$SCRIPT_DIR/.env"
ENV_VARS=""
if [ -f "$ENV_FILE" ]; then
    echo "📄 加载环境变量从: $ENV_FILE"
    # 读取 .env 文件，忽略注释和空行
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # 跳过注释和空行
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # 去除值两端的引号（如果有）
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        # 导出到当前 shell
        export "$key=$value"
        # 构建环境变量字符串用于 nohup
        ENV_VARS="$ENV_VARS $key=$value"
        echo "   ✓ $key=${value:0:50}..."
    done < "$ENV_FILE"
    echo ""
else
    echo "⚠️  警告: 未找到 .env 文件: $ENV_FILE"
fi

# 打印关键环境变量（用于调试）
echo "🔧 关键环境变量:"
echo "   API_URL=$API_URL"
echo "   NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"
echo ""

# 使用 nohup 启动，通过 env 命令传递环境变量
nohup env $ENV_VARS bun run start > "$LOG_FILE" 2>&1 &
NEW_PID=$!

# 保存 PID 到文件
echo "$NEW_PID" > "$PID_FILE"

echo "=========================================="
echo "✅ 新进程已启动"
echo "   PID: $NEW_PID"
echo "   日志: $LOG_FILE"
echo "   PID文件: $PID_FILE"
echo "=========================================="
echo ""
echo "查看日志: tail -f $LOG_FILE"
echo "停止服务: kill \$(cat $PID_FILE)"

