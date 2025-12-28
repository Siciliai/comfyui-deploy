"use server";

import { auth } from "@/lib/auth";
import { checkAndCleanStaleJobs } from "./checkStaleJobs";
import {
    startStaleJobsChecker,
    stopStaleJobsChecker,
    getStaleJobsCheckerStatus
} from "./staleJobsChecker";
import "server-only";

/**
 * 手动触发清理 stale jobs
 */
export async function cleanStaleJobsAction() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = await checkAndCleanStaleJobs();

    return {
        success: true,
        message: `Checked ${result.checked} jobs, cleaned ${result.cleaned} stale jobs`,
        ...result,
    };
}

/**
 * 启动定时清理
 */
export async function startStaleJobsCheckerAction() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = startStaleJobsChecker();
    return result;
}

/**
 * 停止定时清理
 */
export async function stopStaleJobsCheckerAction() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = stopStaleJobsChecker();
    return result;
}

/**
 * 获取定时清理状态
 */
export async function getStaleJobsCheckerStatusAction() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const status = getStaleJobsCheckerStatus();
    return status;
}

