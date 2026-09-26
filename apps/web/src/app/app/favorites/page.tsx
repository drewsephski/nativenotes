import type { Metadata } from "next";
import { NotesWorkspace } from "@/components/app-shell/notes-workspace";
import { getFavoriteNotes } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Favorites",
};

export default function FavoritesPage() {
  const notes = getFavoriteNotes();

  return (
    <NotesWorkspace
      title="Favorites"
      notes={notes}
      emptyTitle="No favorites yet."
      emptyDescription="Star a note to keep it here."
    />
  );
}
