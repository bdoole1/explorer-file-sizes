# Explorer File Sizes

Tiny, fast badges in the VS Code Explorer showing file sizes. Hover to see exact bytes/MB. Optional recursive folder sizes.

![Demo](https://github.com/bdoole1/explorer-file-sizes/blob/main/images/demo.gif?raw=true)
> Tip: Prefer **Subtle** for clean Explorer UI—tooltips without extra badges.

> **What’s new in 1.0.2**
> - **Refresh All Sizes** command (clear cache + refresh decorations).
> - **External change watcher** to keep sizes fresh when files change outside VS Code.
> - **Folder Badge Mode** is now set to showing folder sizes by default.

---

## Features

### 1) File size badges (Explorer)
  - **Full** shows a compact 2-character badge next to each file: `B`, `1K…9K`, `K`, `1M…9M`, `M`, `G`, `T`.
  - **Subtle** shows **no badge** but keeps a **rich tooltip** on hover (minimal visual noise).
  - **Off** removes all Explorer decorations created by this extension.
- **Tooltips** Always show **exact bytes** and **MB** for files (and last modified date when available).

### 2) Folder sizes (optional, background compute)
- **How it works**
  - When **Enable Folder Sizes** is **ON**, folders are scanned in the background with a **time/entry budget** to keep the UI snappy.
  - While the size is being computed, a **⏳** badge appears (configurable via **Folder Badge Mode** / legacy **Folder Hover Indicator**).
  - Tooltips show the **exact total**; `~` + “approx” when a budget stops early.
  - To avoid clashes with other decorations (Problems/SCM/etc.), this extension **doesn’t show persistent folder badges** by default.
  - **On‑demand deep scan:** Right‑click a folder → **Explorer File Sizes: Show Folder Size** (larger budget with progress).
  - Or: **Command Palette** → “**Explorer File Sizes: Show Folder Size**” (prompts you to pick a folder if none is selected).

### 3) Status bar size (active editor)
- Shows the **exact size** for the currently active file in the **Status Bar**, even when badges are **Off**.

### 4) Exclude globs (minimatch)
- Skip heavy or noisy paths (e.g., `**/node_modules/**`, `**/.git/**`, `**/dist/**`, `**/build/**`) during folder scans.
- Uses `minimatch` with:
  - `dot: true` (matches dot-folders like `.git`)
  - `nocase` on Windows
  - Matches both **absolute** and **workspace-relative** paths
- Examples:
  - Ignore all `node_modules`:
    `**/node_modules/**`
  - Ignore generated assets:
    `**/dist/**`, `**/build/**`, `**/.next/**`, `**/target/**`
  - Ignore logs/temp:
    `**/*.log`, `**/tmp/**`, `**/.cache/**`

> Tune this list per project for faster, more accurate folder sizes.

### 5) Caching & refresh
- Results are cached for **~15 seconds** to keep the Explorer snappy.
- The cache invalidates on file create/delete/rename/save, or when you change any of the extension’s settings.

### 6) Remote-friendly & safe
- Works in Local, **Remote-SSH**, WSL, and Containers.
- Reads metadata via the VS Code **FileSystem** API—no external binaries, no telemetry.

---
## Commands

- **Explorer File Sizes: Show Folder Size**
  Right-click a folder in Explorer → *Show Folder Size* (deep scan with progress).

- **Explorer File Sizes: Refresh All Sizes**
  Command Palette → *Refresh All Sizes* to clear the cache and refresh all decorations immediately.

---

### Installation

**Requirements:** VS Code ≥ 1.90

**From Marketplace (recommended)**
1. Open the **Extensions** view (`Ctrl/Cmd+Shift+X`).
2. Search **Explorer File Sizes**.
3. Click **Install**.
   > For Remote-SSH/WSL/Containers, use **Install in…** to target the remote.

**Install via CLI**
There are two ways to get the `.vsix`:

**A) Download a prebuilt .vsix**
- **GitHub Releases:** [Latest release](https://github.com/bdoole1/explorer-file-sizes/releases/latest) → download the `.vsix` asset.
- **VS Code Marketplace:** Open the extension page and click **Download Extension** to save a `.vsix`.

**B) Build it yourself**
```bash
git clone https://github.com/bdoole1/explorer-file-sizes.git
cd explorer-file-sizes
npm ci
npm run compile
npx vsce package   # outputs ./explorer-file-sizes-<version>.vsix
```

**Install the .vsix**
- VS Code: **Extensions: Install from VSIX...** → select the file
- CLI:
```bash
# VS Code Stable
code --install-extension ./explorer-file-sizes-<version>.vsix
# VS Code Insiders
code-insiders --install-extension ./explorer-file-sizes-<version>.vsix
```

## Settings (compact)

| Setting | Default | Type | Description |
| --- | --- | --- | --- |
| `explorerFileSizes.badgeMode` | `full` | string (`full`/`subtle`/`off`) | Controls file badges. **Full** shows 2-char size; **Subtle** shows tooltip only; **Off** disables Explorer decorations. |
| `explorerFileSizes.enableFolderSizes` | `true` | boolean | Compute folder sizes in the background; shows ⏳ while scanning (if enabled). |
| `explorerFileSizes.folderBadgeMode` | `calculating` | string (`off`/`calculating`/`size`) | Folder badge behavior: show nothing, show ⏳ while computing, or a 2‑char size on folders. |
| `explorerFileSizes.excludeGlobs` | see default | string[] | Globs skipped during folder scans (minimatch). Matches absolute and workspace‑relative paths. |

> **Legacy alias:** `explorerFileSizes.folderHoverIndicator` (`calculating`/`off`) is supported as a backward‑compatible alias for `folderBadgeMode` (only `calculating` or `off`).

**Quick JSON snippet**
```json
{
  "explorerFileSizes.badgeMode": "subtle",
  "explorerFileSizes.enableFolderSizes": true,
  "explorerFileSizes.folderBadgeMode": "calculating",
  "explorerFileSizes.excludeGlobs": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.cache/**"
  ]
}
```

---

## Notes & constraints
- VS Code shows **one** decoration per item; other providers may mask this extension’s badge/tooltip on that item.
- Budgets (time/entry count) keep the UI responsive; folder tooltips show `~` when that happens.
- Use the Explorer context menu for a guaranteed, deeper folder size.

## Privacy
This extension sends **no telemetry** and makes **no network requests**. All size calculations happen locally.

---

## Changelog
See [CHANGELOG.md](./CHANGELOG.md).
