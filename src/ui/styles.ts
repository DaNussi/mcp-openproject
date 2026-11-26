/** Panel stylesheet. Colors come from Orca's theme variables; OpenProject colors arrive per element as `--c`. */
export const PANEL_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--orca-background); color: var(--orca-foreground);
  font-family: var(--orca-font-sans); font-size: 12px; line-height: 1.45;
  overflow: hidden;
}
button, input, select, textarea { font: inherit; color: inherit; }
a { color: var(--orca-primary); text-decoration: none; cursor: pointer; }
a:hover { text-decoration: underline; }

#app { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.muted { color: var(--orca-muted-foreground); }
.grow { flex: 1 1 auto; min-width: 0; }
.row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.spacer { flex: 1; }
.row.wrap { flex-wrap: wrap; }
.row.wrap > input[type=search] { flex: 1 1 160px; width: auto; }

/* Header + tab bar */
.header { display: flex; align-items: center; gap: 8px; padding: 8px 10px 4px; }
.title { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.count { background: var(--orca-primary); color: var(--orca-primary-foreground); border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 600; }
.tabbar { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid var(--orca-border); }
.tab { border: 0; background: none; padding: 6px 10px; cursor: pointer; color: var(--orca-muted-foreground); border-bottom: 2px solid transparent; display: inline-flex; align-items: center; gap: 6px; max-width: 220px; }
.tab span.label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab:hover { color: var(--orca-foreground); }
.tab.active { color: var(--orca-foreground); border-bottom-color: var(--orca-primary); font-weight: 600; }
.tab:disabled { opacity: .45; cursor: default; }
.tab .x { border: 0; background: none; padding: 0 2px; cursor: pointer; color: var(--orca-muted-foreground); border-radius: 4px; }
.tab .x:hover { background: var(--orca-accent); color: var(--orca-foreground); }

.content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.scroll { overflow: auto; min-height: 0; }
.pad { padding: 10px; }

/* Controls */
.btn { border: 1px solid var(--orca-border); background: var(--orca-card); color: var(--orca-card-foreground); border-radius: calc(var(--orca-radius) - 2px); padding: 3px 9px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
.btn:hover { background: var(--orca-accent); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.primary { background: var(--orca-primary); color: var(--orca-primary-foreground); border-color: transparent; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.success { background: #1F883D; color: #fff; border-color: transparent; }
.btn.ghost { background: none; border-color: transparent; }
.btn.ghost:hover { background: var(--orca-accent); }
.btn.on { background: var(--orca-accent); border-color: var(--orca-ring); }
.btn.lg { padding: 6px 12px; font-weight: 600; }
.icon-btn { border: 0; background: none; padding: 3px 5px; border-radius: 4px; cursor: pointer; color: var(--orca-muted-foreground); }
.icon-btn:hover { background: var(--orca-accent); color: var(--orca-foreground); }
.seg { display: inline-flex; border: 1px solid var(--orca-border); border-radius: calc(var(--orca-radius) - 2px); overflow: hidden; }
.seg button { border: 0; background: none; padding: 3px 8px; cursor: pointer; color: var(--orca-muted-foreground); }
.seg button.on { background: var(--orca-accent); color: var(--orca-foreground); font-weight: 600; }
input[type=text], input[type=search], input[type=password], select, textarea {
  width: 100%; border: 1px solid var(--orca-input); background: var(--orca-background);
  border-radius: calc(var(--orca-radius) - 2px); padding: 4px 7px; outline: none;
}
input:focus, select:focus, textarea:focus { border-color: var(--orca-ring); box-shadow: 0 0 0 1px var(--orca-ring); }
textarea { resize: vertical; }
label.field { display: flex; flex-direction: column; gap: 3px; }
label.field > span { font-weight: 600; font-size: 11px; color: var(--orca-muted-foreground); }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.stack { display: flex; flex-direction: column; gap: 8px; }

/* Toolbar */
.toolbar { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; }
.filters { border: 1px solid var(--orca-border); background: var(--orca-muted); border-radius: var(--orca-radius); padding: 8px; display: flex; flex-direction: column; gap: 6px; }

/* Work package table */
.table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; border-top: 1px solid var(--orca-border); }
table.wp { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.wp th { position: sticky; top: 0; z-index: 1; background: var(--orca-muted); text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--orca-muted-foreground); padding: 5px 8px; border-bottom: 1px solid var(--orca-border); white-space: nowrap; cursor: pointer; user-select: none; }
table.wp th .arrow { opacity: .7; }
table.wp td { padding: 5px 8px; border-bottom: 1px solid var(--orca-border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
table.wp tr.wp-row { cursor: pointer; }
table.wp tr.wp-row:hover td { background: var(--orca-accent); }
table.wp tr.wp-row.selected td { background: color-mix(in srgb, var(--orca-primary) 16%, transparent); }
table.wp col.c-id { width: 64px; } table.wp col.c-type { width: 96px; } table.wp col.c-status { width: 120px; }
table.wp col.c-assignee { width: 140px; }
@container (max-width: 520px) { .hide-narrow { display: none; } }
.table-wrap { container-type: inline-size; }
.indent { color: var(--orca-muted-foreground); }
.load-more { padding: 8px; text-align: center; }

/* OpenProject colors */
.type { color: var(--c); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; }
html.dark .type { color: color-mix(in srgb, var(--c) 62%, white); }
.pill { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; background: var(--c, var(--orca-muted)); color: var(--fg, var(--orca-foreground)); border: 1px solid color-mix(in srgb, var(--c, var(--orca-border)) 70%, black); }
.pill.plain { background: var(--orca-muted); color: var(--orca-foreground); border-color: var(--orca-border); }
.prio { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.prio::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--c, var(--orca-muted-foreground)); }

/* Stacked split */
.split { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.split-top { display: flex; flex-direction: column; min-height: 80px; }
.split-bottom { flex: 1 1 auto; min-height: 80px; overflow: auto; border-top: 1px solid var(--orca-border); }
.drag-bar { flex: 0 0 7px; cursor: row-resize; background: var(--orca-muted); border-top: 1px solid var(--orca-border); display: flex; align-items: center; justify-content: center; touch-action: none; }
.drag-bar::after { content: ''; width: 36px; height: 3px; border-radius: 3px; background: var(--orca-border); }
.drag-bar:hover, .drag-bar.dragging { background: var(--orca-accent); }
.drag-bar:hover::after, .drag-bar.dragging::after { background: var(--orca-ring); }
body.resizing { cursor: row-resize; user-select: none; }

.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 100%; min-height: 120px; padding: 20px; text-align: center; color: var(--orca-muted-foreground); }
.empty strong { color: var(--orca-foreground); }

/* Ticket view */
.ticket { padding: 10px 12px 24px; display: flex; flex-direction: column; gap: 10px; }
.ticket-head { display: flex; align-items: flex-start; gap: 10px; }
.ticket-head .meta { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.ticket-head .line1 { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ticket-head .subject { font-size: 16px; font-weight: 600; line-height: 1.3; margin: 0; word-break: break-word; }
.ticket-head .actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: 0 0 auto; }
.parent { font-size: 11px; }
.subtabs { display: flex; gap: 2px; border-bottom: 1px solid var(--orca-border); }
.section-title { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--orca-muted-foreground); border-bottom: 1px solid var(--orca-border); padding-bottom: 3px; margin-top: 6px; }
dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 4px 0 0; }
.kv-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; align-items: start; }
.kv-cols > dl.kv { margin: 4px 0 0; }
@media (max-width: 380px) { .kv-cols { grid-template-columns: 1fr; } }
dl.kv dt { color: var(--orca-muted-foreground); }
dl.kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.launch { border: 1px solid var(--orca-ring); border-radius: var(--orca-radius); padding: 10px; background: var(--orca-card); display: flex; flex-direction: column; gap: 8px; }
.progress { display: inline-block; width: 80px; height: 6px; border-radius: 3px; background: var(--orca-muted); vertical-align: middle; overflow: hidden; }
.progress > span { display: block; height: 100%; background: var(--orca-primary); }
.changes { margin: 0 0 4px; padding-left: 16px; color: var(--orca-muted-foreground); }
.activity { border: 1px solid var(--orca-border); border-radius: var(--orca-radius); padding: 8px; }
.activity .who { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 4px; }
.rel-list { display: flex; flex-direction: column; }
.rel-item { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-bottom: 1px solid var(--orca-border); cursor: pointer; }
.rel-item:hover { background: var(--orca-accent); }

/* Markdown */
.md { overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; }
.md h3, .md h4, .md h5, .md h6 { margin: 12px 0 4px; font-size: 13px; }
.md p { margin: 6px 0; }
.md ul, .md ol { margin: 4px 0; padding-left: 20px; }
.md blockquote { margin: 6px 0; padding: 2px 10px; border-left: 3px solid var(--orca-border); color: var(--orca-muted-foreground); }
.md pre { background: var(--orca-muted); padding: 8px; border-radius: 4px; overflow: auto; }
.md code { font-family: var(--orca-font-mono); font-size: 11px; background: var(--orca-muted); padding: 0 3px; border-radius: 3px; }
.md pre code { background: none; padding: 0; }
.md hr { border: 0; border-top: 1px solid var(--orca-border); margin: 10px 0; }
.md-check { display: inline-block; width: 11px; height: 11px; border: 1px solid var(--orca-muted-foreground); border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.md-check.done { background: var(--orca-primary); border-color: var(--orca-primary); }

/* Banners */
.banner { margin: 6px 10px 0; padding: 6px 10px; border-radius: var(--orca-radius); border: 1px solid var(--orca-border); display: flex; gap: 8px; align-items: flex-start; }
.banner.success { border-color: #2DA44E; background: color-mix(in srgb, #2DA44E 12%, transparent); }
.banner.danger { border-color: var(--orca-destructive); background: color-mix(in srgb, var(--orca-destructive) 12%, transparent); }
.banner.warning { border-color: #D4A72C; background: color-mix(in srgb, #D4A72C 14%, transparent); }
.banner.accent { border-color: var(--orca-ring); background: color-mix(in srgb, var(--orca-primary) 10%, transparent); }
.banner .text { flex: 1; overflow-wrap: anywhere; }
pre.snippet { font-family: var(--orca-font-mono); font-size: 11px; background: var(--orca-muted); padding: 8px; border-radius: 4px; overflow: auto; white-space: pre; }
`
