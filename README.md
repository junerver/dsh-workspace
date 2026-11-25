# dsh-workspace

A DeepSeek Harness (DSH) plugin bundle that lets you **move a conversation into a directory workspace from the sidebar** — by dragging the row onto a workspace, or from the row's menu.

## Why this exists

DSH decides which workspace a session belongs to by comparing the session header's `cwd` with each registered workspace directory. That header field is immutable: once a conversation started in the default workspace, no amount of reordering can put it under another directory workspace — the recorded directory still points at the old one. Dragging a session between workspace groups is simply not offered.

This plugin fills that gap.

## Install

The bundle is installed from a local directory through **Plugins → Add plugin** (or `plugin_manager` `install_bundle`). The directory must contain `package.json`, `cordis.patch.yml`, `index.js`, `client.js`, `locale/`, `docs/` and `icon.svg`.

```
E:\GitHub\dsh-workspace
```

After installing, restart DSH once: the bundle adds both a Host plugin row and a Web client module.

## Usage

- **Drag** — press and drag any conversation row in the sidebar, move over a target workspace group (its header, or any conversation inside it). The group highlights; release to move.
- **Menu** — hover the row and click the folder-arrow button, or open the row's `⋯` menu and choose **Move to workspace…**, then pick a workspace.

A short toast confirms the result at the top of the window, naming the target workspace.

## How it works

Because the session header cannot be rewritten in place, a move is a **safe migration copy**:

1. A new session is created inside the target workspace, seeded from the source conversation's history up to its last completed turn — the same seeding a fork uses.
2. The new session is attached to the target workspace.
3. The original session is archived and the migrated copy is opened.

Nothing is overwritten: the source log stays intact, and unarchiving it from **View options → All conversations** undoes the move.

### Host side

`index.js` registers one command and one tool over the same implementation:

| Surface | Name | Notes |
| --- | --- | --- |
| Host command | `/move-workspace-to <workspaceId>` | Driven by the sidebar through the existing `commands.execute` Remote bridge. |
| Agent tool | `move_session_to_workspace` | `session_id`, `workspace_id`, optional `dry_run` to preview the plan. |

The seed is built from plain JSON values and the migration always cuts at a `turn/end`, so the inherited prefix is balanced and needs no synthetic turn closers. The bundle imports nothing from the DSH installation — a workspace-linked bundle cannot resolve those specifiers through Node.

### Client side

`client.js` contributes three slot entries:

| Slot | Entry | Purpose |
| --- | --- | --- |
| `sidebar.workspaces.session.row.action` | `workspace-move` (150) | Hover button on each session row. |
| `sidebar.workspaces.session.menu.item` | `workspace-move` (520) | `⋯` menu row. |
| `shell.overlay` | `workspace-move-overlay` (900) | Workspace chooser dialog, toast, and drag hint. |

Drag targeting resolves against the sidebar's own structural keys — `data-row-key="session:<id>"` and `data-row-key="workspace:<id>"` — rather than a floating panel, so a narrow window cannot cover the drop targets. The overlay layer is `pointer-events: none`, so it never intercepts the drag.

## Limitations

- The migrated conversation is a **new session** (new id); the original id is not reused.
- Only completed turns are carried over; an in-progress turn is not included.
- A session with no completed turn cannot be migrated.
- Sessions already in the target workspace are left untouched.

## Files

```
package.json          bundle manifest (Host plugin + Web client module)
cordis.patch.yml      Loader patch inserting the plugin row
index.js              Host: migration, /move-workspace-to, move_session_to_workspace
client.js             Web: drag targeting, row action, menu row, chooser, toast
locale/en.json        Plugin Manager title/description (English)
locale/zh.json        Plugin Manager title/description (Chinese)
docs/DETAIL.md        Detail page shown in Plugin Manager
icon.svg              Plugin icon
```
