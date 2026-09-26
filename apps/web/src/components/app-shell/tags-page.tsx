"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import type { Tag } from "@/lib/product-api";
import { useAction, useProduct, useTags } from "./product-context";
export function TagsPage() {
  const { data, error } = useTags();
  const { mutate } = useProduct();
  const action = useAction();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Tag | null>(null);
  return (
    <div className="page-scroll">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Across your folders</p>
          <h1>Tags</h1>
        </div>
      </div>
      <form
        className="mb-8 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await mutate("tag.create", { name });
            setName("");
          });
        }}
      >
        <Input
          aria-label="New tag name"
          placeholder="New tag name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button disabled={action.busy || !name.trim()}>Create tag</Button>
      </form>
      {(error || action.error) && (
        <p role="alert" className="text-destructive">
          {error || action.error}
        </p>
      )}
      <ul className="divide-y divide-border">
        {data?.tags.map((tag) => (
          <li
            key={tag.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <Link
              className="font-medium hover:underline"
              href={`/app/tags/${tag.id}`}
            >
              # {tag.name}
              <span className="ml-3 text-xs font-normal text-muted-foreground">
                {tag.noteCount} notes
              </span>
            </Link>
            <Button variant="ghost" onClick={() => setSelected(tag)}>
              Manage
            </Button>
          </li>
        ))}
      </ul>
      {data?.tags.length === 0 && (
        <p className="py-10 text-muted-foreground">
          No tags yet. Add a tag to connect notes across folders.
        </p>
      )}
      {selected && (
        <Dialog
          title={`Manage ${selected.name}`}
          onClose={() => setSelected(null)}
        >
          <TagForm
            tag={selected}
            tags={data?.tags ?? []}
            onClose={() => setSelected(null)}
          />
        </Dialog>
      )}
    </div>
  );
}
function TagForm({
  tag,
  tags,
  onClose,
}: {
  tag: Tag;
  tags: Tag[];
  onClose: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [intoId, setIntoId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { mutate } = useProduct();
  const action = useAction();
  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await mutate("tag.rename", { id: tag.id, name });
            onClose();
          });
        }}
      >
        <label className="field">
          Tag name
          <Input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <Button disabled={action.busy}>Rename tag</Button>
      </form>
      <form
        className="space-y-3 border-t border-border pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await mutate("tag.merge", { id: tag.id, intoId });
            onClose();
          });
        }}
      >
        <label className="field">
          Merge into
          <select
            value={intoId}
            onChange={(e) => setIntoId(e.target.value)}
            required
          >
            <option value="">Choose a tag</option>
            {tags
              .filter((t) => t.id !== tag.id)
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Moves all assignments to the destination and removes this tag.
        </p>
        <Button variant="outline" disabled={!intoId || action.busy}>
          Merge tag
        </Button>
      </form>
      <div className="border-t border-border pt-5">
        <p className="mb-3 text-xs text-muted-foreground">
          Deleting removes this tag from all notes. Notes are preserved.
        </p>
        {deleting ? (
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await mutate("tag.delete", { id: tag.id });
                onClose();
              })
            }
          >
            Confirm delete tag
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setDeleting(true)}>
            Delete tag
          </Button>
        )}
      </div>
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
    </div>
  );
}
