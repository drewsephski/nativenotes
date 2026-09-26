import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center",
        className,
      )}
    >
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[240px] text-[12px] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
