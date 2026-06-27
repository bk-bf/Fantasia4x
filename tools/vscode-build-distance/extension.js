// Fantasia4x — Build Distance status bar badge.
//
// Shows commits since the last v* release tag, read live from scripts/build-distance.sh --json.
// Green/dim under the cap, yellow approaching (>=90%) and over the cap (informational only — no hard
// gate). Refreshes on every commit
// (watches .git/logs/HEAD), when the window regains focus, and on a slow fallback poll. Click to refresh
// and, when overdue, get the exact tag command to cut a release.
//
// Plain JS, no build step. Install by symlinking this folder into ~/.vscode/extensions (see README.md).

const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/** @type {vscode.StatusBarItem} */
let item;
let timer;
let watcher;

function workspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) return null;
  // Prefer the folder that actually has our script (handles multi-root workspaces).
  for (const f of folders) {
    if (fs.existsSync(path.join(f.uri.fsPath, 'scripts', 'build-distance.sh'))) return f.uri.fsPath;
  }
  return folders[0].uri.fsPath;
}

function refresh() {
  const root = workspaceRoot();
  if (!root || !item) return;
  const script = path.join(root, 'scripts', 'build-distance.sh');
  if (!fs.existsSync(script)) {
    item.hide();
    return;
  }
  const cfg = vscode.workspace.getConfiguration('fantasia4x.buildDistance');
  const max = cfg.get('max', 100);
  const env = Object.assign({}, process.env, { BUILD_DISTANCE_MAX: String(max) });

  execFile('bash', [script, '--json'], { cwd: root, env, timeout: 10000 }, (err, stdout) => {
    if (err) {
      item.text = '$(git-commit) build ?';
      item.tooltip = 'Fantasia4x build distance: ' + err.message;
      item.backgroundColor = undefined;
      item.show();
      return;
    }
    let data;
    try {
      data = JSON.parse(stdout.trim());
    } catch (_e) {
      return;
    }
    const { count, max: cap, warn, lastTag, overdue } = data;
    const ref = lastTag ? 'since ' + lastTag : 'no v* tag yet';

    if (overdue) {
      item.text = `$(warning) Build ${count}/${cap}`;
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.tooltip = `${count} commits ${ref} (cap ${cap}) — over the soft cap. Consider cutting a release.\nClick for the tag command.`;
    } else if (count >= warn) {
      item.text = `$(git-commit) Build ${count}/${cap}`;
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.tooltip = `${count} commits ${ref} (cap ${cap}) — release soon. Click to refresh.`;
    } else {
      item.text = `$(git-commit) Build ${count}/${cap}`;
      item.backgroundColor = undefined;
      item.tooltip = `${count} commits ${ref} (cap ${cap}). Click to refresh.`;
    }
    item.show();
  });
}

let buildTerminal;
function runInTerminal(root, command) {
  if (!buildTerminal || buildTerminal.exitStatus !== undefined) {
    buildTerminal = vscode.window.createTerminal({ name: 'Fantasia4x build', cwd: root });
  }
  buildTerminal.show(true);
  buildTerminal.sendText(command);
}

// Clicking the badge opens a menu to trigger a build or a release straight from the editor. The build
// itself runs in an integrated terminal so its output (and the release confirmation prompts) is visible.
async function onClick() {
  refresh();
  const root = workspaceRoot();
  if (!root) return;

  const picks = [
    { label: '$(sync) Refresh badge', detail: 'Re-read commits since the last v* tag', action: 'refresh' },
    {
      label: '$(rocket) Local build — this machine',
      detail: './build.sh --local  (unpacked, run immediately)',
      action: './build.sh --local'
    },
    {
      label: '$(package) Build installers — Linux + Windows',
      detail: './build.sh --linux --windows',
      action: './build.sh --linux --windows'
    },
    {
      label: '$(cloud-upload) Release LOCALLY — build + publish to GitHub',
      detail: './build.sh --local --push  (autotag + git-cliff + gh release)',
      action: './build.sh --local --push'
    },
    {
      label: '$(github) Release via CI — tag + push',
      detail: './build.sh --push  (GitHub Actions builds & publishes)',
      action: './build.sh --push'
    }
  ];

  const choice = await vscode.window.showQuickPick(picks, {
    placeHolder: 'Fantasia4x build / release'
  });
  if (!choice) return;
  if (choice.action === 'refresh') {
    refresh();
    return;
  }
  runInTerminal(root, choice.action);
}

function activate(context) {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'fantasia4x.buildDistance.refresh';
  context.subscriptions.push(item);
  context.subscriptions.push(
    vscode.commands.registerCommand('fantasia4x.buildDistance.refresh', onClick)
  );

  // Refresh the moment a commit lands (.git/logs/HEAD is appended on every commit / checkout / reset),
  // when the window regains focus, and on a slow fallback poll.
  const root = workspaceRoot();
  if (root) {
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '.git/logs/HEAD')
    );
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    context.subscriptions.push(watcher);
  }
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) refresh();
    })
  );

  const cfg = vscode.workspace.getConfiguration('fantasia4x.buildDistance');
  const pollMs = Math.max(5, cfg.get('pollSeconds', 30)) * 1000;
  timer = setInterval(refresh, pollMs);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  refresh();
}

function deactivate() {
  if (timer) clearInterval(timer);
}

module.exports = { activate, deactivate };
