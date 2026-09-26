import { NotesWorkspace } from "@/components/app-shell/notes-workspace";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <NotesWorkspace key={id} title="Folders" folderId={id} />; }
