"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Code } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ViewJsonButton({
  data,
  title = "JSON 数据",
  description = "查看原始 JSON 数据",
  buttonText = "JSON",
  variant = "outline",
  size = "sm",
}: {
  data: unknown;
  title?: string;
  description?: string;
  buttonText?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const jsonText = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success("已复制到剪贴板");
    } catch {
      // 降级方案
      const textArea = document.createElement("textarea");
      textArea.value = jsonText;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("已复制到剪贴板");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-1">
          <Code size={14} />
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <pre className="w-full max-h-[60vh] p-4 font-mono text-sm bg-gray-50 dark:bg-gray-900 border rounded-md overflow-auto whitespace-pre-wrap break-all">
              {jsonText}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCopy}>
              <Copy size={14} className="mr-2" />
              复制
            </Button>
            <Button onClick={() => setOpen(false)}>关闭</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

