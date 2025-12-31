/**
 * 手动启动 Worker 的 API 路由
 * 用于调试或确保 worker 启动
 * 
 * 访问: GET /api/worker-start
 */

import { NextResponse } from "next/server";

// 强制动态渲染，避免在 build 时预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
    // 检查是否在 build 阶段
    const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
    if (isBuildPhase) {
        return NextResponse.json({
            success: false,
            message: "Cannot start worker during build phase",
        });
    }

    try {
        console.log("🔧 [API] Manual worker start requested");
        // 使用动态 import 避免在 build 时加载 worker 模块
        const { startWorker } = await import("@/worker/queue-worker-integrated");
        startWorker();
        return NextResponse.json({
            success: true,
            message: "Worker start requested. Check server logs for status.",
        });
    } catch (error) {
        console.error("❌ [API] Failed to start worker:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

