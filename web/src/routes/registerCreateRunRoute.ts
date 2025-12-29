import { db } from "@/db/db";
import { deploymentsTable } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { createRun } from "../server/createRun";

// 启动时打印环境变量（用于调试）
console.log(`\n🔧 [registerCreateRunRoute] Environment variables at module load:`);
console.log(`   API_URL = "${process.env.API_URL || '(not set)'}"`);
console.log(`   NEXT_PUBLIC_APP_URL = "${process.env.NEXT_PUBLIC_APP_URL || '(not set)'}"`);
console.log(``);

const createRunRoute = createRoute({
  method: "post",
  path: "/run",
  tags: ["workflows"],
  summary: "Run a workflow via deployment_id",
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
            run_id: z.string(),
          }),
        },
      },
      description: "Workflow queued",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Error creating run",
    },
    ...authError,
  },
});

export const registerCreateRunRoute = (app: App) => {
  app.openapi(createRunRoute, async (c) => {
    const data = c.req.valid("json");
    // 使用 API_URL 环境变量作为回调地址
    const origin = process.env.API_URL || "http://localhost:3000";
    const apiKeyTokenData = c.get("apiKeyTokenData")!;

    const { deployment_id, inputs } = data;

    try {
      const deploymentData = await db.query.deploymentsTable.findFirst({
        where: eq(deploymentsTable.id, deployment_id),
        with: {
          machine: true,
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

      if (!deploymentData) throw new Error("Deployment not found");

      // 检查是否有 machine_id，如果没有则抛出错误（因为 createRun 需要 machine）
      if (!deploymentData.machine_id) {
        throw new Error("Deployment must have a machine_id to create a run. Machine group deployments are not supported for API runs.");
      }

      const run_id = await createRun({
        origin,
        workflow_version_id: deploymentData.version,
        machine_id: deploymentData.machine_id,
        inputs,
        runOrigin: "api",
        apiUser: apiKeyTokenData,
      });

      if ("error" in run_id) throw new Error(run_id.error);

      return c.json({
        run_id: "workflow_run_id" in run_id ? run_id.workflow_run_id : "",
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        {
          error: errorMessage,
        },
        {
          status: 500,
        },
      );
    }
  });
};
