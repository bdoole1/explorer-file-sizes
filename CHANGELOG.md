# Changelog
All notable changes to **Explorer File Sizes** are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and
Semantic Versioning.

---
## 1.0.2 — 2025-09-10
- Add “Refresh All Sizes” to command palette.
- Watch external changes to keep sizes fresh (light debounce)
- Docs: clarify deep-scan command and settings

## 1.0.1 — 2025-08-27
- Marketplace: add Visualization category
- Folder tooltips: show item counts, excluded matches, elapsed time, and cache age
- Add “Show Folder Size” command in Explorer context menu

## [0.0.6] — 2025-08-18
### Added
- README: embedded **demo GIF** and “deep-dive” feature docs.
- Packaging: `package.json` `"files"` whitelist to ensure `images/**`, `dist/**`, `README.md`, `LICENSE`, etc. are included in the VSIX.

### Changed
- README **Settings** section rewritten in a compact format for the Marketplace view.
- Clarified notes/limitations around Explorer’s single-badge rule.

### Fixed
- Ensured demo assets are available in Remote/Insiders installs.
- Minor polish to configuration change handling (full refresh on settings edits).

---

## [0.0.5] — 2025-08-18
### Changed
- Extension name normalized to **explorer-file-sizes** (identifier: `briandooley.explorer-file-sizes`).
- README overhauled with usage guidance and performance tips.

### Fixed
- Avoided color/bubble overrides so Git/Problems badges keep their styling.

---

## [0.0.4] — 2025-08-17
### Added
- **Folder sizing (optional):**
  - Background compute with **⏳** badge while calculating.
  - Tooltip shows exact total; marks `~approx` when a safety budget stops early.
  - New command **“Explorer File Sizes: Show Folder Size”** for an on-demand result with progress notification (uses larger scan budget).
- **Exclude globs** using `minimatch` (matches absolute & workspace-relative paths; supports dot-folders).
  - Default excludes: `**/node_modules/**`, `**/.git/**`, `**/dist/**`, `**/build/**`.

### Changed
- Caching & invalidation: refreshed on save/create/delete/rename and on configuration changes.

---

## [0.0.3] — 2025-08-16
### Added
- **Status bar** readout: exact size for the **active file** (remains available even when Explorer badges are off).

### Fixed
- Robust error handling around `fs.stat`/`readDirectory` to avoid noisy logs on unreadable entries.

---

## [0.0.2] — 2025-08-15
### Changed
- Build switched to **esbuild** (`dist/extension.js`) with `"main": "dist/extension.js"`.
- `.vscodeignore` trimmed to exclude sources, maps, tests; keeps bundle and assets only.

### Fixed
- TypeScript strictness & watch-mode warnings addressed.

---

## [0.0.1] — 2025-08-14
### Added
- **File size badges** in Explorer with three modes:
  - **full**: compact **2-character** badge (`B`, `1K…`, `K`, `1M…`, `M`, `1G…`, `T`).
  - **subtle**: no badge (tooltip only) for a clean look.
  - **off**: disables Explorer decorations from this extension.
- **Tooltips** with **exact bytes** and **MB** (and last-modified when available).
- Initial caching for responsiveness.

---

## Notes
- Explorer shows **one** decoration per item; other providers (Problems, SCM, “Contains emphasized items”) may occupy the slot, hiding this extension’s badge/tooltip.
- Folder tooltips require a visible decoration to hover. Use the **Show Folder Size** command for a guaranteed total with progress.
