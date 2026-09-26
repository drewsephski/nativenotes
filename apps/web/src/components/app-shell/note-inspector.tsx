"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelativeTime } from "@/lib/date";
import type { ProductNote, Tag } from "@/lib/product-api";
import {
  useAction,
  useNavigation,
  useProduct,
  useTags,
} from "./product-context";
export function NoteInspector({
  note,
  onChange,
}: {
  note: ProductNote;
  onChange: (note: ProductNote) => void;
}) {
  const nav = useNavigation();
  const tags = useTags();
  const { mutate } = useProduct();
  const action = useAction();
  const [tagName, setTagName] = useState("");
  const apply = (command: string, input: unknown) =>
    action.run(async () => {
      onChange(await mutate<ProductNote>(command, input));
    });
  async function assign(tagId: string, remove = false) {
    await mutate(remove ? "tag.remove" : "tag.assign", {
      noteId: note.id,
      tagId,
    });
    onChange({
      ...note,
      tags: remove
        ? note.tags?.filter((t) => t.id !== tagId)
        : [...(note.tags ?? []), tags.data!.tags.find((t) => t.id === tagId)!],
    });
  }
  return (
    <div className="space-y-6 text-xs">
      <h2 className="eyebrow">About</h2>
      <label className="field">
        Folder
        <Select
          value={note.folderId ?? "__inbox__"}
          disabled={action.busy}
          onValueChange={(value) =>
            void apply("note.move", {
              id: note.id,
              folderId: value === "__inbox__" ? null : value,
            })
          }
        >
          <SelectTrigger aria-label="Note folder">
            <SelectValue placeholder="Inbox" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inbox__">Inbox</SelectItem>
            {nav.data?.folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
                {f.archivedAt ? " (archived)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-3 text-[12px]">
        <dt className="text-muted-foreground">Created</dt>
        <dd>
          <time
            dateTime={note.createdAt}
            title={new Date(note.createdAt).toLocaleString()}
          >
            {formatRelativeTime(note.createdAt)}
          </time>
        </dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd>
          <time
            dateTime={note.updatedAt}
            title={new Date(note.updatedAt).toLocaleString()}
          >
            {formatRelativeTime(note.updatedAt)}
          </time>
        </dd>
        <dt className="text-muted-foreground">Version</dt>
        <dd>{note.version}</dd>
      </dl>
      <label className="field">
        Status
        <Select
          value={note.freshness}
          disabled={action.busy}
          onValueChange={(value) =>
            void apply("note.freshness", {
              id: note.id,
              freshness: value,
            })
          }
        >
          <SelectTrigger aria-label="Note status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">
              {note.verifiedAt ? "Verified" : "Current · unconfirmed"}
            </SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="superseded">Superseded</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {note.verifiedAt && (
        <p className="text-muted-foreground">
          Confirmed {formatRelativeTime(note.verifiedAt)}
        </p>
      )}
      <section className="space-y-3">
        <h3 className="eyebrow">Tags</h3>
        <div className="flex flex-wrap gap-1">
          {note.tags?.map((tag) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              key={tag.id}
              disabled={action.busy}
              className="h-auto px-2 py-1"
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => void action.run(() => assign(tag.id, true))}
            >
              # {tag.name} <span aria-hidden>×</span>
            </Button>
          ))}
        </div>
        <Select
          value=""
          disabled={action.busy}
          onValueChange={(value) => {
            if (value) void action.run(() => assign(value));
          }}
        >
          <SelectTrigger aria-label="Assign tag" className="w-full">
            <SelectValue placeholder="Add a tag…" />
          </SelectTrigger>
          <SelectContent>
            {tags.data?.tags
              .filter(
                (t) => !note.tags?.some((assigned) => assigned.id === t.id),
              )
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const tag = await mutate<Tag>("tag.create", { name: tagName });
              await mutate("tag.assign", { noteId: note.id, tagId: tag.id });
              onChange({
                ...note,
                tags: [...(note.tags ?? []), { id: tag.id, name: tag.name }],
              });
              setTagName("");
            });
          }}
        >
          <Input
            aria-label="Create and assign tag"
            placeholder="New tag…"
            value={tagName}
            maxLength={100}
            onChange={(e) => setTagName(e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!tagName.trim() || action.busy}
          >
            Create & assign
          </Button>
        </form>
      </section>
      <div className="space-y-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          className="w-full justify-start"
          disabled={action.busy}
          onClick={() =>
            void apply("note.favorite", {
              id: note.id,
              favorited: !note.favorited,
            })
          }
        >
          {note.favorited ? "Remove favorite" : "Add to favorites"}
        </Button>
        {!note.trashedAt && (
          <Button
            variant="ghost"
            className="w-full justify-start"
            disabled={action.busy}
            onClick={() =>
              void apply(note.archivedAt ? "note.restore" : "note.archive", {
                id: note.id,
                from: "archive",
              })
            }
          >
            {note.archivedAt ? "Restore from archive" : "Archive note"}
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start"
          disabled={action.busy}
          onClick={() =>
            void apply(note.trashedAt ? "note.restore" : "note.trash", {
              id: note.id,
              from: "trash",
            })
          }
        >
          {note.trashedAt ? "Restore from trash" : "Move to trash"}
        </Button>
      </div>
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
    </div>
  );
}
