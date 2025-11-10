/**
 * 后台定时清理 stale jobs
 */

import { checkAndCleanStaleJobs } from "./checkStaleJobs";

let staleJobsInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const CHECK_INTERVAL = 60 * 1000; // 每1分钟检查一次

/**
 * 启动定时清理
 */
export function startStaleJobsChecker() {
    if (isRunning) {
        console.log("⚠️  [Stale Jobs Checker] Already running");
        return { success: false, message: "Stale jobs checker is already running" };
    }

    console.log("🚀 [Stale Jobs Checker] Starting...");

    // 立即执行一次
    checkAndCleanStaleJobs().catch(error => {
        console.error("❌ [Stale Jobs Checker] Error during check:", error);
    });

    // 设置定时任务
    staleJobsInterval = setInterval(() => {
        checkAndCleanStaleJobs().catch(error => {
            console.error("❌ [Stale Jobs Checker] Error during check:", error);
        });
    }, CHECK_INTERVAL);

    isRunning = true;
    console.log(`✅ [Stale Jobs Checker] Started (checking every ${CHECK_INTERVAL / 1000}s)`);

    return { success: true, message: "Stale jobs checker started" };
}

/**
 * 停止定时清理
 */
export function stopStaleJobsChecker() {
    if (!isRunning) {
        console.log("⚠️  [Stale Jobs Checker] Not running");
        return { success: false, message: "Stale jobs checker is not running" };
    }

    if (staleJobsInterval) {
        clearInterval(staleJobsInterval);
        staleJobsInterval = null;
    }

    isRunning = false;
    console.log("✅ [Stale Jobs Checker] Stopped");

    return { success: true, message: "Stale jobs checker stopped" };
}

/**
 * 获取状态
 */
export function getStaleJobsCheckerStatus() {
    return {
        isRunning,
        checkInterval: CHECK_INTERVAL,
    };
}

