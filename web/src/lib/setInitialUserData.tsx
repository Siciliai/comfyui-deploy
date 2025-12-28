import { db } from "@/db/db";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";

// 注意：这个函数现在主要用于确保用户存在
// 用户创建已经在注册流程中处理
export async function setInitialUserData(userId: string) {
  // 检查用户是否已存在
  const existingUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });

  // 如果用户已存在，不需要再创建
  if (existingUser) {
    return existingUser;
  }

  // 这种情况不应该发生，因为用户应该在注册时创建
  // 但为了安全起见，我们可以创建一个占位符
  console.warn(`User ${userId} not found in database, this should not happen`);
  
  return null;
}
