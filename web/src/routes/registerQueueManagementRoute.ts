import { db } from "@/db/db";
import { deploymentsTable } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import {
    getQueueJobs,
    getQueueStatus,
    removeJob,
    cleanQueue,
    cleanAllQueues,
    addJobToQueue,
} from "../server/queue/queue-client";

// 获取队列状态和任务列表
const queueListRoute = createRoute({
    method: "get",
    path: "/queue/list",
    tags: ["queue"],
    summary: "Get queue status and job list",
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        status: z.object({
                            waiting: z.number(),
                            active: z.number(),
                            completed: z.number(),
                            failed: z.number(),
                        }),
                        jobs: z.object({
                            waiting: z.array(z.any()),
                            active: z.array(z.any()),
                            completed: z.array(z.any()),
                            failed: z.array(z.any()),
                            delayed: z.array(z.any()),
                        }),
                    }),
                },
            },
            description: "Queue status and jobs retrieved successfully",
        },
        ...authError,
    },
});

// 取消任务
const queueRemoveRoute = createRoute({
    method: "delete",
    path: "/queue/job/{job_id}",
    tags: ["queue"],
    summary: "Remove a job from queue",
    request: {
        params: z.object({
            job_id: z.string(),
        }),
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                        message: z.string(),
                    }),
                },
            },
            description: "Job removed successfully",
        },
        ...authError,
    },
});

// 清空队列
const queueCleanRoute = createRoute({
    method: "post",
    path: "/queue/clean",
    tags: ["queue"],
    summary: "Clean queue by status",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        status: z.enum(["waiting", "active", "completed", "failed", "delayed", "all"]).optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                        cleaned: z.number(),
                        message: z.string(),
                        details: z.any().optional(),
                    }),
                },
            },
            description: "Queue cleaned successfully",
        },
        ...authError,
    },
});

// 手动添加任务到队列
const queueAddRoute = createRoute({
    method: "post",
    path: "/queue/add",
    tags: ["queue"],
    summary: "Manually add a job to queue",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        deployment_id: z.string(),
                        inputs: z.record(z.union([z.string(), z.number()])).optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        job_id: z.string(),
                        status: z.string(),
                        message: z.string(),
                    }),
                },
            },
            description: "Job added to queue successfully",
        },
        ...authError,
    },
});

export const registerQueueManagementRoute = (app: App) => {
    // 获取队列列表
    app.openapi(queueListRoute, async (c) => {
        const apiKeyTokenData = c.get("apiKeyTokenData")!;

        const status = await getQueueStatus();
        const jobs = await getQueueJobs();

        return c.json({
            status,
            jobs,
        });
    });

    // 取消任务
    app.openapi(queueRemoveRoute, async (c) => {
        const { job_id } = c.req.valid("param");
        const apiKeyTokenData = c.get("apiKeyTokenData")!;

        try {
            const result = await removeJob(job_id);
            return c.json(result);
        } catch (error) {
            return c.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Unknown error",
                },
                500,
            );
        }
    });

    // 清空队列
    app.openapi(queueCleanRoute, async (c) => {
        const data = c.req.valid("json");
        const apiKeyTokenData = c.get("apiKeyTokenData")!;

        try {
            let result;
            if (data.status === "all") {
                result = await cleanAllQueues();
            } else {
                result = await cleanQueue(data.status || "waiting");
            }
            return c.json(result);
        } catch (error) {
            return c.json(
                {
                    success: false,
                    message: error instanceof Error ? error.message : "Unknown error",
                },
                500,
            );
        }
    });

    // 手动添加任务
    app.openapi(queueAddRoute, async (c) => {
        const data = c.req.valid("json");
        const apiKeyTokenData = c.get("apiKeyTokenData")!;

        // 验证deployment存在
        const deployment = await db.query.deploymentsTable.findFirst({
            where: eq(deploymentsTable.id, data.deployment_id),
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
            return c.json({ error: "Deployment not found" }, 404);
        }

        // 权限检查
        if (apiKeyTokenData.org_id) {
            if (apiKeyTokenData.org_id !== deployment.version.workflow.org_id) {
                return c.json({ error: "Unauthorized" }, 403);
            }
        } else {
            if (
                apiKeyTokenData.user_id !== deployment.version.workflow.user_id &&
                deployment.version.workflow.org_id == null
            ) {
                return c.json({ error: "Unauthorized" }, 403);
            }
        }

        const proto = c.req.headers.get("x-forwarded-proto") || "http";
        const host = c.req.headers.get("x-forwarded-host") || c.req.headers.get("host");
        const origin = `${proto}://${host}`;

        // 加入队列
        const job = await addJobToQueue({
            deployment_id: data.deployment_id,
            inputs: data.inputs,
            origin,
            apiUser: apiKeyTokenData.user_id
                ? {
                    user_id: apiKeyTokenData.user_id,
                    org_id: apiKeyTokenData.org_id || undefined,
                }
                : undefined,
        });

        return c.json({
            job_id: job.id!,
            status: "queued",
            message: "Job added to queue successfully",
        });
    });
};

