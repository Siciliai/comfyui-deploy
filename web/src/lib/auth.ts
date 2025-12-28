import { db } from "@/db/db";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// 扩展 NextAuth 类型
declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            username?: string;
            orgId?: string | null;
        };
    }

    interface User {
        id: string;
        username?: string;
        orgId?: string | null;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        username?: string;
        orgId?: string | null;
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                username: { label: "用户名", type: "text" },
                password: { label: "密码", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    throw new Error("请输入用户名和密码");
                }

                // 查找用户
                const user = await db.query.usersTable.findFirst({
                    where: eq(usersTable.username, credentials.username),
                });

                if (!user) {
                    throw new Error("用户名或密码错误");
                }

                // 验证密码
                if (!user.password_hash) {
                    throw new Error("该账户未设置密码，请联系管理员");
                }

                const isPasswordValid = await bcrypt.compare(
                    credentials.password,
                    user.password_hash
                );

                if (!isPasswordValid) {
                    throw new Error("用户名或密码错误");
                }

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    username: user.username,
                    orgId: user.org_id,
                };
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 天
    },
    pages: {
        signIn: "/login",
        signOut: "/login",
        error: "/login",
    },
    callbacks: {
        async jwt({ token, user }): Promise<JWT> {
            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.orgId = user.orgId;
            }
            return token;
        },
        async session({ session, token }): Promise<Session> {
            if (token && session.user) {
                session.user.id = token.id;
                session.user.username = token.username;
                session.user.orgId = token.orgId;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
};

// 服务端获取用户认证信息的辅助函数
import { getServerSession } from "next-auth";

export async function auth() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return { userId: null, orgId: null };
    }

    return {
        userId: session.user.id,
        orgId: session.user.orgId || null,
    };
}

// 获取完整 session
export async function getSession() {
    return await getServerSession(authOptions);
}

