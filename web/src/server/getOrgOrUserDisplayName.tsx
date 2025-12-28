import { db } from "@/db/db";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getOrgOrUserDisplayName(
  orgId: string | undefined | null,
  userId: string,
) {
  // 由于不再使用 Clerk，组织信息需要从本地数据库获取
  // 如果有 orgId，可以考虑创建一个组织表，目前先返回用户名
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
  
  return user?.name || "Unknown User";
}
