# dsh-workspace

A [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) plugin bundle that lets you **move a conversation into a directory workspace from the sidebar** — by dragging the row onto a workspace, or from the row's menu.

```bash
# install into a DSH profile
dsh plugin add @junerver/dsh-workspace
```

<sub>Not sure of your install route? The bundle also installs from a local directory through **Plugins → Add plugin**.</sub>

## Why this exists

DSH decides which workspace a session belongs to by comparing the session header's `cwd` with each registered workspace directory. That header field is immutable: once a conversation started in the default workspace, no amount of reordering can put it under another directory workspace — the recorded directory still points at the old one. Dragging a session between workspace groups is simply not offered.

This plugin fills that gap.

## Usage

### Move a conversation between workspaces

- **Drag** — press and drag any conversation row in the sidebar, then move over a target workspace group (its header, or any conversation inside it). The group highlights; release to move.
- **Menu** — hover the row and click the folder-arrow button, or open the row's `⋯` menu and choose **Move to workspace…**, then pick a workspace.

A short toast confirms the result at the top of the window, naming the target workspace.

### Pin a workspace

Open a workspace's `⋯` menu and choose **置顶工作区** (**Pin workspace**) / **取消置顶** (**Unpin**). Pinned workspaces move to the top of the sidebar and stay there across reloads; several pinned workspaces keep the order you pinned them in.

### Unread-completion marker on folded workspaces

DSH already draws a green dot on a conversation that finished while you were looking elsewhere. A folded workspace hides its rows, and that signal disappears with them — so this plugin puts the same marker on the workspace header instead: a dot when one conversation finished, a count when several did. Expanding the group removes it, because the rows show their own dots again.

The marker reads the same `uiSession.sessionStatus` snapshot the rows read, so the two can never disagree. It is decoration only: `aria-hidden`, and it never intercepts a click.

### Completion marks survive a restart

DSH keeps `completionUnread` in memory, so every dot — on a row and on a workspace header — vanished when DSH exited. This plugin keeps its own durable copy in `localStorage` (`dsh.workspaceMove.unreadCompletions`):

- a conversation becomes marked when it stops running while you are not looking at it;
- the mark is cleared **only** by opening that conversation, or by it running again;
- marks whose conversation no longer exists are pruned, so the set stays small;
- pruning is skipped until the session list has settled, so a cold start cannot wipe the marks before the list arrives.

Row dots render through `sidebar.session.row.leading`, the cell the shipped row leaves free exactly while its own status is idle — so the durable dot and the built-in one never draw together.

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

The seed is built from plain JSON values and the migration always cuts at a `turn/end`, so the inherited prefix is balanced and needs no synthetic turn closers. The bundle imports nothing from the DSH installation — a bundle resolved from a registry has no route to `@deepseek-ai/*`, so every service is reached through `ctx`.

### Client side

`client.js` contributes these slot entries:

| Slot | Entry | Purpose |
| --- | --- | --- |
| `sidebar.workspaces.session.row.action` | `workspace-move` (150) | Hover button on each session row. |
| `sidebar.workspaces.session.menu.item` | `workspace-move` (520) | `⋯` menu row. |
| `shell.overlay` | `workspace-move-overlay` (900) | Workspace chooser, toast, and drag hint. |

It also registers one structured menu contribution through `ctx.contextMenus` (`workspaceMove.pin`, target `workspace`, order 150) — the same target family ui-workspace uses for rename and delete.

Drag targeting resolves against the sidebar's own structural keys — `data-row-key="session:<id>"` and `data-row-key="workspace:<id>"` — rather than a floating panel, so a narrow window cannot cover the drop targets. The overlay layer is `pointer-events: none`, so it never intercepts the drag.

**Pinning** reorders through `ctx.workspaces.insertBefore`. That call appends when given no anchor, so the pinned block is built by inserting each workspace before the element that currently follows its target slot. The pin set itself is plugin-local (`localStorage`): the Host has no workspace pin concept, and only the resulting order needs to be durable — which is exactly what the sidebar renders.

## Limitations

- The migrated conversation is a **new session** (new id); the original id is not reused.
- Only completed turns are carried over; an in-progress turn is not included.
- A session with no completed turn cannot be migrated.
- Sessions already in the target workspace are left untouched.

## Development

No build step — the published files are the sources.

```bash
npm run check      # bundle structure, module faces, patch, locales
npm run pack:dry   # inspect the tarball contents
```

### Release

Releases are published from GitHub Actions over OIDC ([npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)), so no `NPM_TOKEN` secret exists in this repository.

1. Bump `version` in `package.json` and commit.
2. Push a matching tag:
   ```bash
   git tag v1.0.5 && git push origin v1.0.5
   ```
3. `.github/workflows/publish.yml` verifies the tag against the manifest, runs `npm run check`, and publishes with provenance.

**The very first version must be published by hand** — npm has no pending-publisher state, so a trusted publisher can only be configured for a package that already exists:

```bash
npm login
npm publish --access public
```

Then, on npmjs.com → the package → **Settings → Trusted publisher**, add:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization / user | `junerver` |
| Repository | `dsh-workspace` |
| Workflow filename | `publish.yml` |
| Environment | *(leave empty)* |
| Allowed actions | `npm publish` **and** `npm stage publish` |

Every field is case-sensitive and is not validated when saved — a mismatch surfaces only as a 404 at publish time. A newly added trusted publisher expires unless its first publish succeeds within two days.

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
scripts/check.mjs     Offline structure and module-face checks (CI)
```

## License

MIT
