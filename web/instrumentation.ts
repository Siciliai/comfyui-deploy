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
 * 默认行为（所有选项默认为 true）：
 * - 应用启动时会自动启动 Queue Worker 和 Notification Worker
 * 
 * 如需禁用，设置以下环境变量为 false：
 * - AUTO_START_WORKERS=false      禁用自动启动（改为手动通过 UI 按钮启动）
 * - ENABLE_WORKER_IN_NEXTJS=false 禁用 Queue Worker
 * - ENABLE_NOTIFICATION_WORKER_IN_NEXTJS=false 禁用 Notification Worker
 */

// 全局变量来跟踪 instrumentation 是否已执行
declare global {
    var instrumentationExecuted: boolean | undefined;
    var instrumentationTimestamp: string | undefined;
    var workerInitialized: boolean | undefined;
    var notificationWorkerInitialized: boolean | undefined;
}

export async function register() {
    // 标记 instrumentation 已执行
    global.instrumentationExecuted = true;
    global.instrumentationTimestamp = new Date().toISOString();

    // 默认值都为 true，除非明确设置为 false
    const autoStart = process.env.AUTO_START_WORKERS !== 'false';
    const enableWorker = process.env.ENABLE_WORKER_IN_NEXTJS !== 'false';
    const enableNotificationWorker = process.env.ENABLE_NOTIFICATION_WORKER_IN_NEXTJS !== 'false';

    console.log('[INSTRUMENTATION] register() called');
    console.log(`[INSTRUMENTATION] AUTO_START_WORKERS = ${autoStart} (env: ${process.env.AUTO_START_WORKERS || 'not set, default true'})`);
    console.log(`[INSTRUMENTATION] ENABLE_WORKER_IN_NEXTJS = ${enableWorker} (env: ${process.env.ENABLE_WORKER_IN_NEXTJS || 'not set, default true'})`);
    console.log(`[INSTRUMENTATION] ENABLE_NOTIFICATION_WORKER_IN_NEXTJS = ${enableNotificationWorker} (env: ${process.env.ENABLE_NOTIFICATION_WORKER_IN_NEXTJS || 'not set, default true'})`);

    if (!autoStart) {
        console.log('[INSTRUMENTATION] Auto-initialization disabled (AUTO_START_WORKERS set to false)');
        console.log('[INSTRUMENTATION] Worker and Notification Worker can be started manually via UI button');
        return;
    }

    // 检查是否在 Serverless 环境中
    const isServerless = !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerless) {
        console.log('[INSTRUMENTATION] Skipping auto-start in serverless environment');
        return;
    }

    console.log('[INSTRUMENTATION] Auto-start enabled, initializing workers...');

    // 延迟一小段时间确保 Next.js 完全启动
    setTimeout(async () => {
        try {
            // 启动 Queue Worker
            if (enableWorker) {
                console.log('[INSTRUMENTATION] Starting Queue Worker...');
                const { startWorker } = await import('./src/worker/queue-worker-integrated');
                startWorker();
                global.workerInitialized = true;
                console.log('[INSTRUMENTATION] ✅ Queue Worker started');
            } else {
                console.log('[INSTRUMENTATION] Queue Worker disabled (ENABLE_WORKER_IN_NEXTJS set to false)');
            }

            // 启动 Notification Worker
            if (enableNotificationWorker) {
                console.log('[INSTRUMENTATION] Starting Notification Worker...');
                const { startNotificationWorker } = await import('./src/worker/notification-worker-integrated');
                startNotificationWorker();
                global.notificationWorkerInitialized = true;
                console.log('[INSTRUMENTATION] ✅ Notification Worker started');
            } else {
                console.log('[INSTRUMENTATION] Notification Worker disabled (ENABLE_NOTIFICATION_WORKER_IN_NEXTJS set to false)');
            }

            console.log('[INSTRUMENTATION] ✅ Auto-initialization completed');
        } catch (error) {
            console.error('[INSTRUMENTATION] ❌ Error during auto-initialization:', error);
        }
    }, 2000); // 延迟 2 秒启动，确保 Next.js 完全就绪
}

