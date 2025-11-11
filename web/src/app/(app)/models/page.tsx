import { auth } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ModelsManagement } from "@/components/ModelsManagement";

export default async function ModelsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">模型管理</h1>
        <p className="text-muted-foreground mt-2">
          管理您上传的所有模型文件
        </p>
      </div>
      <ModelsManagement />
    </div>
  );
}

