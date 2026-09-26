import { ForbiddenError } from "../domain/errors.js";

export type MembershipAdapter = {
  findOne<T>(input: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }): Promise<T | null>;
};

type MemberRecord = {
  id: string;
  userId: string;
  organizationId: string;
  role?: string | string[];
};

export async function getCurrentMembership(
  adapter: MembershipAdapter,
  userId: string,
  organizationId: string,
): Promise<MemberRecord> {
  const member = await adapter.findOne<MemberRecord>({
    model: "member",
    where: [
      { field: "userId", value: userId },
      { field: "organizationId", value: organizationId },
    ],
  });

  if (!member) {
    throw new ForbiddenError("Organization membership is no longer active");
  }

  return member;
}
