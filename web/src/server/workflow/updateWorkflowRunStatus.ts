"use server";

import { db } from "@/db/db";
import { workflowRunOutputs, workflowRunsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrementMachineQueue } from "@/server/machine/updateMachineStatus";

/**
 * 更新工作流运行状态的共享函数
 * 可以被 API 路由和其他 server actions 直接调用
 */
export async function updateWorkflowRunStatus(
    run_id: string,
    status?: "not-started" | "running" | "uploading" | "success" | "failed",
    output_data?: any,
) {
    // Handle output_data and status independently - they can both be present
    if (output_data) {
        try {
            await db.insert(workflowRunOutputs).values({
                run_id: run_id,
                data: output_data,
            });
        } catch (error) {
            console.error(`[update-run] Failed to save output data:`, error);
            throw error;
        }
    }

    if (status) {
        // 先查询当前状态，以便判断是否需要减少队列计数
        const workflowRun = await db.query.workflowRunsTable.findFirst({
            where: eq(workflowRunsTable.id, run_id),
            columns: {
                machine_id: true,
                status: true,
            },
        });

        if (!workflowRun) {
            throw new Error(`Workflow run not found: ${run_id}`);
        }

        const previousStatus = workflowRun?.status;
        const isCompleting =
            (status === "success" || status === "failed") &&
            previousStatus !== "success" &&
            previousStatus !== "failed";

        const endedAt = status === "success" || status === "failed" ? new Date() : null;

        await db
            .update(workflowRunsTable)
            .set({
                status: status,
                ended_at: endedAt,
            })
            .where(eq(workflowRunsTable.id, run_id));

        // 当任务完成（success或failed）时，减少机器的队列计数
        // 这确保队列计数在任务真正完成时才减少，而不是在worker启动任务时
        // 只在状态首次变为success/failed时减少，避免重复减少
        if (isCompleting && workflowRun?.machine_id) {
            await decrementMachineQueue(workflowRun.machine_id);
        }
    }
}

