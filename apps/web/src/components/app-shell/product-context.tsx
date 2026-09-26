"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { productRequest, type Navigation, type Tag } from "@/lib/product-api";

type ProductContextValue = { workspaceId: string; revision: number; refresh: () => void; mutate: <T>(command: string, input: unknown) => Promise<T> };
const ProductContext = createContext<ProductContextValue | null>(null);
export function ProductProvider({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  const mutate = useCallback(async <T,>(command: string, input: unknown) => {
    const result = await productRequest<T>(workspaceId, "commands", { command, input });
    refresh(); return result;
  }, [workspaceId, refresh]);
  return <ProductContext value={{ workspaceId, revision, refresh, mutate }}><WorkspaceDataProvider>{children}</WorkspaceDataProvider></ProductContext>;
}
export function useProduct() {
  const context = useContext(ProductContext);
  if (!context) throw new Error("ProductProvider is required");
  return context;
}
/** Discard responses after unmount/switch; previous-workspace data never renders. */
export function useResource<T>(resource: string | null) {
  const { workspaceId, revision } = useProduct();
  const key = `${workspaceId}:${resource}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
  useEffect(() => {
    if (!workspaceId || !resource) return;
    const controller = new AbortController();
    productRequest<T>(workspaceId, resource, undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "Could not load workspace" });
    });
    return () => controller.abort();
  }, [workspaceId, resource, key, revision]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: state.key !== key, };
}
type ResourceState<T> = { data?: T; error?: string; loading: boolean };
const NavigationContext = createContext<ResourceState<Navigation>>({ loading: true });
const TagsContext = createContext<ResourceState<{ tags: Tag[] }>>({ loading: true });
function WorkspaceDataProvider({ children }: { children: React.ReactNode }) {
  const navigation = useResource<Navigation>("navigation");
  const tags = useResource<{ tags: Tag[] }>("tags");
  return <NavigationContext value={navigation}><TagsContext value={tags}>{children}</TagsContext></NavigationContext>;
}
export function useNavigation() { return useContext(NavigationContext); }
export function useTags() { return useContext(TagsContext); }
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Could not complete the request"); }
    finally { setBusy(false); }
  }
  return { busy, error, run };
}
