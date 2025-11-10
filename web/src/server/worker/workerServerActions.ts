"use server";

import { auth } from "@clerk/nextjs";
import { initializeWorkerAndChecker, stopWorkerAndChecker, getInitializationStatus } from "../initWorker";

/**
 * 手动启动 Worker
 */
export async function startWorkerAction() {
    const { userId } = auth();
    if (!userId) {
        throw new Error("Unauthorized");
    }

    try {
        await initializeWorkerAndChecker();
        return {
            success: true,
            message: "Worker 启动请求已发送，请查看服务器日志确认状态",
        };
    } catch (error) {
        console.error("[startWorkerAction] Error:", error);
        throw new Error(error instanceof Error ? error.message : "启动 Worker 失败");
    }
}

/**
 * 手动停止 Worker
 * 默认使用强制停止，立即停止 worker 和正在处理的任务
 */
export async function stopWorkerAction(force: boolean = true) {
    const { userId } = auth();
    if (!userId) {
        throw new Error("Unauthorized");
    }

    try {
        const result = await stopWorkerAndChecker(force);
        return {
            success: true,
            message: `Worker 停止完成：${result.stoppedWorker ? "Worker 已停止" : "Worker 未运行"}${force ? " (强制停止)" : ""}`,
            ...result,
        };
    } catch (error) {
        console.error("[stopWorkerAction] Error:", error);
        throw new Error(error instanceof Error ? error.message : "停止 Worker 失败");
    }
}

/**
 * 获取 Worker 状态
 */
export async function getWorkerStatusAction() {
    const { userId } = auth();
    if (!userId) {
        throw new Error("Unauthorized");
    }

    try {
        const status = getInitializationStatus();
        return {
            success: true,
            status,
        };
    } catch (error) {
        console.error("[getWorkerStatusAction] Error:", error);
        throw new Error(error instanceof Error ? error.message : "获取 Worker 状态失败");
    }
}


