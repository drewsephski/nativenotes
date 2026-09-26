"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction, useProduct } from "./product-context";
import type { ProductNote } from "@/lib/product-api";
export function CreateProductNote({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { mutate } = useProduct();
  const action = useAction();
  const router = useRouter();
  return (
    <Dialog
      title="New note"
      onClose={onClose}
      description="Capture an idea. You can organize it into a folder later."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const note = await mutate<ProductNote>("note.create", {
              title,
              body,
            });
            router.push(`/app/notes/${note.id}`);
            onClose();
          });
        }}
      >
        <label className="field">
          Title
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </label>
        <label className="field">
          Note
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            maxLength={100_000}
            placeholder="Write in Markdown…"
          />
        </label>
        {action.error && (
          <p role="alert" className="text-destructive">
            {action.error}
          </p>
        )}
        <Button disabled={action.busy || !title.trim()}>
          {action.busy ? "Creating…" : "Create note"}
        </Button>
      </form>
    </Dialog>
  );
}
