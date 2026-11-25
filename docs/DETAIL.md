# Move conversation to workspace

DSH groups a session under the workspace whose directory matches the `cwd` recorded, immutably, in the session's header. A conversation that started in the default workspace therefore cannot be dropped into another directory workspace by reordering — its recorded directory still points at the default one.

This plugin makes that move possible from the sidebar.

## How to use

- **Drag:** press and drag any conversation row in the sidebar. While dragging, move over a workspace group (its header, or any conversation inside it); that group lights up and releasing the row moves the conversation there.
- **Menu:** hover the row and click the folder-arrow button, or open the row's ⋯ menu and choose **Move to workspace…**, then pick a workspace.

## Pin a workspace

A workspace's ⋯ menu offers **置顶工作区** / **取消置顶**. Pinned workspaces move to the top of the sidebar and stay there across reloads; pinning several keeps the order you pinned them in. The pin set lives in the browser, and only the resulting workspace order is written to the Host — the sidebar renders that order, so a pinned workspace is pinned for the whole profile.

## What it actually does

Because the header directory cannot be rewritten in place, the move is a **safe migration copy**:

1. A new session is created inside the target workspace, seeded from the source conversation's history up to its last completed turn (the same seeding a fork uses).
2. The new session is attached to the target workspace.
3. The original session is archived, and the migrated copy is opened.

Nothing is overwritten and the original log is preserved: you can unarchive it from **View options → All conversations** to undo.

## Limitations

- The migrated conversation is a **new session** (new id); the original id is not reused.
- Only completed turns are carried over; an in-progress turn is not included.
- A session with no completed turn cannot be migrated.
- Sessions already in the target workspace are left untouched.

## Agent tool

The same operation is exposed to the agent as `move_session_to_workspace` (`session_id`, `workspace_id`, optional `dry_run`). `dry_run: true` returns the plan without creating anything.
