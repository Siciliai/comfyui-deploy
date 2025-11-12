"use client";

import { LoaderIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function LoadingIcon({ 
  className, 
  size = 14 
}: { 
  className?: string;
  size?: number;
} = {}) {
  return <LoaderIcon size={size} className={cn("animate-spin", className)} />;
}
