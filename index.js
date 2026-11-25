/**
 * Host half of the "move conversation to workspace" bundle.
 *
 * A DSH session's workspace membership is derived from the immutable `cwd` in
 * the session header, so an already-recorded conversation cannot be re-homed by
 * editing that header. This plugin therefore performs a safe, reversible
 * *migration copy*: it creates a brand-new session inside the target workspace
 * whose history is seeded from the source conversation (exactly the mechanism a
 * fork uses), attaches it to the target workspace, and lets the caller archive
 * the original.
 *
 * Two callers share one implementation:
 *  - a Host command `move-workspace-to` (the sidebar UI drives it through the
 *    existing `commands.execute` Remote bridge), and
 *  - a Host tool `move_session_to_workspace` (agent-callable, with a `dry_run`
 *    mode that only plans).
 *
 * The seed is built with plain values only: the migration always cuts at a
 * `turn/end`, so the inherited prefix is balanced and needs no synthetic
 * closers. Branded ids are compile-time brands with no runtime identity, so raw
 * strings and numbers are accepted by the Host services. This keeps the bundle
 * free of imports from the DSH installation, which a workspace-linked bundle
 * cannot resolve through Node directly.
 */

import { randomUUID } from 'node:crypto'

/** Cordis plugin name. */
export const name = 'workspace-move'

/** Services the plugin needs. */
export const inject = ['commands', 'tools', 'agents', 'workspaceRegistry', 'agentDefaultModel', 'sessionQuery']

/**
 * Index of the last completed `turn/end` event, i.e. the boundary to inherit through.
 * @param {readonly {type: string}[]} events contiguous session events from seq 0.
 * @returns the boundary sequence, or undefined when the session has no completed turn.
 */
function lastCompletedBoundary(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'turn/end') return i
  }
  return undefined
}

/**
 * Build a fork seed ending exactly at `boundarySeq` (a `turn/end`), appending the
 * inherited marker. The prefix is balanced, so no synthetic turn closers apply.
 * @param {readonly any[]} events contiguous session events from seq 0.
 * @param {number} boundarySeq inclusive sequence to inherit through.
 * @returns {any[]} the seed array.
 */
function buildSeed(events, boundarySeq) {
  const prefix = events.slice(0, boundarySeq + 1)
  const last = events[boundarySeq]
  prefix.push({
    type: 'session/end-seed',
    seq: boundarySeq + 1,
    time: last.time,
    data: { inherited: true },
  })
  return prefix
}

/**
 * Build the creation-time Agent setup for the source session's preset.
 * @param {any} ctx Host context.
 * @param {string | null | undefined} presetId preset recorded on the source session, if any.
 * @returns {Promise<{ agentPreset?: string, setup?: (agentCtx: any) => any }>}
 */
async function compositionFor(ctx, presetId) {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return { setup: undefined }
  const resolvedId = (await presets.resolve(presetId === null ? undefined : presetId)).id
  return {
    agentPreset: resolvedId,
    setup: async (agentCtx) => {
      await presets.mount(agentCtx, resolvedId)
    },
  }
}

/** Provider/model/reasoning accessors that follow the current default selection. */
function defaultAgentOptions(ctx) {
  const defaults = ctx.agentDefaultModel
  return {
    get provider() { return defaults.currentSelection().provider },
    get model() { return defaults.currentSelection().model },
    get reasoningEffort() { return defaults.currentSelection().reasoningEffort },
  }
}

/**
 * Core migration: seed a new session in `targetWorkspaceId` from `source` history.
 * @param {any} ctx Host context.
 * @param {{ id: string, events: readonly any[], preset?: string | null }} source source session facts.
 * @param {string} targetWorkspaceId target workspace id.
 * @param {boolean} dryRun when true, plan only and create nothing.
 */
async function migrate(ctx, source, targetWorkspaceId, dryRun) {
  if (typeof targetWorkspaceId !== 'string' || targetWorkspaceId.trim() === '') {
    return { ok: false, error: '缺少目标工作区 ID' }
  }
  const targetId = targetWorkspaceId.trim()
  let workspace
  try {
    workspace = ctx.workspaceRegistry.get(targetId)
  } catch {
    workspace = undefined
  }
  if (workspace === undefined) {
    return { ok: false, error: `目标工作区不存在: ${targetId}` }
  }
  if (workspace.sessionIds.includes(source.id)) {
    return { ok: true, alreadyThere: true, targetPath: workspace.path, workspaceTitle: workspace.title }
  }
  const boundary = lastCompletedBoundary(source.events)
  if (boundary === undefined) {
    return { ok: false, error: '该会话还没有已完成的回合，无法迁移。' }
  }
  let seed
  try {
    seed = buildSeed(source.events, boundary)
  } catch (error) {
    return { ok: false, error: `构造迁移种子失败: ${String((error && error.message) || error)}` }
  }
  const composition = await compositionFor(ctx, source.preset)
  const plan = {
    ok: true,
    targetPath: workspace.path,
    workspaceTitle: workspace.title,
    boundarySeq: boundary,
    seedEvents: seed.length,
    agentPreset: composition.agentPreset,
  }
  if (dryRun) return { ...plan, dryRun: true }

  const newSessionId = `session-${randomUUID()}`
  try {
    await ctx.agents.create({
      sessionId: newSessionId,
      seed,
      inheritedEventCount: boundary + 1,
      meta: {
        cwd: workspace.path,
        isSeeded: true,
        ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
      },
      agentOptions: defaultAgentOptions(ctx),
      ...(composition.setup === undefined ? {} : { setup: composition.setup }),
    })
  } catch (error) {
    return { ok: false, error: `创建迁移会话失败: ${String((error && error.message) || error)}` }
  }
  try {
    await workspace.attachSession(newSessionId)
  } catch (error) {
    return {
      ok: false,
      newSessionId,
      error: `已创建迁移会话 ${newSessionId}，但加入工作区失败: ${String((error && error.message) || error)}`,
    }
  }
  return { ...plan, newSessionId }
}

/**
 * Register the sidebar command and the agent tool.
 * @param {any} ctx Host context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: 'move-workspace-to',
    description: 'Move this conversation into a directory workspace (safe migration copy).',
    recordInput: false,
    handler: async ({ agent, rawInput }) => {
      const session = agent.session
      const presets = ctx.get('agentPresets')
      const preset = presets === undefined ? undefined : presets.presetForSession(session)
      const result = await migrate(
        ctx,
        { id: session.id, events: session.snapshotEvents(), preset },
        rawInput.trim(),
        false,
      )
      if (!result.ok) return { kind: 'error', text: result.error }
      if (result.alreadyThere) return { kind: 'success', text: `already::${session.id}` }
      return { kind: 'success', text: `moved::${result.newSessionId}` }
    },
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'move_session_to_workspace',
    description: 'Move a conversation into an existing directory workspace by creating a migrated copy (history seeded, original left for the caller to archive). Use dry_run to preview the plan without creating anything.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        session_id: { type: 'string', description: 'Source conversation session id to migrate.' },
        workspace_id: { type: 'string', description: 'Target workspace id (from the sidebar workspaces).' },
        dry_run: { type: 'boolean', description: 'Only compute and return the migration plan; create nothing.' },
      },
      required: ['session_id', 'workspace_id'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          newSessionId: { type: 'string' },
          targetPath: { type: 'string' },
          boundarySeq: { type: 'number' },
          seedEvents: { type: 'number' },
          dryRun: { type: 'boolean' },
          error: { type: 'string' },
        },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      // Explicit disposal instead of `using`, so the file parses on every Node
      // the registry might run it under, not only those with explicit resource
      // management.
      const observation = await ctx.sessionQuery.observeSession(args.session_id)
      try {
        const preset = observation.projections === undefined
          ? undefined
          : observation.projections.values.agentPreset
        const result = await migrate(
          ctx,
          { id: observation.header.id, events: observation.events, preset },
          args.workspace_id,
          args.dry_run === true,
        )
        if (!result.ok) throw new Error(result.error)
        return result
      } finally {
        if (typeof observation[Symbol.dispose] === 'function') observation[Symbol.dispose]()
        else if (typeof observation.dispose === 'function') await observation.dispose()
      }
    },
  }))
}
