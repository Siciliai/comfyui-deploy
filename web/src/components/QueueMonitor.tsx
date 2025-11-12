"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Trash2, Plus, X, AlertTriangle, Play, Square, Wrench, Info } from "lucide-react";
import { toast } from "sonner";
import { getRelativeTime } from "@/lib/getRelativeTime";
import { getAllDeployments } from "@/server/getAllDeployments";
import {
    getQueueData,
    removeQueueJob,
    cleanQueueAction,
    addJobToQueueAction,
} from "@/server/queue/queueServerActions";
import {
    startWorkerAction,
    stopWorkerAction,
    getWorkerStatusAction,
} from "@/server/worker/workerServerActions";
import {
    cleanStaleJobsAction,
    startStaleJobsCheckerAction,
    stopStaleJobsCheckerAction,
    getStaleJobsCheckerStatusAction,
} from "@/server/queue/staleJobsServerActions";
import { callServerPromise } from "@/components/callServerPromise";

interface QueueStatus {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}

interface QueueJob {
    id: string;
    name: string;
    data: {
        deployment_id: string;
        inputs?: Record<string, string | number>;
    };
    state: string;
    progress: any;
    timestamp: string;
    processedOn: string | null;
    finishedOn: string | null;
    failedReason?: string;
    returnvalue?: any;
    workflow_id?: string; // 添加 workflow_id 字段
}

interface QueueData {
    status: QueueStatus;
    jobs: {
        waiting: QueueJob[];
        active: QueueJob[];
        completed: QueueJob[];
        failed: QueueJob[];
        delayed: QueueJob[];
    };
}

interface WorkerStatus {
    worker: {
        enabled: boolean;
        initialized: boolean;
        serverless: boolean;
        message: string;
    };
    environment: {
        nodeEnv: string;
        isServerless: boolean;
        redisUrl: string;
        workerConcurrency: string;
    };
}

export function QueueMonitor() {
    const [data, setData] = useState<QueueData | null>(null);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [addJobOpen, setAddJobOpen] = useState(false);
    const [deployments, setDeployments] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedDeployment, setSelectedDeployment] = useState<string>("");
    const [inputs, setInputs] = useState<string>("");
    const [startingWorker, setStartingWorker] = useState(false);
    const [stoppingWorker, setStoppingWorker] = useState(false);
    const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);

    // Stale jobs checker state
    const [cleaningStaleJobs, setCleaningStaleJobs] = useState(false);
    const [staleJobsCheckerRunning, setStaleJobsCheckerRunning] = useState(false);
    const [startingStaleChecker, setStartingStaleChecker] = useState(false);
    const [stoppingStaleChecker, setStoppingStaleChecker] = useState(false);

    // 获取队列数据
    const fetchQueueData = async () => {
        try {
            const queueData = await callServerPromise(getQueueData());
            setData(queueData);
        } catch (error) {
            console.error("Error fetching queue data:", error);
            toast.error("获取队列数据失败");
        } finally {
            setLoading(false);
        }
    };

    // 获取部署列表
    const fetchDeployments = async () => {
        try {
            const deps = await getAllDeployments();
            setDeployments(deps);
        } catch (error) {
            console.error("Error fetching deployments:", error);
            toast.error("获取部署列表失败");
        }
    };

    // 获取 Worker 状态
    const fetchWorkerStatus = async () => {
        try {
            const result = await callServerPromise(getWorkerStatusAction());
            if (result?.status) {
                setWorkerStatus(result.status);
            }
        } catch (error) {
            console.error("Error fetching worker status:", error);
        }
    };

    // 获取 Stale Jobs Checker 状态
    const fetchStaleJobsCheckerStatus = async () => {
        try {
            const status = await callServerPromise(getStaleJobsCheckerStatusAction());
            if (status) {
                setStaleJobsCheckerRunning(status.isRunning);
            }
        } catch (error) {
            console.error("Error fetching stale jobs checker status:", error);
        }
    };

    useEffect(() => {
        fetchQueueData();
        fetchDeployments();
        fetchWorkerStatus();
        fetchStaleJobsCheckerStatus();
    }, []);

    // 自动刷新
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchQueueData();
            fetchWorkerStatus();
            fetchStaleJobsCheckerStatus();
        }, 5000); // 每5秒刷新一次

        return () => clearInterval(interval);
    }, [autoRefresh]);

    // 取消任务
    const handleRemoveJob = async (jobId: string) => {
        if (!confirm("确定要取消这个任务吗？")) return;

        try {
            await callServerPromise(removeQueueJob(jobId));
            toast.success("任务已取消");
            fetchQueueData();
        } catch (error) {
            console.error("Error removing job:", error);
            toast.error(error instanceof Error ? error.message : "取消任务失败");
        }
    };

    // 清空队列
    const handleCleanQueue = async (status?: string) => {
        const message = status === "all"
            ? "确定要清空所有队列吗？这将删除所有等待、进行中、已完成和失败的任务。"
            : `确定要清空 ${status || "等待中"} 的队列吗？`;

        if (!confirm(message)) return;

        try {
            const result = await callServerPromise(
                cleanQueueAction(status as any || "waiting")
            );
            if (result) {
                toast.success(result.message || "队列已清空");
                fetchQueueData();
            }
        } catch (error) {
            console.error("Error cleaning queue:", error);
            toast.error(error instanceof Error ? error.message : "清空队列失败");
        }
    };

    // 添加任务
    const handleAddJob = async () => {
        if (!selectedDeployment) {
            toast.error("请选择部署");
            return;
        }

        try {
            let parsedInputs: Record<string, string | number> | undefined;
            if (inputs.trim()) {
                try {
                    parsedInputs = JSON.parse(inputs);
                } catch {
                    toast.error("输入的 JSON 格式不正确");
                    return;
                }
            }

            const result = await callServerPromise(
                addJobToQueueAction(selectedDeployment, parsedInputs)
            );
            if (result) {
                toast.success(`任务已添加到队列: ${result.job_id}`);
                setAddJobOpen(false);
                setSelectedDeployment("");
                setInputs("");
                fetchQueueData();
            }
        } catch (error) {
            console.error("Error adding job:", error);
            toast.error(error instanceof Error ? error.message : "添加任务失败");
        }
    };

    // 手动启动 Worker
    const handleStartWorker = async () => {
        setStartingWorker(true);
        try {
            const result = await callServerPromise(startWorkerAction());
            if (result) {
                toast.success(result.message || "Worker 启动请求已发送");
                // 刷新状态
                await fetchWorkerStatus();
            }
        } catch (error) {
            console.error("Error starting worker:", error);
            toast.error(error instanceof Error ? error.message : "启动 Worker 失败");
        } finally {
            setStartingWorker(false);
        }
    };

    // 手动停止 Worker
    const handleStopWorker = async () => {
        if (!confirm("确定要停止 Worker 吗？")) {
            return;
        }

        setStoppingWorker(true);
        try {
            const result = await callServerPromise(stopWorkerAction());
            if (result) {
                toast.success(result.message || "Worker 已停止");
                // 刷新状态
                await fetchWorkerStatus();
            }
        } catch (error) {
            console.error("Error stopping worker:", error);
            toast.error(error instanceof Error ? error.message : "停止 Worker 失败");
        } finally {
            setStoppingWorker(false);
        }
    };

    // 手动清理 Stale Jobs
    const handleCleanStaleJobs = async () => {
        setCleaningStaleJobs(true);
        try {
            const result = await callServerPromise(cleanStaleJobsAction());
            if (result) {
                toast.success(result.message || "Stale jobs 清理完成");
                // 刷新队列数据
                fetchQueueData();
            }
        } catch (error) {
            console.error("Error cleaning stale jobs:", error);
            toast.error(error instanceof Error ? error.message : "清理 stale jobs 失败");
        } finally {
            setCleaningStaleJobs(false);
        }
    };

    // 启动 Stale Jobs Checker
    const handleStartStaleChecker = async () => {
        setStartingStaleChecker(true);
        try {
            const result = await callServerPromise(startStaleJobsCheckerAction());
            if (result && result.success) {
                toast.success(result.message || "定时清理已启动");
                await fetchStaleJobsCheckerStatus();
            } else if (result) {
                toast.warning(result.message || "定时清理已在运行");
            }
        } catch (error) {
            console.error("Error starting stale checker:", error);
            toast.error(error instanceof Error ? error.message : "启动定时清理失败");
        } finally {
            setStartingStaleChecker(false);
        }
    };

    // 停止 Stale Jobs Checker
    const handleStopStaleChecker = async () => {
        setStoppingStaleChecker(true);
        try {
            const result = await callServerPromise(stopStaleJobsCheckerAction());
            if (result && result.success) {
                toast.success(result.message || "定时清理已停止");
                await fetchStaleJobsCheckerStatus();
            } else if (result) {
                toast.warning(result.message || "定时清理未在运行");
            }
        } catch (error) {
            console.error("Error stopping stale checker:", error);
            toast.error(error instanceof Error ? error.message : "停止定时清理失败");
        } finally {
            setStoppingStaleChecker(false);
        }
    };


    if (loading) {
        return (
            <div className="w-full flex items-center justify-center h-full">
                <div className="text-muted-foreground">加载中...</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="w-full flex items-center justify-center h-full">
                <div className="text-destructive">无法加载队列数据</div>
            </div>
        );
    }

    const totalJobs = data.status.waiting + data.status.active + data.status.completed + data.status.failed + data.status.delayed;

    return (
        <div className="w-full space-y-6">
            {/* 头部统计 */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>等待中</CardDescription>
                        <CardTitle className="text-3xl">{data.status.waiting}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>执行中</CardDescription>
                        <CardTitle className="text-3xl">{data.status.active}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>延迟中</CardDescription>
                        <CardTitle className="text-3xl">{data.status.delayed}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>已完成</CardDescription>
                        <CardTitle className="text-3xl">{data.status.completed}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>失败</CardDescription>
                        <CardTitle className="text-3xl">{data.status.failed}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>总计</CardDescription>
                        <CardTitle className="text-3xl">{totalJobs}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Worker 状态显示 */}
            {workerStatus && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Worker 状态</CardTitle>
                                <CardDescription>Worker 的运行状态</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <Info className="h-4 w-4 mr-2" />
                                            详细信息
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle>Worker 状态详情</DialogTitle>
                                            <DialogDescription>
                                                查看 Worker 的详细配置和状态
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 mt-4">
                                            {/* Worker 状态 */}
                                            <div className="space-y-2">
                                                <h3 className="font-semibold text-lg">Worker</h3>
                                                <div className="space-y-1 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">状态:</span>
                                                        <Badge variant={workerStatus.worker.initialized ? "default" : "secondary"}>
                                                            {workerStatus.worker.initialized ? "运行中" : "未运行"}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">已启用:</span>
                                                        <span>{workerStatus.worker.enabled ? "是" : "否"}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Serverless 环境:</span>
                                                        <span>{workerStatus.worker.serverless ? "是" : "否"}</span>
                                                    </div>
                                                    <div className="mt-2 p-2 bg-muted rounded">
                                                        <span className="text-muted-foreground">说明: </span>
                                                        <span>{workerStatus.worker.message}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 环境信息 */}
                                            <div className="space-y-2">
                                                <h3 className="font-semibold text-lg">环境信息</h3>
                                                <div className="space-y-1 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Node 环境:</span>
                                                        <span>{workerStatus.environment.nodeEnv}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Serverless:</span>
                                                        <span>{workerStatus.environment.isServerless ? "是" : "否"}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Redis URL:</span>
                                                        <span className="font-mono text-xs">{workerStatus.environment.redisUrl}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Worker 并发数:</span>
                                                        <span>{workerStatus.environment.workerConcurrency}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Worker</span>
                                    <Badge variant={workerStatus.worker.initialized ? "default" : "secondary"}>
                                        {workerStatus.worker.initialized ? "运行中" : "未运行"}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{workerStatus.worker.message}</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Stale Jobs 定时清理</span>
                                    <Badge variant={staleJobsCheckerRunning ? "default" : "secondary"}>
                                        {staleJobsCheckerRunning ? "运行中" : "未运行"}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    自动清理超过5分钟的任务（每分钟检查）
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 操作栏 */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>队列监控</CardTitle>
                            <CardDescription>查看和管理队列中的任务</CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleStartWorker}
                                disabled={startingWorker || (workerStatus?.worker.initialized ?? false)}
                            >
                                <Play className={`h-4 w-4 mr-2 ${startingWorker ? "animate-spin" : ""}`} />
                                {startingWorker ? "启动中..." : "启动 Worker"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleStopWorker}
                                disabled={stoppingWorker || !(workerStatus?.worker.initialized ?? false)}
                            >
                                <Square className={`h-4 w-4 mr-2 ${stoppingWorker ? "animate-spin" : ""}`} />
                                {stoppingWorker ? "停止中..." : "停止 Worker"}
                            </Button>
                            <div className="border-l border-gray-300 mx-1"></div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCleanStaleJobs}
                                disabled={cleaningStaleJobs}
                            >
                                <AlertTriangle className={`h-4 w-4 mr-2 ${cleaningStaleJobs ? "animate-spin" : ""}`} />
                                {cleaningStaleJobs ? "清理中..." : "清理 Stale Jobs"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={staleJobsCheckerRunning ? handleStopStaleChecker : handleStartStaleChecker}
                                disabled={startingStaleChecker || stoppingStaleChecker}
                            >
                                {staleJobsCheckerRunning ? (
                                    <>
                                        <Square className={`h-4 w-4 mr-2 ${stoppingStaleChecker ? "animate-spin" : ""}`} />
                                        {stoppingStaleChecker ? "停止中..." : "停止定时清理"}
                                    </>
                                ) : (
                                    <>
                                        <Play className={`h-4 w-4 mr-2 ${startingStaleChecker ? "animate-spin" : ""}`} />
                                        {startingStaleChecker ? "启动中..." : "启动定时清理"}
                                    </>
                                )}
                            </Button>
                            <div className="border-l border-gray-300 mx-1"></div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAutoRefresh(!autoRefresh)}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
                                {autoRefresh ? "自动刷新中" : "手动刷新"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    fetchQueueData();
                                    fetchWorkerStatus();
                                }}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                刷新
                            </Button>
                            <Dialog open={addJobOpen} onOpenChange={setAddJobOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm">
                                        <Plus className="h-4 w-4 mr-2" />
                                        添加任务
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>添加任务到队列</DialogTitle>
                                        <DialogDescription>
                                            手动添加一个任务到队列
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div>
                                            <Label>部署</Label>
                                            <Select value={selectedDeployment} onValueChange={setSelectedDeployment}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="选择部署" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {deployments.map((dep) => (
                                                        <SelectItem key={dep.id} value={dep.id}>
                                                            {dep.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>输入参数 (JSON, 可选)</Label>
                                            <Input
                                                placeholder='{"key": "value"}'
                                                value={inputs}
                                                onChange={(e) => setInputs(e.target.value)}
                                            />
                                        </div>
                                        <Button onClick={handleAddJob} className="w-full">
                                            添加到队列
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleCleanQueue("all")}
                            >
                                <X className="h-4 w-4 mr-2" />
                                清空所有
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* 任务列表 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 等待中的任务 */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>等待中 ({data.jobs.waiting.length})</CardTitle>
                            {data.jobs.waiting.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCleanQueue("waiting")}
                                >
                                    清空
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job ID</TableHead>
                                        <TableHead>Deployment</TableHead>
                                        <TableHead>创建时间</TableHead>
                                        <TableHead>操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.jobs.waiting.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                暂无等待中的任务
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data.jobs.waiting.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell className="font-mono text-xs">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell>{job.data.deployment_id}</TableCell>
                                                <TableCell>{getRelativeTime(new Date(job.timestamp))}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveJob(job.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* 执行中的任务 */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>执行中 ({data.jobs.active.length})</CardTitle>
                            {data.jobs.active.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCleanQueue("active")}
                                >
                                    清空
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job ID</TableHead>
                                        <TableHead>Deployment</TableHead>
                                        <TableHead>开始时间</TableHead>
                                        <TableHead>操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.jobs.active.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                暂无执行中的任务
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data.jobs.active.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell className="font-mono text-xs">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell>{job.data.deployment_id}</TableCell>
                                                <TableCell>
                                                    {job.processedOn
                                                        ? getRelativeTime(new Date(job.processedOn))
                                                        : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveJob(job.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* 失败的任务 */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>失败 ({data.jobs.failed.length})</CardTitle>
                            {data.jobs.failed.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCleanQueue("failed")}
                                >
                                    清空
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job ID</TableHead>
                                        <TableHead>Deployment</TableHead>
                                        <TableHead>错误原因</TableHead>
                                        <TableHead>操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.jobs.failed.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                暂无失败的任务
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data.jobs.failed.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell className="font-mono text-xs">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell>{job.data.deployment_id}</TableCell>
                                                <TableCell>
                                                    <div className="max-w-[200px] truncate" title={job.failedReason}>
                                                        {job.failedReason || "-"}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveJob(job.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* 延迟中的任务 */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>延迟中 ({data.jobs.delayed.length})</CardTitle>
                            {data.jobs.delayed.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCleanQueue("delayed")}
                                >
                                    清空
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job ID</TableHead>
                                        <TableHead>Deployment</TableHead>
                                        <TableHead>重试次数</TableHead>
                                        <TableHead>操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.jobs.delayed.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                暂无延迟中的任务
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data.jobs.delayed.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell className="font-mono text-xs">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell>{job.data.deployment_id}</TableCell>
                                                <TableCell>
                                                    {(job.data as any).retryCount || 0}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveJob(job.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* 已完成的任务 */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>已完成 ({data.jobs.completed.length})</CardTitle>
                            {data.jobs.completed.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCleanQueue("completed")}
                                >
                                    清空
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Job ID</TableHead>
                                        <TableHead>Deployment</TableHead>
                                        <TableHead>完成时间</TableHead>
                                        <TableHead>Workflow Run</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.jobs.completed.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                暂无已完成的任务
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data.jobs.completed.map((job) => (
                                            <TableRow key={job.id}>
                                                <TableCell className="font-mono text-xs">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell>{job.data.deployment_id}</TableCell>
                                                <TableCell>
                                                    {job.finishedOn
                                                        ? getRelativeTime(new Date(job.finishedOn))
                                                        : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    {job.returnvalue?.workflow_run_id ? (
                                                        job.workflow_id ? (
                                                            <a
                                                                href={`/workflows/${job.workflow_id}`}
                                                                className="text-blue-600 hover:underline"
                                                            >
                                                                {job.returnvalue.workflow_run_id.substring(0, 8)}...
                                                            </a>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                {job.returnvalue.workflow_run_id.substring(0, 8)}...
                                                            </span>
                                                        )
                                                    ) : (
                                                        "-"
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

