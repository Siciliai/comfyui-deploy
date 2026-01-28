"use server";

import { getQueueJobs, getQueueStatus, removeJob, cleanQueue, cleanAllQueues, addJobToQueue } from "./queue-client";
import { db } from "@/db/db";
import { deploymentsTable, workflowRunsTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, isNull, desc, gte, sql, isNotNull } from "drizzle-orm";
import "server-only";

/**
 * 获取队列状态和任务列表（Server Action）
 */
export async function getQueueData() {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const status = await getQueueStatus();
    const jobs = await getQueueJobs();

    // 如果启用了事件驱动调度，也获取 workflow_runs 的统计数据
    let eventDrivenStats = null;
    if (process.env.USE_EVENT_DRIVEN_SCHEDULER === "true") {
        eventDrivenStats = await getEventDrivenStats();
    }

    return {
        status,
        jobs,
        eventDrivenStats,
        isEventDrivenMode: process.env.USE_EVENT_DRIVEN_SCHEDULER === "true",
    };
}

/**
 * 获取事件驱动模式下的任务统计（从 workflow_runs 表）
 */
async function getEventDrivenStats() {
    // 获取最近 24 小时内通过队列创建的任务统计
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 获取统计数据
    const stats = await db
        .select({
            status: workflowRunsTable.status,
            count: sql<number>`count(*)::int`,
        })
        .from(workflowRunsTable)
        .where(
            and(
                isNotNull(workflowRunsTable.queue_job_id),
                gte(workflowRunsTable.created_at, oneDayAgo)
            )
        )
        .groupBy(workflowRunsTable.status);

    // 转换为对象格式
    const statusCounts: Record<string, number> = {
        "not-started": 0,
        running: 0,
        success: 0,
        failed: 0,
    };
    for (const stat of stats) {
        statusCounts[stat.status] = stat.count;
    }

    // 获取最近的任务列表
    const recentRuns = await db.query.workflowRunsTable.findMany({
        where: and(
            isNotNull(workflowRunsTable.queue_job_id),
            gte(workflowRunsTable.created_at, oneDayAgo)
        ),
        orderBy: [desc(workflowRunsTable.created_at)],
        limit: 50,
        columns: {
            id: true,
            status: true,
            queue_job_id: true,
            created_at: true,
            started_at: true,
            ended_at: true,
            workflow_id: true,
        },
    });

    return {
        stats: statusCounts,
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        recentRuns: recentRuns.map(run => ({
            id: run.id,
            status: run.status,
            queue_job_id: run.queue_job_id,
            created_at: run.created_at.toISOString(),
            started_at: run.started_at?.toISOString() || null,
            ended_at: run.ended_at?.toISOString() || null,
            workflow_id: run.workflow_id,
        })),
    };
}

/**
 * 取消任务（Server Action）
 */
export async function removeQueueJob(jobId: string) {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    return await removeJob(jobId);
}

/**
 * 清空队列（Server Action）
 */
export async function cleanQueueAction(status?: "waiting" | "active" | "completed" | "failed" | "delayed" | "all") {
    const { userId } = await auth();
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
    const { userId, orgId } = await auth();
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

