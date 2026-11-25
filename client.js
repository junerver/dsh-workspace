window.__ModuleLoader__.load({
  id: '@junerver/dsh-workspace',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /* ------------------------------------------------------------------ *
     * Shared UI state (module scope): a tiny external store the slot
     * components subscribe to. `bridge` is filled in by apply().
     * ------------------------------------------------------------------ */
    let state = {
      drag: null,        // session id currently being dragged from a sidebar row
      choose: null,      // session id whose workspace chooser is open
      label: '',         // display label of that session
      busy: false,
      error: null,
      notice: null,      // { text, error }
      timeline: false,   // the recent-activity panel is open
      query: '',         // timeline search text
    };
    const listeners = new Set();
    function emit() { for (const l of Array.from(listeners)) { try { l(); } catch (_) { /* ignore */ } } }
    function patch(next) { state = Object.assign({}, state, next); emit(); }
    function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    function useStore() {
      const [, force] = React.useReducer((x) => x + 1, 0);
      React.useEffect(() => subscribe(force), []);
      return state;
    }
    let noticeTimer = null;
    function showNotice(text, error) {
      patch({ notice: { text, error: error === true } });
      if (noticeTimer !== null) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { noticeTimer = null; patch({ notice: null }); }, 4000);
    }

    const bridge = { move: null, close: null, workspaces: null, sessionsList: null, openSession: null, togglePin: null, isPinned: null };

    const CSS = `
.wsm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:2147483000;pointer-events:auto}
.wsm-panel{position:fixed;pointer-events:auto;z-index:2147483001;background:var(--dsw-alias-bg-overlay,#1e1f22);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#3a3b3f);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);padding:14px;box-sizing:border-box;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;gap:10px}
.wsm-panel-choose{left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,90vw);max-height:76vh}
.wsm-title{font-weight:600;font-size:14px}
.wsm-sub{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px;word-break:break-all}
.wsm-list{display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:40px}
.wsm-item{padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#2c2d31);background:var(--dsw-alias-bg-layer-1,#26272b);cursor:pointer}
.wsm-item:hover{border-color:var(--dsw-alias-brand-primary,#4a9eff);background:var(--dsw-alias-bg-layer-2,#2e3036)}
.wsm-item-title{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsm-item-path{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsm-empty{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px;padding:10px}
.wsm-cancel{align-self:flex-end;background:transparent;border:1px solid var(--dsw-alias-border-l1,#2c2d31);color:var(--dsw-alias-label-secondary,#9aa0a6);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit}
.wsm-error{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;word-break:break-all}
.wsm-busy{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px}
/* Toast/hint follow the host convention: top-centred, pointer-transparent,
   host toast tokens, and a short fade-out. */
.wsm-stack{position:fixed;pointer-events:none;top:40px;left:50%;transform:translateX(-50%);z-index:2147483002;display:flex;flex-direction:column;align-items:center;gap:8px;width:max-content;max-width:min(640px,calc(100vw - 48px))}
.wsm-toast{display:flex;align-items:center;gap:10px;box-sizing:border-box;width:max-content;max-width:100%;padding:12px 16px;border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-overlay,#1e1f22));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary,#eee));font:14px/22px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.28));animation:wsm-toast-in 160ms ease,wsm-toast-out 260ms ease 3.6s forwards}
.wsm-toast-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsm-toast-icon{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:18px;height:18px}
.wsm-toast-ok .wsm-toast-icon{color:var(--dsw-alias-state-success-primary,#3fb950)}
.wsm-toast-err .wsm-toast-icon{color:var(--dsw-alias-state-error-primary,#e5484d)}
.wsm-hint{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:max-content;max-width:100%;padding:8px 14px;border-radius:999px;background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-overlay,#1e1f22));color:var(--dsw-alias-label-secondary,#9aa0a6);font:13px/20px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:var(--dsw-shadow-lv3,0 6px 18px rgba(0,0,0,.22));animation:wsm-toast-in 160ms ease}
.wsm-hint-err{color:var(--dsw-alias-state-error-primary,#e5484d)}
@keyframes wsm-toast-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes wsm-toast-out{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){.wsm-toast,.wsm-hint{animation:none}}
.wsm-grip{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9aa0a6);cursor:pointer;padding:0}
.wsm-grip:hover{background:var(--dsw-alias-bg-layer-2,#2e3036);color:var(--dsw-alias-label-primary,#eee)}
.wsm-menu-item{display:flex;width:100%;align-items:center;gap:8px;padding:6px 10px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:6px}
.wsm-menu-item:hover{background:var(--dsw-alias-bg-layer-2,#2e3036)}
.wsm-drop-row{outline:2px solid var(--dsw-alias-brand-primary,#4a9eff) !important;outline-offset:-2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#2e3036) !important}

/* Sidebar-foot trigger for the recent-activity panel, sized like its neighbours. */
.wsm-foot{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;padding:0 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa0a6);cursor:pointer;font:12px/1 system-ui,sans-serif}
.wsm-foot:hover{background:var(--dsw-alias-bg-layer-2,#2e3036);color:var(--dsw-alias-label-primary,#eee)}

/* Recent-activity panel: time-bucketed conversation list. */
.wsm-tl{position:fixed;pointer-events:auto;z-index:2147483001;left:calc(var(--dsh-sidebar-width, 0px) + 8px);top:8px;bottom:8px;width:min(420px,92vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#1e1f22);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#3a3b3f);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.wsm-tl-head{display:flex;align-items:center;gap:8px;padding:12px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,#2c2d31)}
.wsm-tl-title{font-weight:600;font-size:14px;flex:1}
.wsm-tl-close{width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa0a6);cursor:pointer;font-size:15px;line-height:1}
.wsm-tl-close:hover{background:var(--dsw-alias-bg-layer-2,#2e3036);color:var(--dsw-alias-label-primary,#eee)}
.wsm-tl-search{margin:8px 12px;padding:6px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#2c2d31);background:var(--dsw-alias-bg-layer-1,#26272b);color:inherit;font:inherit;outline:none}
.wsm-tl-search:focus{border-color:var(--dsw-alias-brand-primary,#4a9eff)}
.wsm-tl-body{flex:1;overflow:auto;padding:0 8px 12px}
.wsm-tl-group{margin-top:10px}
.wsm-tl-group-title{position:sticky;top:0;padding:6px 4px;background:var(--dsw-alias-bg-overlay,#1e1f22);color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:11px;font-weight:600;letter-spacing:.02em}
.wsm-tl-row{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wsm-tl-row:hover{background:var(--dsw-alias-bg-layer-2,#2e3036)}
.wsm-tl-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#3fb950)}
.wsm-tl-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.wsm-tl-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsm-tl-meta{display:flex;gap:6px;color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:11px;overflow:hidden}
.wsm-tl-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsm-tl-when{flex:0 0 auto;color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:11px}
.wsm-tl-empty{padding:24px 12px;text-align:center;color:var(--dsw-alias-label-secondary,#9aa0a6)}
`;

    function ensureStyle() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('wsm-style') !== null) return;
      const el = document.createElement('style');
      el.id = 'wsm-style';
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    function workspaceSnapshot() {
      try {
        return bridge.workspaces ? bridge.workspaces() : { items: [], archivedSessionIds: [] };
      } catch (_) {
        return { items: [], archivedSessionIds: [] };
      }
    }

    function isArchived(sessionId) {
      const snap = workspaceSnapshot();
      return Array.isArray(snap.archivedSessionIds) && snap.archivedSessionIds.indexOf(sessionId) !== -1;
    }

    function labelFor(sessionId) {
      if (state.label) return state.label;
      try {
        const list = bridge.sessionsList ? bridge.sessionsList() : null;
        const summary = list && list.byId ? list.byId[sessionId] : null;
        if (summary) return summary.displayTitle || summary.title || sessionId;
      } catch (_) { /* ignore */ }
      return sessionId;
    }

    /* ------------------------------ icons ------------------------------ */
    function MoveIcon() {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
        h('path', { d: 'M9 13h6M13 10l3 3-3 3' }),
      );
    }

    function CheckIcon() {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', { d: 'M20 6L9 17l-5-5' }));
    }

    function WarnIcon() {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('path', { d: 'M12 7.5v5M12 16.2v.1' }),
      );
    }

    function ClockIcon() {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('path', { d: 'M12 7.5V12l3 1.8' }),
      );
    }

    function PinIcon(filled) {
      return h('svg', {
        width: 16, height: 16, viewBox: '0 0 24 24',
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', { d: 'M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6zM12 14v7' }));
    }

    /* --------------------- sidebar hover action button ----------------- */
    function RowAction(props) {
      const sessionId = props.sessionId;
      const displayTitle = props.displayTitle;
      if (sessionId === undefined || isArchived(sessionId)) return null;
      return h('button', {
        type: 'button',
        className: 'wsm-grip',
        title: '移动到工作区…',
        'aria-label': '移动到工作区…',
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          patch({ choose: sessionId, label: displayTitle || '', error: null });
        },
      }, h(MoveIcon));
    }

    /* ------------------------ sidebar menu item ------------------------ */
    function MenuItem(props) {
      const sessionId = props.sessionId;
      const displayTitle = props.displayTitle;
      const useMenuOpenState = props.useMenuOpenState;
      // Call the hook unconditionally, before any early return.
      let setOpen = null;
      try { const pair = useMenuOpenState ? useMenuOpenState() : null; setOpen = pair ? pair[1] : null; } catch (_) { /* ignore */ }
      if (sessionId === undefined || isArchived(sessionId)) return null;
      return h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'wsm-menu-item',
        onClick: () => {
          if (setOpen) setOpen(false);
          patch({ choose: sessionId, label: displayTitle || '', error: null });
        },
      }, h(MoveIcon), h('span', null, '移动到工作区…'));
    }

    /* ------------------------ recent activity ------------------------- */
    // A time-bucketed view of the conversations the sidebar already knows
    // about: Today / Yesterday / 2 days ago / Last week. It reads the same
    // session list and workspace snapshot the rows use, so it never fetches.
    function bucketOf(updatedAt, now) {
      const day = 86400000;
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const midnight = startOfToday.getTime();
      if (updatedAt >= midnight) return 'today';
      if (updatedAt >= midnight - day) return 'yesterday';
      if (updatedAt >= midnight - 6 * day) return 'week';
      return 'earlier';
    }

    const BUCKET_LABELS = {
      today: '今天',
      yesterday: '昨天',
      week: '最近 7 天',
      earlier: '更早',
    };
    const BUCKET_ORDER = ['today', 'yesterday', 'week', 'earlier'];

    function relativeLabel(updatedAt, now) {
      const diff = Math.max(0, now - updatedAt);
      const minute = 60000;
      const hour = 3600000;
      const day = 86400000;
      if (diff < minute) return '刚刚';
      if (diff < hour) return Math.floor(diff / minute) + ' 分钟前';
      if (diff < day) return Math.floor(diff / hour) + ' 小时前';
      return Math.floor(diff / day) + ' 天前';
    }

    /** Workspace title lookup, keyed by session id, for the row's secondary line. */
    function workspaceTitles() {
      const bySession = new Map();
      try {
        const snap = workspaceSnapshot();
        for (const workspace of snap.items || []) {
          for (const id of workspace.sessionIds || []) {
            if (!bySession.has(id)) bySession.set(id, workspace.title || workspace.path || '');
          }
        }
      } catch (_) { /* ignore */ }
      return bySession;
    }

    function TimelinePanel(props) {
      const query = (props.query || '').trim().toLowerCase();
      const now = Date.now();
      let list = { ids: [], byId: {} };
      try { list = bridge.sessionsList ? bridge.sessionsList() : list; } catch (_) { /* ignore */ }
      const titles = workspaceTitles();
      const archived = (() => {
        try {
          const snap = workspaceSnapshot();
          return new Set(Array.isArray(snap.archivedSessionIds) ? snap.archivedSessionIds : []);
        } catch (_) { return new Set(); }
      })();

      const rows = [];
      for (const id of list.ids || []) {
        const summary = list.byId ? list.byId[id] : undefined;
        if (!summary) continue;
        if (summary.origin === 'subagent') continue;
        if (summary.blank) continue;
        if (archived.has(id)) continue;
        const title = summary.displayTitle || summary.title || id;
        const place = titles.get(id) || '';
        if (query !== '' && title.toLowerCase().indexOf(query) === -1 && place.toLowerCase().indexOf(query) === -1) continue;
        rows.push({ id: id, title: title, place: place, updatedAt: summary.updatedAt || 0, running: summary.running === true });
      }
      rows.sort((a, b) => b.updatedAt - a.updatedAt);

      const groups = new Map();
      for (const row of rows) {
        const key = bucketOf(row.updatedAt, now);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }

      const body = rows.length === 0
        ? h('div', { className: 'wsm-tl-empty' }, query === '' ? '还没有对话。' : '没有匹配的对话。')
        : h('div', { className: 'wsm-tl-body' }, BUCKET_ORDER.filter((key) => groups.has(key)).map((key) => h('div', {
          className: 'wsm-tl-group', key: key,
        },
          h('div', { className: 'wsm-tl-group-title' }, BUCKET_LABELS[key]),
          groups.get(key).map((row) => h('button', {
            key: row.id,
            type: 'button',
            className: 'wsm-tl-row',
            title: row.place ? row.title + '\n' + row.place : row.title,
            onClick: () => {
              patch({ timeline: false });
              if (bridge.openSession) bridge.openSession(row.id);
            },
          },
            row.running ? h('span', { className: 'wsm-tl-dot' }) : null,
            h('span', { className: 'wsm-tl-main' },
              h('span', { className: 'wsm-tl-name' }, row.title),
              row.place ? h('span', { className: 'wsm-tl-meta' }, h('span', null, row.place)) : null,
            ),
            h('span', { className: 'wsm-tl-when' }, relativeLabel(row.updatedAt, now)),
          )),
        )));

      return h('div', {
        className: 'wsm-tl',
        role: 'dialog',
        'aria-label': '最近活动',
        onClick: (event) => event.stopPropagation(),
      },
        h('div', { className: 'wsm-tl-head' },
          h('span', { className: 'wsm-tl-title' }, '最近活动'),
          h('button', {
            type: 'button', className: 'wsm-tl-close', 'aria-label': '关闭',
            onClick: () => patch({ timeline: false, query: '' }),
          }, '✕'),
        ),
        h('input', {
          className: 'wsm-tl-search',
          type: 'search',
          placeholder: '搜索对话或工作区',
          value: props.query || '',
          onChange: (event) => patch({ query: event.target.value }),
        }),
        body,
      );
    }

    /* --------------------- sidebar foot trigger ----------------------- */
    function TimelineTrigger(props) {
      const wide = props.wide === true;
      return h('button', {
        type: 'button',
        className: 'wsm-foot',
        title: '最近活动',
        'aria-label': '最近活动',
        onClick: () => patch({ timeline: !state.timeline, query: '' }),
      }, h(ClockIcon), wide ? h('span', null, '最近活动') : null);
    }

    /* ---------------------- workspace pinning ------------------------- */
    // Pinned workspaces are reordered to the front through the existing
    // durable workspace order; the pin set itself is plugin-local, so no
    // Host state is invented.
    const PIN_STORAGE_KEY = 'dsh.workspaceMove.pinnedWorkspaces';

    function readPins() {
      try {
        const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
        const parsed = raw === null ? [] : JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
      } catch (_) {
        return new Set();
      }
    }

    function writePins(set) {
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(Array.from(set)));
      } catch (_) { /* ignore */ }
    }

    /* ----------------------------- overlay ---------------------------- */
    // The drag experience targets the real sidebar workspace groups directly;
    // the overlay only renders a non-blocking hint (and the click chooser).
    function Overlay() {
      const s = useStore();

      React.useEffect(() => {
        if (s.choose === null) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') bridge.close(); };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [s.choose]);

      const stack = [];
      if (s.notice) {
        stack.push(h('div', {
          key: 'notice',
          className: 'wsm-toast ' + (s.notice.error ? 'wsm-toast-err' : 'wsm-toast-ok'),
          role: 'status',
          'aria-live': 'polite',
        },
          h('span', { className: 'wsm-toast-icon' }, s.notice.error ? h(WarnIcon) : h(CheckIcon)),
          h('span', { className: 'wsm-toast-text' }, s.notice.text),
        ));
      }
      if (s.choose === null && s.drag !== null) {
        const hint = s.busy
          ? '正在迁移…'
          : (s.error ? s.error : '松开鼠标，把会话放到高亮的工作区');
        stack.push(h('div', {
          key: 'hint',
          className: 'wsm-hint' + (s.error ? ' wsm-hint-err' : ''),
        }, s.error ? h(WarnIcon) : h(MoveIcon), h('span', null, hint)));
      }
      const overlay = stack.length === 0
        ? null
        : h('div', { className: 'wsm-stack' }, stack);
      const timeline = s.timeline ? h(TimelinePanel, { query: s.query }) : null;

      if (s.choose === null) return h(React.Fragment, null, timeline, overlay);

      const sessionId = s.choose;
      const snap = workspaceSnapshot();
      const items = Array.isArray(snap.items) ? snap.items : [];
      const current = items.find((w) => Array.isArray(w.sessionIds) && w.sessionIds.indexOf(sessionId) !== -1);
      const currentId = current ? String(current.workspaceId) : null;
      const targets = items.filter((w) => String(w.workspaceId) !== currentId);

      const list = targets.length === 0
        ? h('div', { className: 'wsm-empty', key: 'empty' }, '没有其他工作区可移动。')
        : h('div', { className: 'wsm-list', key: 'list' }, targets.map((w) => {
          const id = String(w.workspaceId);
          return h('div', {
            key: id,
            className: 'wsm-item',
            onClick: () => bridge.move(sessionId, id),
          },
            h('div', { className: 'wsm-item-title' }, w.title || w.displayTitle || w.path || id),
            h('div', { className: 'wsm-item-path' }, w.path || ''),
          );
        }));

      return h(React.Fragment, null,
        h('div', { className: 'wsm-backdrop', key: 'bd', onClick: () => bridge.close() }),
        h('div', {
          key: 'panel',
          className: 'wsm-panel wsm-panel-choose',
          onClick: (event) => event.stopPropagation(),
        },
          h('div', { className: 'wsm-title' }, '移动到工作区'),
          h('div', { className: 'wsm-sub' }, labelFor(sessionId)),
          list,
          s.busy ? h('div', { className: 'wsm-busy' }, '正在迁移…') : null,
          s.error ? h('div', { className: 'wsm-error' }, s.error) : null,
          h('button', { type: 'button', className: 'wsm-cancel', onClick: () => bridge.close() }, '取消'),
        ),
        overlay,
      );
    }

    return {
      inject: ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'remote', 'remote.commands', 'contextMenus'],
      apply(ctx) {
        ensureStyle();
        const sessions = ctx.sessions;
        const workspaces = ctx.workspaces;
        const uiWorkspace = ctx.uiWorkspace;

        bridge.workspaces = () => workspaces.list.getSnapshot();
        bridge.sessionsList = () => sessions.list.getSnapshot();
        bridge.openSession = (sessionId) => { uiWorkspace.openSession(sessionId); };
        bridge.close = () => patch({ choose: null, drag: null, error: null, busy: false });

        const currentWorkspaceOf = (sessionId) => {
          try {
            const snap = workspaces.list.getSnapshot();
            const items = Array.isArray(snap.items) ? snap.items : [];
            const w = items.find((item) => Array.isArray(item.sessionIds) && item.sessionIds.indexOf(sessionId) !== -1);
            return w ? String(w.workspaceId) : null;
          } catch (_) {
            return null;
          }
        };

        bridge.move = async (sessionId, workspaceId) => {
          if (state.busy) return;
          patch({ busy: true, error: null });
          try {
            const newSessionId = await sessions.using(sessionId, { source: 'workspaceMove' }, async () => {
              const result = await ctx.remote.commands.execute(sessionId, '/move-workspace-to ' + workspaceId, []);
              if (!result.ok) throw new Error((result.error && result.error.message) || '命令调用失败');
              const execution = result.value;
              if (!execution) throw new Error('未找到迁移命令');
              if (execution.result.kind === 'error') throw new Error(execution.result.text || '迁移失败');
              const text = execution.result.text || '';
              if (text.indexOf('already::') === 0) return text.slice('already::'.length).trim();
              const idx = text.lastIndexOf('::');
              return idx >= 0 ? text.slice(idx + 2).trim() : undefined;
            });
            if (!newSessionId) throw new Error('迁移命令未返回新会话 ID');
            try {
              await uiWorkspace.archiveSession(sessionId);
            } catch (error) {
              console.warn('[workspace-move] source archive failed', error);
            }
            patch({ busy: false, choose: null, drag: null, error: null });
            let targetName = '';
            try {
              const snap = workspaces.list.getSnapshot();
              const hit = (snap.items || []).find((w) => String(w.workspaceId) === String(workspaceId));
              if (hit) targetName = hit.title || hit.displayTitle || hit.path || '';
            } catch (_) { /* ignore */ }
            showNotice(targetName ? '已将会话迁移到「' + targetName + '」' : '已将会话迁移到目标工作区', false);
            try { uiWorkspace.openSession(newSessionId); } catch (error) { console.warn('[workspace-move] open new session failed', error); }
          } catch (error) {
            patch({ busy: false, error: (error && error.message) ? error.message : String(error) });
          }
        };

        /* --- Drag: hit-test the real sidebar rows via structural keys --- *
         * Session rows carry data-row-key="session:<id>"; workspace group
         * headers carry data-row-key="workspace:<id>". This lets a drag
         * resolve its target directly on the sidebar (no floating panel that
         * would cover the list on narrow windows).                            */
        let highlightedEl = null;
        function setHighlight(el) {
          if (highlightedEl === el) return;
          if (highlightedEl && highlightedEl.classList) highlightedEl.classList.remove('wsm-drop-row');
          highlightedEl = el;
          if (el && el.classList) el.classList.add('wsm-drop-row');
        }
        function closestKey(event, prefix) {
          const target = event.target;
          if (!target || typeof target.closest !== 'function') return null;
          const el = target.closest('[data-row-key^="' + prefix + '"]');
          if (!el) return null;
          const raw = el.getAttribute('data-row-key') || '';
          return { el: el, key: raw.slice(prefix.length) };
        }
        // Resolve the target workspace from whatever sidebar row is under the pointer.
        function targetWorkspace(event) {
          const target = event.target;
          if (!target || typeof target.closest !== 'function') return null;
          if (target.closest('.wsm-panel')) return null; // chooser panel handles itself
          const header = closestKey(event, 'workspace:');
          if (header) {
            if (!header.key) return null; // Ungrouped header cannot receive sessions
            return { key: header.key, el: header.el };
          }
          const sessionRow = closestKey(event, 'session:');
          if (sessionRow && sessionRow.key) {
            const key = currentWorkspaceOf(sessionRow.key);
            if (!key) return null;
            const el = document.querySelector('[data-row-key="workspace:' + key + '"]');
            return { key: key, el: el };
          }
          return null;
        }

        const onDragStart = (event) => {
          const row = closestKey(event, 'session:');
          let id = row && row.key ? row.key : '';
          const valid = /^session-[0-9a-zA-Z-]+$/;
          if (!valid.test(id)) {
            try {
              const dt = event.dataTransfer;
              const data = dt ? (dt.getData('text/plain') || dt.getData('text')) : '';
              if (valid.test(data)) id = data;
            } catch (_) { /* ignore */ }
          }
          if (!valid.test(id) || isArchived(id)) return;
          let label = '';
          try {
            const summary = sessions.list.getSnapshot().byId[id];
            if (summary) label = summary.displayTitle || summary.title || '';
          } catch (_) { /* ignore */ }
          patch({ drag: id, label: label, error: null });
        };

        const onDragOver = (event) => {
          if (state.drag === null) return;
          const t = targetWorkspace(event);
          if (t === null) {
            setHighlight(null);
            return;
          }
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          if (t.key === currentWorkspaceOf(state.drag)) {
            setHighlight(null); // already in this workspace: no-op target
          } else {
            setHighlight(t.el || null);
          }
        };

        const onDrop = (event) => {
          if (state.drag === null) return;
          const t = targetWorkspace(event);
          if (t === null) {
            setHighlight(null);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const sessionId = state.drag;
          setHighlight(null);
          if (t.key === currentWorkspaceOf(sessionId)) {
            patch({ drag: null, error: null });
            return;
          }
          bridge.move(sessionId, t.key);
        };

        const onDragEnd = () => {
          setHighlight(null);
          if (state.drag !== null) patch({ drag: null });
        };

        document.addEventListener('dragstart', onDragStart, false);
        document.addEventListener('dragover', onDragOver, false);
        document.addEventListener('drop', onDrop, false);
        document.addEventListener('dragend', onDragEnd, false);
        ctx.effect(() => () => {
          setHighlight(null);
          document.removeEventListener('dragstart', onDragStart, false);
          document.removeEventListener('dragover', onDragOver, false);
          document.removeEventListener('drop', onDrop, false);
          document.removeEventListener('dragend', onDragEnd, false);
        });

        ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.row.action', id: 'workspace-move', order: 150,
        }, RowAction));

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item', id: 'workspace-move', order: 520,
        }, MenuItem));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'workspace-move-overlay', order: 900,
        }, Overlay));

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: 'workspace-move-recent', order: 40,
        }, TimelineTrigger));

        /* --- Workspace pinning ---------------------------------------- *
         * `insertBefore(id)` appends, so pinning to the FRONT means placing
         * each pinned workspace before the element that currently occupies
         * its target slot. The desired order is the pin order followed by
         * everything else in its existing relative order.                  */
        let applying = false;

        const applyPinOrder = async () => {
          if (applying) return;
          const pins = readPins();
          if (pins.size === 0) return;
          let current = [];
          try { current = (workspaces.list.getSnapshot().items || []).map((w) => String(w.workspaceId)); } catch (_) { return; }
          const pinned = current.filter((id) => pins.has(id));
          if (pinned.length === 0) return;
          const desired = [...Array.from(pins).filter((id) => current.includes(id)),
            ...current.filter((id) => !pins.has(id))];
          if (desired.every((id, index) => id === current[index])) return;

          applying = true;
          try {
            const order = [...current];
            for (let i = 0; i < desired.length; i += 1) {
              if (order[i] === desired[i]) continue;
              const moved = order.filter((id) => id !== desired[i]);
              moved.splice(i, 0, desired[i]);
              const anchor = moved[i + 1];
              try {
                await workspaces.insertBefore(desired[i], anchor);
              } catch (error) {
                console.warn('[workspace-move] pin reorder failed', error);
                return;
              }
              order.splice(0, order.length, ...moved);
            }
          } finally {
            applying = false;
          }
        };

        bridge.isPinned = (workspaceId) => readPins().has(String(workspaceId));
        bridge.togglePin = async (workspaceId) => {
          const id = String(workspaceId);
          const pins = readPins();
          if (pins.has(id)) {
            pins.delete(id);
            writePins(pins);
            showNotice('已取消置顶', false);
            return;
          }
          pins.add(id);
          writePins(pins);
          await applyPinOrder();
          showNotice('已置顶工作区', false);
        };

        ctx.effect(() => ctx.contextMenus.register({
          id: 'workspaceMove.pin',
          target: 'workspace',
          order: 150,
          observe: () => [workspaces.list],
          resolve: (target) => {
            const workspaceId = String(target.workspaceId);
            const pinned = readPins().has(workspaceId);
            return [{
              id: 'pin',
              label: pinned ? '取消置顶' : '置顶工作区',
              run: () => bridge.togglePin(workspaceId),
            }];
          },
        }));

        // Re-apply the saved pin order whenever the workspace list changes, so
        // a reload (or a reorder by drag) restores the pinned block. The guard
        // inside applyPinOrder keeps this from looping on its own writes.
        let pinTimer = null;
        const unsubscribePins = workspaces.list.subscribe(() => {
          if (pinTimer !== null) return;
          pinTimer = setTimeout(() => {
            pinTimer = null;
            void applyPinOrder();
          }, 120);
        });
        ctx.effect(() => () => {
          unsubscribePins();
          if (pinTimer !== null) { clearTimeout(pinTimer); pinTimer = null; }
        });
        void applyPinOrder();
      },
    };
  },
});
