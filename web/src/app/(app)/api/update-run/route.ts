import { parseDataSafe } from "../../../../lib/parseDataSafe";
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateWorkflowRunStatus } from "@/server/workflow/updateWorkflowRunStatus";

const Request = z.object({
  run_id: z.string(),
  status: z
    .enum(["not-started", "running", "uploading", "success", "failed"])
    .optional(),
  output_data: z.any().optional(),
});

export async function POST(request: Request) {
  try {
    const [data, error] = await parseDataSafe(Request, request);
    if (!data || error) {
      return error;
    }

    const { run_id, status, output_data } = data;

    console.log(`[update-run] run_id: ${run_id}, status: ${status || "none"}`);

    await updateWorkflowRunStatus(run_id, status, output_data);

    return NextResponse.json(
      {
        message: "success",
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(`[update-run] Error:`, error);
    throw error;
  }
}
