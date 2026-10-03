/** Exact source transitions audited in docs/changes/2026-09-30-explorer-recovery.md
 * and docs/changes/2026-10-03-explorer-wording-audit.md.
 * Values pin every implementation byte, including the guard that reads this
 * manifest. Only this data-only manifest is excluded from that second digest.
 * A later engine/controller edit disables these entries until separately audited.
 */
export const AUDITED_EXPLORER_COMPATIBILITY: Readonly<Record<string, string>> = {
  // 8ed95e54 and 5c8fff1f (audited 2026-09-30), carried to the wording-only transition audited 2026-10-03.
  '3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a': 'f5a0c2f32ceca86fb34a868563bc6a687afdb356e9e679730acf5a1a6da0be6f',
  'c89676ed18ce8a4495c9a8473ec9a19b02ed294f9cac396caef0eabf18b51e51': 'f5a0c2f32ceca86fb34a868563bc6a687afdb356e9e679730acf5a1a6da0be6f',
  // The 2026-09-30 release itself (full source of implementation ece5ff5a…), audited 2026-10-03.
  'fb0e89a76acfce15b6ac0ac64d00cdadc07be32a37d3b07f4c67022d5e64d783': 'f5a0c2f32ceca86fb34a868563bc6a687afdb356e9e679730acf5a1a6da0be6f',
};
