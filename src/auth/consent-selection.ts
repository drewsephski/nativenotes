import { AsyncLocalStorage } from "node:async_hooks";

const selectedOrganization = new AsyncLocalStorage<string>();

export function withSelectedOrganization<T>(
  organizationId: string,
  callback: () => Promise<T>,
): Promise<T> {
  return selectedOrganization.run(organizationId, callback);
}

export function getSelectedOrganization(): string | undefined {
  return selectedOrganization.getStore();
}
