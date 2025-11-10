"use server";

import { workflowRunQueue } from "./queue-client";
import { db } from "@/db/db";
import { workflowRunsTable, machinesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrementMachineQueue } from "@/server/machine/updateMachineStatus";

const STALE_JOB_TIMEOUT = 5 * 60 * 1000; // 5分钟

interface StaleJobResult {
    jobId: string;
    workflowRunId?: string;
    machineId?: string;
    machineName?: string;
    runningTime: number;
    action: "interrupted" | "failed" | "skipped";
    error?: string;
}

/**
 * 中断 ComfyUI 上的任务
 */
async function interruptComfyUIJob(machineUrl: string, workflowRunId: string): Promise<boolean> {
    try {
        const response = await fetch(`${machineUrl}/interrupt`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000), // 10秒超时
        });

        if (!response.ok) {
            console.error(`Failed to interrupt ComfyUI job: ${response.status}`);
            return false;
        }

        console.log(`✅ Successfully interrupted ComfyUI job for run ${workflowRunId}`);
        return true;
    } catch (error) {
        console.error(`Error interrupting ComfyUI job:`, error);
        return false;
    }
}

/**
 * 检查并清理超时的 active jobs
 */
export async function checkAndCleanStaleJobs(): Promise<{
    checked: number;
    cleaned: number;
    results: StaleJobResult[];
}> {
    console.log("\n🔍 [Stale Jobs] Starting stale jobs check...");

    const results: StaleJobResult[] = [];
    const now = Date.now();

    try {
        // 获取所有 active 的任务
        const activeJobs = await workflowRunQueue.getActive(0, 1000);
        console.log(`   Found ${activeJobs.length} active jobs`);

        if (activeJobs.length === 0) {
            return { checked: 0, cleaned: 0, results: [] };
        }

        for (const job of activeJobs) {
            try {
                const processedOn = job.processedOn || job.timestamp;
                const runningTime = now - processedOn;

                console.log(`   Job ${job.id}: running for ${Math.floor(runningTime / 1000)}s`);

                // 如果运行时间未超过5分钟，跳过
                if (runningTime < STALE_JOB_TIMEOUT) {
                    results.push({
                        jobId: job.id!,
                        runningTime,
                        action: "skipped",
                    });
                    continue;
                }

                console.log(`   ⚠️  Job ${job.id} is stale (running for ${Math.floor(runningTime / 1000)}s)`);

                // 获取 workflow_run_id 和 machine 信息
                let workflowRunId: string | undefined;
                let machineId: string | undefined;
                let machineName: string | undefined;
                let machineUrl: string | undefined;

                // 从任务数据中获取信息
                if (job.data && typeof job.data === "object") {
                    // 尝试从 job.returnvalue 获取 workflow_run_id
                    if (job.returnvalue && typeof job.returnvalue === "object") {
                        workflowRunId = (job.returnvalue as any).workflow_run_id;
                    }

                    // 如果有 workflow_run_id，从数据库获取 machine 信息
                    if (workflowRunId) {
                        const workflowRun = await db.query.workflowRunsTable.findFirst({
                            where: eq(workflowRunsTable.id, workflowRunId),
                            with: {
                                machine: true,
                            },
                        });

                        if (workflowRun?.machine) {
                            machineId = workflowRun.machine.id;
                            machineName = workflowRun.machine.name;
                            machineUrl = workflowRun.machine.comfyui_url;
                        }
                    }
                }

                // 尝试中断 ComfyUI 上的任务
                let interrupted = false;
                if (machineUrl && workflowRunId) {
                    console.log(`   Attempting to interrupt ComfyUI job on ${machineName}...`);
                    interrupted = await interruptComfyUIJob(machineUrl, workflowRunId);
                }

                // 标记任务为失败
                try {
                    await job.moveToFailed(
                        new Error(`Job exceeded timeout (${Math.floor(runningTime / 1000)}s > ${STALE_JOB_TIMEOUT / 1000}s). Marked as failed.`),
                        job.token || "",
                        true // fetchNext = true，处理下一个任务
                    );
                    console.log(`   ✅ Marked job ${job.id} as failed`);
                } catch (error) {
                    console.error(`   ❌ Failed to mark job as failed:`, error);
                }

                // 如果有 workflow_run_id，更新数据库中的状态
                if (workflowRunId) {
                    try {
                        await db
                            .update(workflowRunsTable)
                            .set({
                                status: "failed",
                                error_message: `Job exceeded timeout (${Math.floor(runningTime / 1000)}s). Forcefully terminated.`,
                                ended_at: new Date(),
                            })
                            .where(eq(workflowRunsTable.id, workflowRunId));
                        console.log(`   ✅ Updated workflow run ${workflowRunId} status to failed`);
                    } catch (error) {
                        console.error(`   ❌ Failed to update workflow run:`, error);
                    }
                }

                // 递减 machine 的队列计数
                if (machineId) {
                    try {
                        await decrementMachineQueue(machineId);
                        console.log(`   ✅ Decremented queue count for machine ${machineName}`);
                    } catch (error) {
                        console.error(`   ❌ Failed to decrement machine queue:`, error);
                    }
                }

                results.push({
                    jobId: job.id!,
                    workflowRunId,
                    machineId,
                    machineName,
                    runningTime,
                    action: interrupted ? "interrupted" : "failed",
                });

            } catch (error) {
                console.error(`   ❌ Error processing job ${job.id}:`, error);
                results.push({
                    jobId: job.id!,
                    runningTime: 0,
                    action: "skipped",
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
        }

        const cleanedCount = results.filter(r => r.action !== "skipped").length;
        console.log(`\n✅ [Stale Jobs] Check completed: ${activeJobs.length} checked, ${cleanedCount} cleaned\n`);

        return {
            checked: activeJobs.length,
            cleaned: cleanedCount,
            results,
        };

    } catch (error) {
        console.error("❌ [Stale Jobs] Error during stale jobs check:", error);
        throw error;
    }
}

