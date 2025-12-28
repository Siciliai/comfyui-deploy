import { db } from "@/db/db";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, name, email } = body;

    // 验证必填字段
    if (!username || !password || !name) {
      return NextResponse.json(
        { error: "用户名、密码和姓名为必填项" },
        { status: 400 }
      );
    }

    // 检查用户名长度
    if (username.length < 3 || username.length > 50) {
      return NextResponse.json(
        { error: "用户名长度应在 3-50 个字符之间" },
        { status: 400 }
      );
    }

    // 检查密码长度
    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少 6 个字符" },
        { status: 400 }
      );
    }

    // 检查用户名是否已存在
    const existingUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.username, username),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "用户名已存在" },
        { status: 400 }
      );
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建用户
    const userId = nanoid();
    await db.insert(usersTable).values({
      id: userId,
      username,
      name,
      email: email || null,
      password_hash: passwordHash,
    });

    return NextResponse.json(
      { message: "注册成功", userId },
      { status: 201 }
    );
  } catch (error) {
    console.error("注册错误:", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
}

