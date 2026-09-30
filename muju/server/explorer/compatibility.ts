/** Exact source transitions audited in docs/changes/2026-09-30-explorer-recovery.md.
 * Values pin every implementation byte, including the guard that reads this
 * manifest. Only this data-only manifest is excluded from that second digest.
 * A later engine/controller edit disables these entries until separately audited.
 */
export const AUDITED_EXPLORER_COMPATIBILITY: Readonly<Record<string, string>> = {
  '3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a': 'ece5ff5a04c5b9ea9792a08e96dd54251b5eccdc504c1f1699c9d0b72590a47d',
  'c89676ed18ce8a4495c9a8473ec9a19b02ed294f9cac396caef0eabf18b51e51': 'ece5ff5a04c5b9ea9792a08e96dd54251b5eccdc504c1f1699c9d0b72590a47d',
};
