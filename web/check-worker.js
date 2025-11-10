#!/usr/bin/env node

/**
 * 简单的 Worker 检查脚本
 * 用于检查 worker 是否正在运行
 */

const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
});

async function checkWorker() {
    console.log("=".repeat(60));
    console.log("🔍 Checking Queue Worker Status...");
    console.log("=".repeat(60));
    console.log(`Redis URL: ${redisUrl}\n`);

    try {
        // 检查 Redis 连接
        console.log("1. Checking Redis connection...");
        await redis.ping();
        console.log("   ✅ Redis is connected\n");

        // 检查队列状态
        console.log("2. Checking queue status...");
        const Queue = require("bullmq").Queue;
        const queue = new Queue("workflow-run-queue", { connection: redis });

        const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
        ]);

        console.log(`   Waiting: ${waiting}`);
        console.log(`   Active: ${active}`);
        console.log(`   Completed: ${completed}`);
        console.log(`   Failed: ${failed}\n`);

        // 检查是否有 worker 在运行
        console.log("3. Checking for active workers...");
        const workers = await queue.getWorkers();
        
        if (workers && workers.length > 0) {
            console.log(`   ✅ Found ${workers.length} worker(s) running:`);
            workers.forEach((worker, index) => {
                console.log(`      Worker ${index + 1}: ${worker.name || worker.id || "Unknown"}`);
            });
        } else {
            console.log("   ⚠️  No active workers found!");
            console.log("   💡 To start the worker, run: bun run worker");
        }

        await queue.close();
        await redis.quit();

        console.log("\n" + "=".repeat(60));
        console.log("✅ Check completed");
        console.log("=".repeat(60));
    } catch (error) {
        console.error("\n❌ Error checking worker status:");
        console.error(error.message);
        console.error("\n💡 Make sure:");
        console.error("   1. Redis is running (docker-compose up redis)");
        console.error("   2. REDIS_URL environment variable is set correctly");
        process.exit(1);
    }
}

checkWorker();

