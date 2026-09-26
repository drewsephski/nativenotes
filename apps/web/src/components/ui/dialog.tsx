"use client";
import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export function Dialog({
  title,
  description,
  onClose,
  children,
  side,
  className,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  side?: "left" | "right";
  className?: string;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-[60] overflow-y-auto border border-border bg-background p-5 outline-none",
            side
              ? `inset-y-0 w-[min(90vw,360px)] ${side === "left" ? "left-0" : "right-0"}`
              : "left-1/2 top-1/2 max-h-[85dvh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-lg",
            className,
          )}
          onOpenAutoFocus={() => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (previousFocus.current?.isConnected)
              previousFocus.current.focus();
          }}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded p-1.5 hover:bg-accent"
              aria-label={`Close ${title}`}
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description
            className={
              description ? "mb-4 text-sm text-muted-foreground" : "sr-only"
            }
          >
            {description ?? title}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
