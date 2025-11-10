import { db } from "@/db/db";
import {
  snapshotType,
  workflowAPIType,
  workflowTable,
  workflowType,
} from "@/db/schema";
import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import {
  createNewWorkflow,
  createNewWorkflowVersion,
} from "@/server/createNewWorkflow";
import { z, createRoute } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";

const route = createRoute({
  method: "post",
  path: "/workflow",
  tags: ["comfyui"],
  summary: "Upload workflow from ComfyUI",
  description:
    "This endpoints is specifically built for ComfyUI workflow upload.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            workflow_id: z.string().optional(),
            // Support both 'name' (from Python proxy) and 'workflow_name'
            name: z.string().min(1).optional(),
            workflow_name: z.string().min(1).optional(),
            // Support both 'workflow_json' (from Python proxy) and 'workflow'
            workflow_json: z.union([
              z.string().transform((str) => {
                try {
                  return JSON.parse(str);
                } catch {
                  return str;
                }
              }),
              workflowType,
            ]).optional(),
            workflow: workflowType.optional(),
            // Accept both string (JSON) and object for workflow_api
            workflow_api: z.union([
              z.string().transform((str) => {
                try {
                  return JSON.parse(str);
                } catch {
                  return str;
                }
              }),
              workflowAPIType,
            ]),
            // Make snapshot optional as ComfyUI plugin may not send it
            snapshot: snapshotType.optional(),
            // Additional fields from Python proxy
            machine_id: z.string().nullish(),  // Accept null, undefined, or string
          }).refine(
            (data) => data.name || data.workflow_name,
            {
              message: "Either 'name' or 'workflow_name' must be provided",
            }
          ).refine(
            (data) => data.workflow || data.workflow_json,
            {
              message: "Either 'workflow' or 'workflow_json' must be provided",
            }
          ),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            workflow_id: z.string(),
            version: z.string(),
          }),
        },
      },
      description: "Retrieve the output",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Error when uploading the workflow",
    },
    ...authError,
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const registerWorkflowUploadRoute = (app: App) => {
  app.openapi(route, async (c) => {
    const requestData = c.req.valid("json");

    // Support both field name formats
    const workflow = requestData.workflow || requestData.workflow_json;
    const workflow_api = requestData.workflow_api;
    const workflow_id_input = requestData.workflow_id;
    const workflow_name = requestData.workflow_name || requestData.name;
    const snapshot = requestData.snapshot;
    const machine_id = requestData.machine_id;

    const { org_id, user_id } = c.get("apiKeyTokenData")!;

    if (!user_id)
      return c.json(
        {
          error: "Invalid user_id",
        },
        {
          headers: corsHeaders,
          status: 500,
        },
      );

    let workflow_id = workflow_id_input;

    let version = -1;

    try {
      if ((!workflow_id || workflow_id.length === 0) && workflow_name) {
        // Create a new parent workflow
        const { workflow_id: _workflow_id, version: _version } =
          await createNewWorkflow({
            user_id: user_id,
            org_id: org_id,
            workflow_name: workflow_name,
            workflowData: {
              workflow,
              workflow_api,
              snapshot: snapshot || null,
            },
          });

        workflow_id = _workflow_id;
        version = _version;
      } else if (workflow_id) {
        const _workflow = await db
          .select()
          .from(workflowTable)
          .where(
            and(
              eq(workflowTable.id, workflow_id),
              eq(workflowTable.user_id, user_id),
              org_id
                ? eq(workflowTable.org_id, org_id)
                : isNull(workflowTable.org_id),
            ),
          );

        if (_workflow.length === 0) {
          return c.json(
            {
              error: "Invalid workflow_id",
            },
            {
              status: 500,
              statusText: "Invalid workflow_id",
              headers: corsHeaders,
            },
          );
        }

        // Case 2 update workflow
        const { version: _version } = await createNewWorkflowVersion({
          workflow_id: workflow_id,
          workflowData: {
            workflow,
            workflow_api,
            snapshot: snapshot || null,
          },
        });
        version = _version;
      } else {
        return c.json(
          {
            error: "Invalid request, missing either workflow_id or name",
          },
          {
            status: 500,
            statusText: "Invalid request",
            headers: corsHeaders,
          },
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        {
          error: errorMessage,
        },
        {
          statusText: "Invalid request",
          status: 500,
          headers: corsHeaders,
        },
      );
    }

    return c.json(
      {
        workflow_id: workflow_id,
        version: version,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
  });

  app.options("/workflow", async (c) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  });
};
