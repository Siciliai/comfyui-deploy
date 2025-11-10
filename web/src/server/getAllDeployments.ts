"use server";

import { db } from "@/db/db";
import { deploymentsTable, workflowTable } from "@/db/schema";
import { auth } from "@clerk/nextjs";
import { and, eq, isNull } from "drizzle-orm";
import "server-only";

/**
 * 获取用户或组织的所有部署
 */
export async function getAllDeployments() {
    const { userId, orgId } = auth();
    if (!userId) throw new Error("No user id");

    const deployments = await db.query.deploymentsTable.findMany({
        where: orgId
            ? eq(deploymentsTable.org_id, orgId)
            : and(
                eq(deploymentsTable.user_id, userId),
                isNull(deploymentsTable.org_id),
            ),
        with: {
            workflow: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            version: {
                columns: {
                    version: true,
                },
            },
            machine: {
                columns: {
                    name: true,
                },
            },
            machineGroup: {
                columns: {
                    name: true,
                },
            },
        },
        orderBy: (deployments, { desc }) => [desc(deployments.updated_at)],
    });

    return deployments.map((dep) => ({
        id: dep.id,
        name: `${dep.workflow.name} - ${dep.environment} (v${dep.version.version})`,
        workflow_id: dep.workflow.id,
        environment: dep.environment,
        machine_name: dep.machine?.name || dep.machineGroup?.name || "N/A",
    }));
}

