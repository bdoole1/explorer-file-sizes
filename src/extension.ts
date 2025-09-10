/**
 * Explorer File Sizes — badges & tooltips for file sizes; optional folder sizes.
 * Folders compute in the background with a ⏳ hotspot while calculating (if enabled).
 * We avoid coloring to not override Git/Problems tints; Explorer only shows one decoration per item.
 */
import * as vscode from 'vscode';
import { Minimatch } from 'minimatch';

type SizeEntry = {
  size: number;            // bytes; -1 = calculating; NaN = disabled/unavailable
  mtime?: number;
  computedAt: number;
  isDir?: boolean;
  approx?: boolean;        // true if truncated by budget
  files?: number;
  dirs?: number;
  excluded?: number;
  elapsedMs?: number;
};

const CACHE_TTL_MS = 15_000;                 // refresh size cache every 15s
const inflight = new Map<string, Promise<void>>(); // running folder jobs
let excludeMatchers: Minimatch[] = [];       // compiled globs

/** Compile user globs to matchers (called on activate + when setting changes) */
function loadExcludeGlobs() {
  const cfg = vscode.workspace.getConfiguration('explorerFileSizes');
  const globs = cfg.get<string[]>('excludeGlobs') || [];
  excludeMatchers = globs.map(g =>
    new Minimatch(g.replace(/\\/g, '/'), {
      dot: true, // match dotfolders like .git
      nocase: process.platform === 'win32'
    })
  );
}

/** Check if a path should be excluded by user globs (absolute or workspace-relative). */
function isExcluded(uri: vscode.Uri): boolean {
  if (!excludeMatchers.length) return false;
  const abs = uri.fsPath.replace(/\\/g, '/');
  const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
  return excludeMatchers.some(mm => mm.match(abs) || mm.match(rel));
}

export function activate(context: vscode.ExtensionContext) {

    // at top-level in activate()
  let watchers: vscode.FileSystemWatcher[] = [];

  function setupWatchers() {
    // dispose old watchers (if workspace folders changed)
    for (const w of watchers) w.dispose();
    watchers = [];

    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const w = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

      const onTouch = (uri: vscode.Uri) => {
        invalidatePathAndAncestors(uri);
      };

      w.onDidCreate(onTouch);
      w.onDidChange(onTouch);
      w.onDidDelete(onTouch);

      watchers.push(w);
    }
  }

  function invalidatePathAndAncestors(uri: vscode.Uri) {
    const touched = new Set<string>();
    const touch = (u: vscode.Uri) => {
      const k = u.toString();
      if (!touched.has(k)) {
        cache.delete(k);
        touched.add(k);
      }
    };

    // file/folder itself
    touch(uri);

    // parent folders up to workspace root
    let p = uri.path;
    while (true) {
      const i = p.lastIndexOf('/');
      if (i <= 0) break;
      p = p.slice(0, i);
      touch(uri.with({ path: p }));
    }

    // Notify decorations for just the affected paths
    onDidChangeFileDecorations.fire(Array.from(touched).map(s => vscode.Uri.parse(s)));

    // Status bar update if the active doc is the one we touched
    if (vscode.window.activeTextEditor?.document?.uri.toString() === uri.toString()) {
      void updateStatus(uri);
    }
  }

  // call once on startup and whenever folders change
  setupWatchers();
  context.subscriptions.push(
    ...watchers,
    vscode.workspace.onDidChangeWorkspaceFolders(() => setupWatchers())
  );

  console.log('Explorer File Sizes activated');

  const config = () => vscode.workspace.getConfiguration('explorerFileSizes');

  // Status bar item (shows file size for active editor; handy when badgeMode=off)
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.name = 'Explorer File Sizes';
  context.subscriptions.push(
    status,
    vscode.window.onDidChangeActiveTextEditor(e => updateStatus(e?.document?.uri)),
  );
  updateStatus(vscode.window.activeTextEditor?.document?.uri);

  // Compile exclude globs once at startup
  loadExcludeGlobs();

  const cache = new Map<string, SizeEntry>();
  // allow `undefined` so we can refresh EVERYTHING at once
  const onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: onDidChangeFileDecorations.event,
    async provideFileDecoration(uri) {
      try {
        // Skip work if user turned badges off
        const mode = (config().get<'full'|'subtle'|'off'>('badgeMode') || 'full');
        if (mode === 'off') return;

        const stat = await getSize(uri);
        if (!stat) return;

        // If folder sizes are disabled, don't decorate folders at all
        if (stat.isDir && Number.isNaN(stat.size)) return;

        const isFolder = !!stat.isDir;
        const isFull = mode === 'full';

        let badge: string | undefined;
        if (isFolder) {
          if (!Number.isNaN(stat.size)) {
            // size known
            if (getFolderBadgeMode() === 'size') {
              badge = twoCharBadge(stat.size);  // show 2-char size on folders
            }
          } else if (stat.size < 0) {
            // calculating
            if (getFolderBadgeMode() !== 'off') {
              badge = '⏳';
            }
          } else {
            // size disabled (NaN) -> no badge
          }
        } else if (mode === 'full') {
          badge = twoCharBadge(stat.size);  // files as before
        }

        const decoration: vscode.FileDecoration = {
          ...(badge ? { badge } : {}),
          tooltip: await tooltipFor(uri, stat),
          propagate: false
        };
        return decoration;
      } catch {
        return;
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('explorerFileSizes.refreshAll', async () => {
      cache.clear();
      onDidChangeFileDecorations.fire(undefined); // refresh everything
      updateStatus(vscode.window.activeTextEditor?.document?.uri);
      vscode.window.showInformationMessage('Explorer File Sizes: refreshed.');
    })
  );

  // Command: on-demand folder size with larger budget + progress UX (works even if another badge wins)
  context.subscriptions.push(
    vscode.commands.registerCommand('explorerFileSizes.showFolderSize', async (uri: vscode.Uri) => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Calculating folder size…' },
        async () => {
          try {
            const { total, approx } = await dirSizeBudgeted(uri, { maxEntries: 100_000, maxTimeMs: 5_000 });
            vscode.window.showInformationMessage(`Folder size: ${approx ? '~' : ''}${humanExact(total)}${approx ? ' (approx)' : ''}`);
          } catch {
            vscode.window.showErrorMessage('Failed to compute folder size.');
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(provider),

    vscode.workspace.onDidSaveTextDocument(doc => {
      cache.delete(doc.uri.toString());
      onDidChangeFileDecorations.fire(doc.uri);
      if (vscode.window.activeTextEditor?.document?.uri.toString() === doc.uri.toString()) {
        updateStatus(doc.uri);
      }
    }),

    vscode.workspace.onDidCreateFiles(e => {
      for (const f of e.files) cache.delete(f.toString());
      onDidChangeFileDecorations.fire([...e.files]); // spread to fix readonly Uri[]
    }),

    vscode.workspace.onDidDeleteFiles(e => {
      for (const f of e.files) cache.delete(f.toString());
      onDidChangeFileDecorations.fire([...e.files]); // spread to fix readonly Uri[]
    }),

    vscode.workspace.onDidRenameFiles(e => {
      for (const { oldUri, newUri } of e.files) {
        cache.delete(oldUri.toString());
        cache.delete(newUri.toString());
      }
      onDidChangeFileDecorations.fire(e.files.map(f => f.newUri));
    }),

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('explorerFileSizes.excludeGlobs')) {
        loadExcludeGlobs();
      }
      if (e.affectsConfiguration('explorerFileSizes')) {
        cache.clear();
        onDidChangeFileDecorations.fire(undefined); // refresh EVERYTHING (Explorer, tabs, etc.)
        updateStatus(vscode.window.activeTextEditor?.document?.uri);
      }
    })
  );

  function getFolderBadgeMode(): 'off' | 'calculating' | 'size' {
    const cfg = vscode.workspace.getConfiguration('explorerFileSizes');
    // Prefer the new setting; fall back to legacy folderHoverIndicator if present
    return (cfg.get<'off'|'calculating'|'size'>('folderBadgeMode'))
        ?? (cfg.get<'calculating'|'off'>('folderHoverIndicator') === 'calculating' ? 'calculating' : 'off');
  }

  /** Return size info for files immediately; folders compute async with budget. */
  async function getSize(uri: vscode.Uri): Promise<SizeEntry | undefined> {
    const key = uri.toString();
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.computedAt < CACHE_TTL_MS) return cached;

    // fs.stat
    let fsStat: vscode.FileStat | undefined;
    try { fsStat = await vscode.workspace.fs.stat(uri); } catch { return; }
    const isDir = !!(fsStat.type & vscode.FileType.Directory);

    // Files: return immediately
    if (!isDir) {
      const entry: SizeEntry = { size: fsStat.size, mtime: fsStat.mtime, computedAt: now, isDir: false };
      cache.set(key, entry);
      return entry;
    }

    // Folders: if disabled, mark as unavailable (we'll hide decoration)
    if (!config().get<boolean>('enableFolderSizes')) {
      const entry: SizeEntry = { size: NaN, computedAt: now, isDir: true };
      cache.set(key, entry);
      return entry;
    }

    // If we already have a recent computed value, use it
    if (cached && !Number.isNaN(cached.size) && cached.size >= 0) return cached;

    // Kick off background job if not already running
    if (!inflight.has(key)) {
      inflight.set(key, (async () => {
        try {
          const { total, approx, files, dirs, excluded, elapsedMs } = await dirSizeBudgeted(uri);
          cache.set(key, {
            size: total,
            computedAt: Date.now(),
            isDir: true,
            approx,
            files,
            dirs,
            excluded,
            elapsedMs
          });
        } finally {
          inflight.delete(key);
          onDidChangeFileDecorations.fire(uri); // refresh when ready
        }
      })());
    }

    // Return a "calculating" placeholder
    const pending: SizeEntry = { size: -1, computedAt: now, isDir: true };
    cache.set(key, pending);
    return pending;
  }

  /** Folder walk with time/entry budget to keep UI responsive. */
  async function dirSizeBudgeted(
    root: vscode.Uri,
    budget: { maxEntries: number; maxTimeMs: number } = { maxEntries: 25_000, maxTimeMs: 1_500 }
  ) {
    const MAX_ENTRIES = budget.maxEntries;
    const MAX_TIME_MS = budget.maxTimeMs;

    let total = 0;
    let files = 0;
    let dirs = 0;
    let excluded = 0;
    let approx = false;

    const start = Date.now();
    const q: vscode.Uri[] = [root];

    while (q.length) {
      const cur = q.shift()!;
      let entries: [string, vscode.FileType][];
      try { entries = await vscode.workspace.fs.readDirectory(cur); } catch { continue; }

      for (const [name, type] of entries) {
        const child = vscode.Uri.joinPath(cur, name);
        if (isExcluded(child)) { excluded++; continue; }

        if (type & vscode.FileType.Directory) {
          dirs++;
          q.push(child);
        } else {
          try {
            const st = await vscode.workspace.fs.stat(child);
            total += st.size;
            files++;
          } catch { /* ignore unreadable */ }
        }

        if (files >= MAX_ENTRIES || (Date.now() - start) > MAX_TIME_MS) {
          approx = true;
          break;
        }
      }
      if (approx) break;
    }

    const elapsedMs = Date.now() - start;
    return { total, approx, files, dirs, excluded, elapsedMs };
  }

  /** Compact 2-char badge for files. */
  function twoCharBadge(bytes: number): string {
    if (Number.isNaN(bytes)) return '—';
    const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;

    if (bytes < KB) return 'B';
    if (bytes < 10 * KB) return `${Math.floor(bytes / KB)}K`;
    if (bytes < MB) return 'K';
    if (bytes < 10 * MB) return `${Math.floor(bytes / MB)}M`;
    if (bytes < GB) return 'M';
    if (bytes < 10 * GB) return `${Math.floor(bytes / GB)}G`;
    if (bytes < TB) return 'G';
    const t = Math.floor(bytes / TB);
    return t < 10 ? `${t}T` : 'T';
  }

  /** Tooltip text for files/folders. */
  async function tooltipFor(uri: vscode.Uri, s: SizeEntry): Promise<string> {
    const name = uri.path.split('/').pop() || '';

    if (s.isDir) {
      const name = uri.path.split('/').pop() || '';
      if (Number.isNaN(s.size)) return `${name}\nFolder (size disabled)`;
      if (s.size < 0)          return `${name}\nCalculating folder size…`;

      const exact = humanExact(s.size);
      const approxMark = s.approx ? `~` : '';
      const cacheAgeSec = Math.max(0, Math.floor((Date.now() - s.computedAt) / 1000));

      const itemsLine =
        (typeof s.files === 'number' || typeof s.dirs === 'number')
          ? `\nItems: ${s.files ?? 0} files • ${s.dirs ?? 0} dirs`
          : '';

      const excludedLine =
        (typeof s.excluded === 'number' && s.excluded > 0)
          ? `\nExcluded: ${s.excluded} matches (from excludeGlobs)`
          : '';

      const elapsedLine =
        (typeof s.elapsedMs === 'number')
          ? `\nScanned in ${s.elapsedMs} ms • Cache age ${cacheAgeSec} s`
          : `\nCache age ${cacheAgeSec} s`;

      return `${name}\n${approxMark}${exact}${s.approx ? ' (approx)' : ''}${itemsLine}${excludedLine}${elapsedLine}`;
    }

    // Files
    const exact = humanExact(s.size);
    const mtime = s.mtime ? new Date(s.mtime).toLocaleString() : '';
    return `${name}\n${exact}${mtime ? `\nModified: ${mtime}` : ''}`;
  }

  /** Human friendly exact bytes & MB string. */
  function humanExact(bytes: number) {
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(2);
    return `${bytes.toLocaleString()} bytes (${mb(bytes)} MB)`;
  }

  /** Status bar updater for the active file. */
  async function updateStatus(uri?: vscode.Uri) {
    if (!uri) { status.hide(); return; }
    try {
      const s = await getSize(uri);
      if (s && !s.isDir && !Number.isNaN(s.size)) {
        status.text = `$(database) ${humanExact(s.size)}`;
        status.show();
      } else {
        status.hide();
      }
    } catch {
      status.hide();
    }
  }
}

export function deactivate() {}
