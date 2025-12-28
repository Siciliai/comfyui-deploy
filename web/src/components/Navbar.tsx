"use client";

import { NavbarMenu } from "@/components/NavbarMenu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, signOut } from "next-auth/react";
import { Menu, User, LogOut } from "lucide-react";
import meta from "next-gen/config";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";

export function Navbar() {
  const { data: session } = useSession();
  const _isDesktop = useMediaQuery("(min-width: 1024px)");
  const [isDesktop, setIsDesktop] = useState(true);
  const [isSheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setIsDesktop(_isDesktop);
  }, [_isDesktop]);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      <div className="flex flex-row items-center gap-4">
        {!isDesktop && (
          <Sheet open={isSheetOpen} onOpenChange={(open) => setSheetOpen(open)}>
            <SheetTrigger asChild>
              <button className="flex items-center justify-center w-8 h-8 p-2">
                <Menu />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col gap-4">
              <SheetHeader>
                <SheetTitle className="text-start">Leapfuture Comfy Deploy Management</SheetTitle>
              </SheetHeader>
              <div className="grid h-full grid-rows-[1fr_auto]">
                <NavbarMenu
                  className=" h-full"
                  closeSheet={() => setSheetOpen(false)}
                />
                {session?.user && (
                  <div className="p-2 border-t">
                    <p className="text-sm text-gray-600 mb-2">
                      {session.user.name || session.user.username}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSignOut}
                      className="w-full"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      退出登录
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
        <a className="font-bold text-md md:text-lg hover:underline" href="/">
          Leapfuture Comfy Deploy Management
        </a>
        {isDesktop && session?.user?.orgId && (
          <span className="text-sm text-gray-500 px-2 py-1 bg-gray-100 rounded">
            组织: {session.user.orgId}
          </span>
        )}
      </div>
      <div className="flex flex-row items-center gap-2">
        {isDesktop && <NavbarMenu />}
        {session?.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                  {(session.user.name || session.user.username || "U")[0].toUpperCase()}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {session.user.name || session.user.username}
                  </p>
                  {session.user.email && (
                    <p className="text-xs text-gray-500">{session.user.email}</p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <a href="/login">登录</a>
          </Button>
        )}
      </div>
    </>
  );
}
