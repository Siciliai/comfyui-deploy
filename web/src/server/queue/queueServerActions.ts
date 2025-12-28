"use server";

import { getQueueJobs, getQueueStatus, removeJob, cleanQueue, cleanAllQueues, addJobToQueue } from "./queue-client";
import { db } from "@/db/db";
import { deploymentsTable } from "@/db/schema";
import { auth } from "@clerk/nextjs";
import { eq, and, isNull } from "drizzle-orm";
import "server-only";

/**
 * 获取队列状态和任务列表（Server Action）
 */
export async function getQueueData() {
    const { userId } = auth();
    if (!userId) throw new Error("Unauthorized");

    const status = await getQueueStatus();
    const jobs = await getQueueJobs();

    return {
        status,
        jobs,
    };
}

/**
 * 取消任务（Server Action）
 */
export async function removeQueueJob(jobId: string) {
    const { userId } = auth();
    if (!userId) throw new Error("Unauthorized");

    return await removeJob(jobId);
}

/**
 * 清空队列（Server Action）
 */
export async function cleanQueueAction(status?: "waiting" | "active" | "completed" | "failed" | "delayed" | "all") {
    const { userId } = auth();
    if (!userId) throw new Error("Unauthorized");

    if (status === "all") {
        return await cleanAllQueues();
    } else {
        return await cleanQueue(status || "waiting");
    }
}

/**
 * 添加任务到队列（Server Action）
 */
export async function addJobToQueueAction(deploymentId: string, inputs?: Record<string, string | number>) {
    const { userId, orgId } = auth();
    if (!userId) throw new Error("Unauthorized");

    // 验证 deployment 存在且有权限
    const deployment = await db.query.deploymentsTable.findFirst({
        where: eq(deploymentsTable.id, deploymentId),
        with: {
            version: {
                with: {
                    workflow: {
                        columns: {
                            org_id: true,
                            user_id: true,
                        },
                    },
                },
            },
        },
    });

    if (!deployment) {
        throw new Error("Deployment not found");
    }

    // 权限检查
    if (orgId) {
        if (orgId !== deployment.version.workflow.org_id) {
            throw new Error("Unauthorized");
        }
    } else {
        if (
            userId !== deployment.version.workflow.user_id &&
            deployment.version.workflow.org_id == null
        ) {
            throw new Error("Unauthorized");
        }
    }

    // 获取 origin（从环境变量 API_URL 获取）
    const origin = process.env.API_URL || "http://localhost:3000";

    const job = await addJobToQueue({
        deployment_id: deploymentId,
        inputs,
        origin,
        apiUser: {
            user_id: userId,
            org_id: orgId || undefined,
        },
    });

    return {
        job_id: job.id!,
        status: "queued",
        message: "Job added to queue successfully",
    };
}

