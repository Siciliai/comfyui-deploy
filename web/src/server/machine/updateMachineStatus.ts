import { db } from "@/db/db";
import { machinesTable } from "@/db/schema";
import { eq, sql, and, lte } from "drizzle-orm";

/**
 * 原子性地增加机器队列计数（带限制检查）
 * 返回是否成功增加（如果队列已满则返回false）
 */
export async function incrementMachineQueue(
    machineId: string,
    maxQueueSize?: number
): Promise<boolean> {
    if (maxQueueSize !== undefined) {
        // 原子性地检查并更新：只在队列未满时增加
        const result = await db
            .update(machinesTable)
            .set({
                current_queue_size: sql`${machinesTable.current_queue_size} + 1`,
                operational_status: "busy",
            })
            .where(
                and(
                    eq(machinesTable.id, machineId),
                    lte(machinesTable.current_queue_size, maxQueueSize - 1)
                )
            )
            .returning({ updated_queue_size: machinesTable.current_queue_size });

        return result.length > 0;
    } else {
        // 无限制，直接增加
        await db
            .update(machinesTable)
            .set({
                current_queue_size: sql`${machinesTable.current_queue_size} + 1`,
                operational_status: "busy",
            })
            .where(eq(machinesTable.id, machineId));
        return true;
    }
}

export async function decrementMachineQueue(machineId: string) {
    await db
        .update(machinesTable)
        .set({
            current_queue_size: sql`GREATEST(0, ${machinesTable.current_queue_size} - 1)`,
            operational_status: sql`
        CASE 
          WHEN ${machinesTable.current_queue_size} - 1 <= 0 THEN 'idle'
          ELSE 'busy'
        END
      `,
        })
        .where(eq(machinesTable.id, machineId));
}

export async function syncMachineQueueSize(
    machineId: string,
    actualSize: number,
) {
    await db
        .update(machinesTable)
        .set({
            current_queue_size: actualSize,
            operational_status: actualSize > 0 ? "busy" : "idle",
        })
        .where(eq(machinesTable.id, machineId));
}

export async function setMachineIdle(machineId: string) {
    await db
        .update(machinesTable)
        .set({
            operational_status: "idle",
            current_queue_size: 0,
        })
        .where(eq(machinesTable.id, machineId));
}

export async function setMachineBusy(machineId: string) {
    await db
        .update(machinesTable)
        .set({
            operational_status: "busy",
        })
        .where(eq(machinesTable.id, machineId));
}

