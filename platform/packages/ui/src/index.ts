// @deev/ui barrel.
//
// NOTE: src/shell.css is plain CSS and is NOT re-exported here — import it
// manually where your app mounts its shell:
//   import '@deev/ui/src/shell.css';

export { SHELL_CLASSES, mountShell } from './shell.ts';
export type { ShellParts, ShellHandle } from './shell.ts';

export { createConfirmMachine } from './confirm.ts';
export type { ConfirmMachine, ConfirmMachineOptions, ConfirmState } from './confirm.ts';

export { defineSkin, createSkinManager } from './skins.ts';
export type { Skin, SkinSpec, SkinManager, SkinManagerOptions, SkinStorage } from './skins.ts';

export { defineStore } from './storage.ts';
export type { Store, DefineStoreOptions, StorageLike, LoadResult } from './storage.ts';

export { createToastQueue } from './toasts.ts';
export type { Toast, ToastQueue, ToastQueueOptions, ToastPushOptions } from './toasts.ts';

export {
  expectStableRect,
  expectExplicitSize,
  expectStableGaps,
  isLayoutCapable,
  NO_LAYOUT_ENGINE_MESSAGE,
} from './test/layout.ts';
