import type { Metadata } from "next";
import { EmptyState } from "@/components/app-shell/empty-state";

export const metadata: Metadata = {
  title: "Trash",
};

export default function TrashPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-[13px] font-semibold text-foreground">Trash</h1>
      </div>
      <EmptyState
        title="Not available yet."
        description="Trash will hold deleted notes once that feature is wired."
      />
    </div>
  );
}
