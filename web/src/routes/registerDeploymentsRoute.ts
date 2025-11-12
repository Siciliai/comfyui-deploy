import { db } from "@/db/db";
import { deploymentsTable, workflowTable } from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { createRoute, z } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";

// 生成 deployment 名称的辅助函数
function generateDeploymentName(
  workflowName: string,
  version: number,
  environment: string
): string {
  return `${workflowName} v${version} (${environment})`;
}

// 获取所有 deployments 的路由
const listDeploymentsRoute = createRoute({
  method: "get",
  path: "/deployments",
  tags: ["deployments"],
  summary: "List all deployments",
  description: "Get a list of all deployments for the authenticated user",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              workflow_id: z.string(),
              workflow_version_id: z.string(),
              workflow_name: z.string(),
              version: z.number(),
              environment: z.string(),
              machine_id: z.string().nullable(),
              machine_group_id: z.string().nullable(),
              share_slug: z.string().nullable(),
              description: z.string().nullable(),
              config: z.any().nullable(),
              created_at: z.string(),
              updated_at: z.string(),
            })
          ),
        },
      },
      description: "List of deployments",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Error fetching deployments",
    },
    ...authError,
  },
});

// 获取单个 deployment 的路由
const getDeploymentRoute = createRoute({
  method: "get",
  path: "/deployments/{deployment_id}",
  tags: ["deployments"],
  summary: "Get deployment details",
  description: "Get detailed information about a specific deployment",
  request: {
    params: z.object({
      deployment_id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            name: z.string(),
            workflow_id: z.string(),
            workflow_version_id: z.string(),
            workflow_name: z.string(),
            version: z.number(),
            environment: z.string(),
            machine_id: z.string().nullable(),
            machine_group_id: z.string().nullable(),
            share_slug: z.string().nullable(),
            description: z.string().nullable(),
            config: z.any().nullable(),
            created_at: z.string(),
            updated_at: z.string(),
            workflow: z.object({
              id: z.string(),
              name: z.string(),
            }).optional(),
            version_details: z.object({
              id: z.string(),
              version: z.number(),
            }).optional(),
            machine: z.any().nullable().optional(),
            machine_group: z.any().nullable().optional(),
          }),
        },
      },
      description: "Deployment details",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Deployment not found",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Error fetching deployment",
    },
    ...authError,
  },
});

export const registerDeploymentsRoute = (app: App) => {
  // 获取所有 deployments
  app.openapi(listDeploymentsRoute, async (c) => {
    const tokenData = c.get("apiKeyTokenData");

    if (!tokenData?.user_id) {
      return c.json(
        { error: "Invalid user_id" },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    try {
      const deployments = await db.query.deploymentsTable.findMany({
        where: tokenData.org_id
          ? eq(deploymentsTable.org_id, tokenData.org_id)
          : and(
              eq(deploymentsTable.user_id, tokenData.user_id),
              isNull(deploymentsTable.org_id)
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
              id: true,
              version: true,
            },
          },
        },
        orderBy: (deployments, { desc }) => [desc(deployments.created_at)],
      });

      const formattedDeployments = deployments.map((deployment) => ({
        id: deployment.id,
        name: generateDeploymentName(
          deployment.workflow.name,
          deployment.version.version,
          deployment.environment
        ),
        workflow_id: deployment.workflow_id,
        workflow_version_id: deployment.workflow_version_id,
        workflow_name: deployment.workflow.name,
        version: deployment.version.version,
        environment: deployment.environment,
        machine_id: deployment.machine_id,
        machine_group_id: deployment.machine_group_id,
        share_slug: deployment.share_slug,
        description: deployment.description,
        config: deployment.config,
        created_at: deployment.created_at.toISOString(),
        updated_at: deployment.updated_at.toISOString(),
      }));

      return c.json(formattedDeployments, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[registerDeploymentsRoute] Error listing deployments:", error);
      return c.json(
        { error: errorMessage },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
  });

  // 获取单个 deployment
  app.openapi(getDeploymentRoute, async (c) => {
    const { deployment_id } = c.req.valid("param");
    const tokenData = c.get("apiKeyTokenData");

    if (!tokenData?.user_id) {
      return c.json(
        { error: "Invalid user_id" },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    try {
      const deployment = await db.query.deploymentsTable.findFirst({
        where: and(
          eq(deploymentsTable.id, deployment_id),
          tokenData.org_id
            ? eq(deploymentsTable.org_id, tokenData.org_id)
            : and(
                eq(deploymentsTable.user_id, tokenData.user_id),
                isNull(deploymentsTable.org_id)
              )
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
              id: true,
              version: true,
            },
          },
          machine: true,
          machineGroup: true,
        },
      });

      if (!deployment) {
        return c.json(
          { error: "Deployment not found" },
          { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }

      const formattedDeployment = {
        id: deployment.id,
        name: generateDeploymentName(
          deployment.workflow.name,
          deployment.version.version,
          deployment.environment
        ),
        workflow_id: deployment.workflow_id,
        workflow_version_id: deployment.workflow_version_id,
        workflow_name: deployment.workflow.name,
        version: deployment.version.version,
        environment: deployment.environment,
        machine_id: deployment.machine_id,
        machine_group_id: deployment.machine_group_id,
        share_slug: deployment.share_slug,
        description: deployment.description,
        config: deployment.config,
        created_at: deployment.created_at.toISOString(),
        updated_at: deployment.updated_at.toISOString(),
        workflow: {
          id: deployment.workflow.id,
          name: deployment.workflow.name,
        },
        version_details: {
          id: deployment.version.id,
          version: deployment.version.version,
        },
        machine: deployment.machine,
        machine_group: deployment.machineGroup,
      };

      return c.json(formattedDeployment, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[registerDeploymentsRoute] Error getting deployment:", error);
      return c.json(
        { error: errorMessage },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
  });
};

