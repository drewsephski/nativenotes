import type { Metadata } from "next";
import { NotesWorkspace } from "@/components/app-shell/notes-workspace";

export const metadata: Metadata = {
  title: "All Notes",
};

export default function AppHomePage() {
  return <NotesWorkspace title="All Notes" />;
}
