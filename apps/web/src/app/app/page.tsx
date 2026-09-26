import type { Metadata } from "next";
import { NotesWorkspace } from "@/components/app-shell/notes-workspace";
import { getActiveNotes } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "All Notes",
};

export default function AppHomePage() {
  const notes = getActiveNotes();

  return (
    <NotesWorkspace
      title="All Notes"
      notes={notes}
    />
  );
}
