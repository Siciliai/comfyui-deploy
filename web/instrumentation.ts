/**
 * Next.js Instrumentation Hook
 * 
 * 此文件会在 Next.js 服务器启动时自动执行
 * 用于启动集成在 Next.js 中的 worker
 * 
 * 注意：
 * 1. 此实现主要用于开发环境或特定部署场景
 * 2. 生产环境建议使用独立的 worker 进程
 * 3. Serverless 环境（Vercel/Netlify）不支持，会自动跳过
 * 
 * 使用方法：
 * 1. 设置环境变量 ENABLE_WORKER_IN_NEXTJS=true 来启用
 * 2. 或者删除此文件，使用独立的 worker 进程
 */

// 全局变量来跟踪 instrumentation 是否已执行
declare global {
    var instrumentationExecuted: boolean | undefined;
    var instrumentationTimestamp: string | undefined;
}

export async function register() {
    // 标记 instrumentation 已执行（但不执行任何初始化）
    global.instrumentationExecuted = true;
    global.instrumentationTimestamp = new Date().toISOString();

    // 禁用自动初始化 - 现在只在手动点击 "启动 Worker" 按钮时初始化
    console.log('[INSTRUMENTATION] register() called - Auto-initialization disabled');
    console.log('[INSTRUMENTATION] Worker and Stale Run Checker will be initialized manually via UI button');

    // 不再执行任何自动初始化逻辑
    return;
}

