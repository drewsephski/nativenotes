"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "default" | "sm" | "icon" | "icon-sm";
}

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variant === "default" &&
          "bg-foreground text-background hover:bg-foreground/90",
        variant === "secondary" &&
          "bg-accent text-accent-foreground hover:bg-accent/80",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-accent hover:text-foreground",
        variant === "outline" &&
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        variant === "destructive" &&
          "bg-destructive text-white hover:bg-destructive/90",
        size === "default" && "h-8 px-3",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "icon" && "h-8 w-8",
        size === "icon-sm" && "h-7 w-7",
        className,
      )}
      {...props}
    />
  );
}
