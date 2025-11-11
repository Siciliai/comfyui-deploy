"use client";
import { LoadingIcon } from "@/components/LoadingIcon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createDeployments, findUserShareDeploymentByWorkflowId } from "@/server/curdDeploments";
import type { getMachines } from "@/server/curdMachine";
import type { findFirstTableWithVersion } from "@/server/findFirstTableWithVersion";
import { Share } from "lucide-react";
import { parseAsInteger, useQueryState } from "next-usequerystate";
import { useState } from "react";
import { useSelectedMachine } from "./VersionSelect";
import { callServerPromise } from "./callServerPromise";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function CreateShareButton({
	workflow,
	machines,
}: {
	workflow: Awaited<ReturnType<typeof findFirstTableWithVersion>>;
	machines: Awaited<ReturnType<typeof getMachines>>;
}) {
	const [version] = useQueryState("version", {
		defaultValue: workflow?.versions[0].version ?? 1,
		...parseAsInteger,
	});
	const [machine] = useSelectedMachine(machines);
	const router = useRouter();

	const [isLoading, setIsLoading] = useState(false);
	const workflow_version_id = workflow?.versions.find(
		(x) => x.version == version,
	)?.id;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="gap-2" disabled={isLoading} variant="outline">
					Share {isLoading ? <LoadingIcon /> : <Share size={14} />}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56">
				<DropdownMenuItem
					onClick={async () => {
						if (!workflow_version_id) return;

						setIsLoading(true);
						try {
							await callServerPromise(
								createDeployments(
									workflow.id,
									workflow_version_id,
									machine,
									null,
									"public-share",
								),
							);

							// 获取刚创建的分享部署
							const deployment = await callServerPromise(
								findUserShareDeploymentByWorkflowId(workflow.id)
							);

							if (deployment) {
								const shareUrl = `${window.location.origin}/share/${deployment.share_slug ?? deployment.id}`;

								// 显示成功消息和链接
								toast.success("分享链接已创建！", {
									description: shareUrl,
									action: {
										label: "复制链接",
										onClick: () => {
											navigator.clipboard.writeText(shareUrl);
											toast.success("已复制到剪贴板");
										},
									},
									duration: 10000,
								});

								// 跳转到设置页面
								setTimeout(() => {
									router.push(`/share/${deployment.share_slug ?? deployment.id}/settings`);
								}, 1000);
							}
						} catch (error) {
							console.error("创建分享失败:", error);
							toast.error("创建分享失败");
						} finally {
							setIsLoading(false);
						}
					}}
				>
					Public
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
