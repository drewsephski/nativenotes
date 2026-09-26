import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "success";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-none",
        variant === "default" && "bg-foreground text-background",
        variant === "secondary" && "bg-accent text-muted-foreground",
        variant === "outline" &&
          "border border-border text-muted-foreground",
        variant === "success" &&
          "border border-border bg-muted text-foreground",
        className,
      )}
      {...props}
    />
  );
}
