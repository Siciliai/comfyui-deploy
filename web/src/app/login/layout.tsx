import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../(app)/globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "登录 - ComfyUI Deploy",
  description: "登录到 ComfyUI Deploy 管理平台",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster richColors />
        </AuthProvider>
      </body>
    </html>
  );
}

