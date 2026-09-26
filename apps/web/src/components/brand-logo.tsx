import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

/** Decorative mark paired with an accessible, selectable wordmark. */
export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  const size = compact ? 20 : 26;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground", compact && "gap-2 text-[13px]", className)}>
      <Image
        src="/brand/nativenotes-mark-64.png"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        unoptimized
        className="shrink-0"
      />
      <span>NativeNotes</span>
    </span>
  );
}
