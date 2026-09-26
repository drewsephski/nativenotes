"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { InstructionChain } from "@/lib/product-api";
import { useAction, useProduct, useResource } from "./product-context";
export function InstructionsEditor({
  folderId = null,
}: {
  folderId?: string | null;
}) {
  const { data, error } = useResource<InstructionChain>(
    `instructions${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`,
  );
  if (error) return <p role="alert">{error}</p>;
  if (!data)
    return <p className="text-muted-foreground">Loading instructions…</p>;
  return (
    <InstructionForm
      key={folderId ?? "workspace"}
      chain={data.chain}
      folderId={folderId}
    />
  );
}
function InstructionForm({
  chain,
  folderId,
}: {
  chain: InstructionChain["chain"];
  folderId: string | null;
}) {
  const current =
    chain.find((c) => c.folderId === folderId)?.instructions ?? "";
  const [text, setText] = useState(current);
  const [savedText, setSavedText] = useState(current);
  const [saved, setSaved] = useState(false);
  const { mutate } = useProduct();
  const action = useAction();
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-semibold">
          {folderId ? "Folder instructions" : "Workspace instructions"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          AI clients read these as context. Instructions apply from workspace to
          ancestor folders, then this folder.
        </p>
      </div>
      <Accordion type="multiple" className="space-y-2">
        {chain
          .filter((c) => c.folderId !== folderId && c.instructions)
          .map((c) => (
            <AccordionItem
              key={c.folderId ?? "workspace"}
              value={c.folderId ?? "workspace"}
            >
              <AccordionTrigger>Inherited from {c.name}</AccordionTrigger>
              <AccordionContent className="whitespace-pre-wrap text-muted-foreground">
                {c.instructions}
              </AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await mutate("instructions.set", { folderId, instructions: text });
            setSavedText(text);
            setSaved(true);
          });
        }}
      >
        <label className="field">
          Instructions
          <Textarea
            rows={10}
            maxLength={30_000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
            placeholder="Describe what an AI assistant should know about this workspace…"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button disabled={action.busy || text === savedText}>
            {action.busy ? "Saving…" : "Save instructions"}
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {saved ? "Saved" : text !== savedText ? "Unsaved changes" : ""}
          </span>
        </div>
        {action.error && (
          <p role="alert" className="text-destructive">
            {action.error}
          </p>
        )}
      </form>
    </section>
  );
}
export function InstructionsPage() {
  return (
    <div className="page-scroll">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Context for your AI</p>
          <h1>AI Instructions</h1>
        </div>
      </div>
      <InstructionsEditor />
    </div>
  );
}
