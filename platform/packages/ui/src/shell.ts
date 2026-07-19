// Pure-DOM assembly helpers for the .dv-shell class structure defined in
// shell.css. No framework dependency — React (or anything else) can wrap
// this in a thin adapter; see README.md.

export const SHELL_CLASSES = {
  shell: 'dv-shell',
  header: 'dv-shell-header',
  content: 'dv-shell-content',
  dock: 'dv-shell-dock',
} as const;

export interface ShellParts {
  header?: HTMLElement;
  content: HTMLElement;
  dock?: HTMLElement;
}

export interface ShellHandle {
  /** Removes the shell class + appended parts, restoring root to plain. */
  destroy(): void;
}

/**
 * Assembles the mobile app-shell structure under `root`: an optional sticky
 * header, the scrollable content region, and an optional dock docked
 * OUTSIDE the scroll region (see shell.css for why). Appends `parts` as
 * direct children of `root` in header → content → dock order and tags each
 * with its `dv-` class.
 */
export function mountShell(root: HTMLElement, parts: ShellParts): ShellHandle {
  root.classList.add(SHELL_CLASSES.shell);

  if (parts.header) {
    parts.header.classList.add(SHELL_CLASSES.header);
    root.appendChild(parts.header);
  }

  parts.content.classList.add(SHELL_CLASSES.content);
  root.appendChild(parts.content);

  if (parts.dock) {
    parts.dock.classList.add(SHELL_CLASSES.dock);
    root.appendChild(parts.dock);
  }

  return {
    destroy() {
      root.classList.remove(SHELL_CLASSES.shell);
      if (parts.header) {
        parts.header.classList.remove(SHELL_CLASSES.header);
        root.removeChild(parts.header);
      }
      parts.content.classList.remove(SHELL_CLASSES.content);
      root.removeChild(parts.content);
      if (parts.dock) {
        parts.dock.classList.remove(SHELL_CLASSES.dock);
        root.removeChild(parts.dock);
      }
    },
  };
}
