# 使用官方 Bun 运行时镜像（推荐，因为项目使用 Bun）
FROM oven/bun:1-slim

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物（确保本地已运行 next build）
# 使用方式：在本地运行 bun run build，然后构建镜像
COPY --chown=nextjs:nodejs .next ./.next
COPY --chown=nextjs:nodejs public ./public
COPY --chown=nextjs:nodejs package.json ./package.json
COPY --chown=nextjs:nodejs bun.lockb ./bun.lockb

# 只安装生产依赖
RUN bun install --frozen-lockfile --production

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动应用
CMD ["bun", "run", "start"]

