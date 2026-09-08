-- Every authenticated wedding member has the same application access now.
-- Roles and per-role document visibility are intentionally removed; actor
-- identity remains on users, memberships and activity_logs.
ALTER TABLE "wedding_members"
  DROP COLUMN "overrides",
  DROP COLUMN "role";

ALTER TABLE "documents"
  DROP COLUMN "visibleToRoles";

DROP TYPE "MemberRole";
