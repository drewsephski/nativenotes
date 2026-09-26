"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import type { Folder } from "@/lib/product-api";
import { useAction, useNavigation, useProduct } from "./product-context";
import { InstructionsEditor } from "./instructions-editor";
export function FolderForm({
  folder,
  onSaved,
}: {
  folder?: Folder;
  onSaved?: () => void;
}) {
  const { data } = useNavigation();
  const { mutate } = useProduct();
  const action = useAction();
  const router = useRouter();
  const [name, setName] = useState(folder?.name ?? "");
  const [parentId, setParentId] = useState(folder?.parentId ?? "");
  const [position, setPosition] = useState(folder?.position ?? 0);
  const options = (data?.folders ?? []).filter((f) => {
    const visited = new Set<string>();
    let current: Folder | undefined = f;
    while (current) {
      if (current.id === folder?.id || visited.has(current.id)) return false;
      visited.add(current.id);
      current = data?.folders.find((p) => p.id === current?.parentId);
    }
    return true;
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(async () => {
          const saved = await mutate<Folder>(
            folder ? "folder.update" : "folder.create",
            {
              ...(folder ? { id: folder.id } : {}),
              name,
              parentId: parentId || null,
              position,
            },
          );
          onSaved?.();
          if (!folder) router.push(`/app/folders/${saved.id}`);
        });
      }}
    >
      <label className="field">
        Folder name
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          autoFocus
        />
      </label>
      <label className="field">
        Parent folder
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Workspace root</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.archivedAt ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Sort position
        <Input
          type="number"
          min={0}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          required
        />
      </label>
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
      <Button disabled={action.busy || !name.trim()}>
        {action.busy ? "Saving…" : folder ? "Save folder" : "Create folder"}
      </Button>
    </form>
  );
}
export function FoldersPage() {
  const { data, error } = useNavigation();
  const { mutate } = useProduct();
  const action = useAction();
  const [edit, setEdit] = useState<Folder | "new" | null>(null);
  return (
    <div className="page-scroll">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Folders</h1>
        </div>
        <Button onClick={() => setEdit("new")}>New folder</Button>
      </div>
      <p className="mb-6 text-muted-foreground">
        Organize notes into a hierarchy. Counts show active notes directly in
        each folder. Archiving a folder keeps its notes in All Notes.
      </p>
      {(error || action.error) && (
        <p role="alert" className="text-destructive">
          {error || action.error}
        </p>
      )}
      <ul className="divide-y divide-border">
        {data?.folders.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <Link
                className="font-medium hover:underline"
                href={`/app/folders/${f.id}`}
              >
                {f.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {f.parentId
                  ? data.folders.find((p) => p.id === f.parentId)?.name
                  : "Workspace root"}{" "}
                · {data.folderCounts[f.id] ?? 0} notes
                {f.archivedAt ? " · Archived" : ""}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setEdit(f)}>
              Settings
            </Button>
            <Button
              variant="ghost"
              disabled={action.busy}
              onClick={() =>
                void action.run(() =>
                  mutate("folder.update", {
                    id: f.id,
                    archived: !f.archivedAt,
                  }),
                )
              }
            >
              {f.archivedAt ? "Restore folder" : "Archive folder"}
            </Button>
          </li>
        ))}
      </ul>
      {data?.folders.length === 0 && (
        <p className="py-8 text-muted-foreground">
          Create your first folder to organize related notes.
        </p>
      )}
      {edit && (
        <Dialog
          title={edit === "new" ? "Create folder" : "Folder settings"}
          onClose={() => setEdit(null)}
        >
          <FolderForm
            folder={edit === "new" ? undefined : edit}
            onSaved={() => setEdit(null)}
          />
          {edit !== "new" && (
            <div className="mt-8 border-t border-border pt-6">
              <InstructionsEditor folderId={edit.id} />
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
