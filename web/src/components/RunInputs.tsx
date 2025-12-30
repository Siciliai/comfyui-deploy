import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { findAllRuns } from "@/server/findAllRuns";

// 支持的图片扩展名
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

// 检查 URL 是否是图片
function isImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

// 解析输入值，提取图片 URL
function extractImageUrls(data: unknown): string[] {
  const urls: string[] = [];
  
  if (typeof data === "string") {
    // 检查是否是 base64 图片
    if (data.startsWith("data:image/")) {
      urls.push(data);
      return urls;
    }
    
    // 尝试解析为 JSON 数组（用于 ExternalImageBatch）
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && (isImageUrl(item) || item.startsWith("data:image/"))) {
            urls.push(item);
          }
        }
        if (urls.length > 0) return urls;
      }
    } catch {
      // 不是 JSON，继续检查是否是单个 URL
    }
    
    // 检查是否是单个图片 URL
    if (isImageUrl(data)) {
      urls.push(data);
    }
  }
  
  return urls;
}

export async function RunInputs({
  run,
}: {
  run: Awaited<ReturnType<typeof findAllRuns>>[0];
}) {
  return (
    <>
      {run.workflow_inputs && (
        <Table className="table-fixed">
          <TableHeader className="bg-background top-0 sticky">
            <TableRow>
              <TableHead className="w-[200px]">Input</TableHead>
              <TableHead className="">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(run.workflow_inputs).map(([key, data]) => {
              const imageUrls = extractImageUrls(data);
              
              return (
                <TableRow key={key}>
                  <TableCell className="align-top">{key}</TableCell>
                  <TableCell>
                    {imageUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {imageUrls.map((url, index) => (
                          <img
                            key={index}
                            className="max-w-[200px] max-h-[200px] object-contain rounded border"
                            src={url}
                            alt={`${key} image ${index + 1}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="break-all">{String(data)}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
