import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ==================================================================
   Mealboard

   Three layers, in this order:
     1. React state  — the live in-memory copy. Every read and render
                       comes from here. Never blocks on I/O.
     2. Cache        — localStorage (memory fallback when unavailable).
                       Written on every mutation. Survives reload and
                       carries the offline backlog.
     3. Remote       — none | Google Drive CSV | any HTTP/WebDAV store.
                       Only ever written through a reconcile.

   Nothing is committed to a remote without a three-way reconcile
   against the baseline snapshot taken at the last successful sync.
   ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Narrow:wght@600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

.mb-root {
  --ground:#F2F5EC; --paper:#FFFFFF; --ink:#182A20; --soft:#63756A;
  --rail:#0F5C4E; --rail2:#1C8468; --fire:#FF6B3D; --fire-tint:#FFE7DA;
  --ready:#2FAE6B; --ready-tint:#E1F5E7; --line:#E1E6DA; --line-soft:#EEF1E8;
  --shadow:0 1px 2px rgba(24,42,32,.05), 0 10px 24px rgba(24,42,32,.08);
  font-family:'Archivo',ui-sans-serif,system-ui,sans-serif;
  color:var(--ink); background:var(--ground); min-height:100vh; -webkit-font-smoothing:antialiased;
}
.mb-root *,.mb-root *::before,.mb-root *::after{box-sizing:border-box;}
.mb-root button{font:inherit;color:inherit;cursor:pointer;border:none;background:none;}
.mb-root input,.mb-root select{font:inherit;color:inherit;}
.mb-root :focus-visible{outline:2px solid var(--rail);outline-offset:2px;border-radius:4px;}
.mb-shell{max-width:760px;margin:0 auto;padding:0 0 104px;}

.mb-rail{position:sticky;top:0;z-index:30;background:linear-gradient(135deg,var(--rail),var(--rail2));color:#F2F0E6;padding:14px 18px 12px;border-radius:0 0 20px 20px;box-shadow:0 8px 20px rgba(10,40,32,.18);}
.mb-rail-top{display:flex;align-items:baseline;gap:10px;}
.mb-wordmark{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:19px;letter-spacing:.1em;text-transform:uppercase;display:flex;align-items:center;gap:7px;}
.mb-rail-note{font-size:11px;color:#B9E0D2;margin-left:auto;font-family:'IBM Plex Mono',monospace;display:flex;align-items:center;gap:6px;}
.mb-led{width:7px;height:7px;border-radius:50%;background:#5E7C78;flex:none;}
.mb-led.ok{background:#5FE0A0;} .mb-led.busy{background:#FFC15E;} .mb-led.bad{background:#FF7A63;} .mb-led.pending{background:#D8E56E;}
.mb-scope{display:flex;gap:6px;margin-top:11px;}
.mb-scope button{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;border-radius:999px;color:#BEE3D6;border:1px solid rgba(255,255,255,.22);transition:background .15s ease,color .15s ease;}
.mb-scope button.on{background:#F2F0E6;color:var(--rail);border-color:#F2F0E6;font-weight:600;}

.mb-view{padding:16px 14px 0;}
.mb-h{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);}
.mb-card{background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);}
.mb-empty{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:28px 20px;text-align:center;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;}
.mb-empty-ic{font-size:36px;line-height:1;margin-bottom:10px;}
.mb-empty p{margin:0 0 16px;color:var(--soft);font-size:14px;line-height:1.55;max-width:38ch;}
.mb-btn{background:var(--rail);color:#F2F0E6;border-radius:12px;padding:10px 16px;font-weight:600;font-size:14px;text-align:center;box-shadow:0 4px 12px rgba(15,92,78,.25);transition:transform .12s ease;}
.mb-btn:active{transform:translateY(1px);}
.mb-btn.ghost{background:transparent;color:var(--rail);border:1px solid var(--line);box-shadow:none;}
.mb-btn.danger{background:transparent;color:#B03A1E;border:1px solid #F0C6B8;box-shadow:none;}
.mb-btn:disabled{opacity:.45;cursor:default;box-shadow:none;}

.mb-weekbar{display:flex;align-items:center;gap:8px;margin-bottom:14px;}
.mb-weekbar .lbl{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:17px;flex:1;}
.mb-step{width:36px;height:36px;border-radius:11px;border:1px solid var(--line);background:var(--paper);font-size:15px;line-height:1;box-shadow:var(--shadow);}
.mb-today{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;border:1px solid var(--line);background:var(--paper);padding:9px 12px;border-radius:11px;box-shadow:var(--shadow);}

.mb-day{margin-bottom:18px;}
.mb-day-head{display:flex;align-items:center;gap:9px;padding:0 2px 8px;}
.mb-day-date{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);}
.mb-day-name{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:15px;letter-spacing:.05em;text-transform:uppercase;}
.mb-day.is-today .mb-day-name{color:var(--fire);}
.mb-day-rule{flex:1;height:1px;background:var(--line);}
.mb-add{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);border:1px solid var(--line);border-radius:999px;padding:4px 11px;background:var(--paper);}
.mb-add:hover{color:var(--rail);border-color:var(--rail);}
.mb-day-none{font-size:13px;color:var(--soft);padding:2px 4px 4px;font-style:italic;}

.mb-ticket{display:flex;background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:9px;box-shadow:var(--shadow);}
.mb-stub{width:44px;flex:none;display:flex;align-items:center;justify-content:center;border-right:1px dashed var(--line);}
.mb-stub-ic{font-size:20px;line-height:1;}
.mb-ticket.pending .mb-stub{background:var(--fire-tint);}
.mb-ticket.ready .mb-stub{background:var(--ready-tint);}
.mb-ticket.empty .mb-stub{background:var(--line-soft);}
.mb-ticket-body{flex:1;min-width:0;padding:11px 13px;}
.mb-ticket-row{display:flex;align-items:flex-start;gap:10px;}
.mb-ticket-name{font-weight:600;font-size:15px;line-height:1.3;flex:1;min-width:0;text-align:left;word-break:break-word;}
.mb-stamp{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:4px 8px;border-radius:999px;flex:none;margin-top:1px;}
.mb-stamp.pending{background:var(--fire);color:#FFF6F0;}
.mb-stamp.ready{background:var(--ready);color:#F1FAF4;}
.mb-stamp.empty{background:var(--line-soft);color:var(--soft);}
.mb-ticket-meta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--soft);margin-top:6px;}

.mb-gauge{width:32px;height:32px;flex:none;border-radius:9px;border:1.5px solid var(--line);background:#fff;position:relative;overflow:hidden;}
.mb-gauge i{position:absolute;left:0;right:0;bottom:0;background:var(--fire);transition:height .18s ease;}
.mb-gauge.done{border-color:var(--ready);} .mb-gauge.done i{background:var(--ready);}
.mb-gauge b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:700;}
.mb-gauge.todo{border-color:var(--fire);}

.mb-chip{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex:none;}

.mb-group{margin-bottom:16px;}
.mb-group-head{display:flex;align-items:center;gap:9px;padding:0 2px 7px;}
.mb-row{background:var(--paper);border:1px solid var(--line);border-radius:13px;margin-bottom:8px;box-shadow:var(--shadow);}
.mb-row-main{display:flex;align-items:center;gap:11px;padding:10px 12px;}
.mb-row-text{flex:1;min-width:0;text-align:left;}
.mb-row-name{font-weight:600;font-size:14.5px;line-height:1.25;word-break:break-word;}
.mb-row-name.struck{color:var(--soft);text-decoration:line-through;text-decoration-color:var(--ready);}
.mb-row-sub{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--soft);margin-top:3px;}
.mb-stepper{display:flex;align-items:center;gap:1px;flex:none;}
.mb-stepper button{width:32px;height:32px;border:1px solid var(--line);background:#fff;font-size:16px;line-height:1;color:var(--soft);}
.mb-stepper button:first-child{border-radius:9px 0 0 9px;}
.mb-stepper button:last-child{border-radius:0 9px 9px 0;}
.mb-stepper button:disabled{opacity:.35;cursor:default;}

.mb-disc{border-top:1px dashed var(--line);}
.mb-disc-btn{width:100%;display:flex;align-items:center;gap:6px;padding:8px 12px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);}
.mb-disc-btn:hover{color:var(--rail);}
.mb-caret{transition:transform .15s ease;font-size:9px;}
.mb-caret.open{transform:rotate(90deg);}
.mb-disc-body{padding:2px 12px 12px;}
.mb-link-h{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin:8px 0 5px;}
.mb-link{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 9px;border-radius:9px;background:#F6F8F2;border:1px solid var(--line-soft);margin-bottom:4px;font-size:13px;}
.mb-link:hover{border-color:var(--rail);}
.mb-link .grow{flex:1;min-width:0;}
.mb-dot{width:8px;height:8px;border-radius:50%;flex:none;}
.mb-dot.pending{background:var(--fire);} .mb-dot.ready{background:var(--ready);} .mb-dot.empty{background:var(--line);}
.mb-link .qty{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--soft);flex:none;}
.mb-arrow{font-size:11px;color:var(--soft);flex:none;}
.mb-none{font-size:12.5px;color:var(--soft);font-style:italic;padding:2px 0 4px;}

.mb-flash{animation:mbflash 1.6s ease;}
@keyframes mbflash{0%,55%{box-shadow:0 0 0 3px rgba(255,107,61,.35);}100%{box-shadow:0 0 0 0 rgba(255,107,61,0);}}

.mb-scrim{position:fixed;inset:0;background:rgba(15,30,24,.5);z-index:60;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);}
.mb-sheet{background:var(--ground);width:100%;max-width:760px;max-height:92vh;overflow-y:auto;border-radius:22px 22px 0 0;padding:18px 16px 28px;box-shadow:0 -12px 40px rgba(10,30,24,.25);}
.mb-sheet-head{display:flex;align-items:center;gap:10px;margin-bottom:16px;}
.mb-sheet-title{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:18px;letter-spacing:.06em;text-transform:uppercase;flex:1;}
.mb-field{margin-bottom:13px;}
.mb-label{display:block;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin-bottom:6px;}
.mb-input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:var(--paper);font-size:15px;}
.mb-input:focus{border-color:var(--rail);}
.mb-seg{display:flex;gap:6px;}
.mb-seg button{flex:1;padding:10px 4px;border:1px solid var(--line);border-radius:11px;background:var(--paper);font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);}
.mb-seg button.on{background:var(--rail);color:#F2F0E6;border-color:var(--rail);font-weight:600;}
.mb-ac{position:relative;}
.mb-ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--paper);border:1px solid var(--line);border-radius:11px;z-index:5;max-height:190px;overflow-y:auto;box-shadow:0 12px 28px rgba(18,32,29,.16);}
.mb-ac-list button{display:block;width:100%;text-align:left;padding:10px 12px;font-size:14px;border-bottom:1px solid var(--line-soft);}
.mb-ac-list button:last-child{border-bottom:none;}
.mb-ac-list button:hover{background:#F1F4EC;}
.mb-ac-list .new{color:var(--fire);font-weight:600;}
.mb-ing-row{display:flex;align-items:center;gap:8px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:9px 11px;margin-bottom:7px;}
.mb-ing-row .nm{flex:1;min-width:0;font-size:14px;}
.mb-qty{width:74px;padding:7px 8px;border:1px solid var(--line);border-radius:8px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:14px;background:#fff;}
.mb-unit{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--soft);width:34px;}
.mb-x{width:28px;height:28px;border-radius:8px;color:var(--soft);font-size:16px;line-height:1;}
.mb-sheet-actions{display:flex;gap:8px;margin-top:20px;}
.mb-sheet-actions .mb-btn{flex:1;}
.mb-two{display:flex;gap:8px;} .mb-two > *{flex:1;}

.mb-nav{position:fixed;left:0;right:0;bottom:calc(10px + env(safe-area-inset-bottom));z-index:40;display:flex;justify-content:center;padding:0 12px;pointer-events:none;}
.mb-nav-in{pointer-events:auto;display:flex;width:100%;max-width:620px;background:linear-gradient(135deg,var(--rail),var(--rail2));border-radius:20px;padding:6px;box-shadow:0 14px 34px rgba(10,35,28,.32);}
.mb-nav button{flex:1;padding:9px 2px 8px;border-radius:14px;color:#9FC9BA;display:flex;flex-direction:column;align-items:center;gap:3px;transition:background .15s ease,color .15s ease;}
.mb-nav button.on{color:#FFFDF8;background:rgba(255,255,255,.14);}
.mb-nav .ic{font-size:17px;line-height:1;}
.mb-nav .tx{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;}
.mb-badge{position:absolute;transform:translate(14px,-4px);background:var(--fire);color:#fff;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;border-radius:999px;padding:1px 5px;}
.mb-navwrap{position:relative;display:flex;flex-direction:column;align-items:center;}

.mb-sum{display:flex;gap:8px;margin-bottom:14px;}
.mb-sum div{flex:1;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:9px 11px;box-shadow:var(--shadow);}
.mb-sum .n{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:20px;line-height:1.1;}
.mb-sum .l{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);margin-top:2px;}
.mb-sum .fire .n{color:var(--fire);} .mb-sum .ready .n{color:var(--ready);}

.mb-toggle{display:flex;align-items:center;gap:7px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);margin-left:auto;}
.mb-search{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:var(--paper);font-size:14px;margin-bottom:13px;}

.mb-panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:13px;box-shadow:var(--shadow);}
.mb-panel p{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--soft);}
.mb-panel p:last-child{margin-bottom:0;}
.mb-panel p strong{color:var(--ink);font-weight:600;}
.mb-steps{margin:0 0 10px;padding-left:17px;font-size:13px;line-height:1.65;color:var(--soft);}
.mb-steps code,.mb-panel code{font-family:'IBM Plex Mono',monospace;font-size:11.5px;background:#F1F4EC;padding:1px 5px;border-radius:5px;color:var(--ink);word-break:break-all;}
.mb-kv{display:flex;justify-content:space-between;gap:12px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;padding:5px 0;border-bottom:1px dashed var(--line-soft);}
.mb-kv:last-child{border-bottom:none;}
.mb-kv span:first-child{color:var(--soft);letter-spacing:.06em;text-transform:uppercase;font-size:10px;}
.mb-kv span:last-child{text-align:right;word-break:break-all;}
.mb-note{font-size:12.5px;line-height:1.55;padding:10px 12px;border-radius:11px;background:var(--fire-tint);color:#93400E;border:1px solid #F3D1BA;margin-bottom:12px;}
.mb-note.good{background:var(--ready-tint);color:#1F5C3C;border-color:#BFE4CE;}
.mb-files{display:flex;flex-wrap:wrap;gap:6px;}
.mb-files button{font-family:'IBM Plex Mono',monospace;font-size:11px;border:1px solid var(--line);border-radius:9px;padding:7px 10px;background:#F6F8F2;}

/* storage target picker */
.mb-target{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;padding:13px;border:1px solid var(--line);border-radius:13px;background:var(--paper);margin-bottom:9px;box-shadow:var(--shadow);}
.mb-target.on{border-color:var(--rail);box-shadow:inset 0 0 0 1.5px var(--rail);}
.mb-target .pip{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--line);flex:none;margin-top:2px;position:relative;}
.mb-target.on .pip{border-color:var(--rail);}
.mb-target.on .pip::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--rail);}
.mb-target h4{margin:0 0 3px;font-size:14.5px;font-weight:600;}
.mb-target span{font-size:12.5px;line-height:1.5;color:var(--soft);display:block;}

/* reconcile */
.mb-conflict{border:1px solid #F3D1BA;background:#FDF6EE;border-radius:12px;padding:11px 12px;margin-bottom:8px;}
.mb-conflict .ttl{font-size:13.5px;font-weight:600;margin-bottom:6px;}
.mb-conflict .side{display:flex;gap:8px;align-items:center;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--soft);padding:2px 0;}
.mb-conflict .side b{color:var(--ink);font-weight:600;min-width:52px;}
.mb-pill{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:var(--line-soft);color:var(--soft);}

@media (prefers-reduced-motion: reduce){ .mb-root *{animation-duration:.001ms !important;transition-duration:.001ms !important;} }
`;

/* ================================================================== */
/* Constants + schema                                                 */
/* ================================================================== */

const CATEGORIES = ["Produce", "Meat & fish", "Dairy & eggs", "Bakery", "Pantry", "Frozen", "Drinks", "Household", "Other"];
const UNITS = ["g", "kg", "ml", "L", "pcs", "tbsp", "tsp", "bunch", "pack", "can"];
const KINDS = [{ id: "meal", label: "Meal" }, { id: "drink", label: "Drink" }, { id: "snack", label: "Snack" }];
const KIND_ICONS = { meal: "🍲", drink: "🥤", snack: "🍿" };
const CATEGORY_ICONS = {
  "Produce": "🥬", "Meat & fish": "🐟", "Dairy & eggs": "🥚", "Bakery": "🍞",
  "Pantry": "🥫", "Frozen": "🧊", "Drinks": "🥤", "Household": "🧴", "Other": "🍽️",
};
const CATEGORY_TINT = {
  "Produce": "#E3F3D9", "Meat & fish": "#FBE1DD", "Dairy & eggs": "#FFF3CE", "Bakery": "#F7E6CF",
  "Pantry": "#EDE3F5", "Frozen": "#DBF0F6", "Drinks": "#D8EEFB", "Household": "#E6E8F5", "Other": "#EAEAE0",
};
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SCHEMA_VERSION = "1";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const CACHE_KEY = "mealboard.cache";
const BASE_KEY = "mealboard.baseline";
const CONF_KEY = "mealboard.config";

const TABLES = {
  ingredients: { file: "ingredients.csv", cols: ["id", "name", "category", "unit", "updated_at", "deleted"] },
  entries: { file: "entries.csv", cols: ["id", "date", "kind", "name", "created_at", "updated_at", "deleted"] },
  entry_items: { file: "entry_items.csv", cols: ["id", "entry_id", "ingredient_id", "qty", "updated_at", "deleted"] },
  stock: { file: "stock.csv", cols: ["ingredient_id", "fridge_qty", "bought_qty", "updated_at"] },
  meta: { file: "meta.csv", cols: ["key", "value", "updated_at"] },
};
const TABLE_NAMES = Object.keys(TABLES);
const COLLECTIONS = ["ingredients", "entries", "items", "stock"];

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const norm = (s) => (s || "").trim().toLowerCase();
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const fmt = (n) => (n == null || isNaN(n) ? "0" : String(Math.round(n * 100) / 100));
const stepFor = (u) => (u === "g" || u === "ml" ? 50 : u === "kg" || u === "L" ? 0.5 : 1);
const now = () => Date.now();
const iso = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const parseISO = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const mondayOf = (d) => { const c = new Date(d.getFullYear(), d.getMonth(), d.getDate()); c.setDate(c.getDate() - ((c.getDay() + 6) % 7)); return c; };
const addDays = (d, n) => { const c = new Date(d.getTime()); c.setDate(c.getDate() + n); return c; };
const shortDate = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
const clock = (t) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "never");

/* ---- CSV (RFC 4180) ---- */
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCSV = (cols, rows) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";

function parseCSV(text) {
  if (!text) return [];
  const rows = []; let row = [], field = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((c) => c !== "")).map((r) => {
    const o = {}; head.forEach((h, k) => (o[h] = r[k] ?? "")); return o;
  });
}

/* ---- state <-> tables ---- */
const emptyState = () => ({ ingredients: {}, entries: {}, items: {}, stock: {}, meta: {} });

function stateToTables(s) {
  return {
    ingredients: Object.values(s.ingredients).map((r) => ({ id: r.id, name: r.name, category: r.category, unit: r.unit, updated_at: r.updatedAt, deleted: r.deleted ? "1" : "0" })),
    entries: Object.values(s.entries).map((r) => ({ id: r.id, date: r.date, kind: r.kind, name: r.name, created_at: r.createdAt, updated_at: r.updatedAt, deleted: r.deleted ? "1" : "0" })),
    entry_items: Object.values(s.items).map((r) => ({ id: r.id, entry_id: r.entryId, ingredient_id: r.ingId, qty: r.qty, updated_at: r.updatedAt, deleted: r.deleted ? "1" : "0" })),
    stock: Object.values(s.stock).map((r) => ({ ingredient_id: r.ingId, fridge_qty: r.fridge, bought_qty: r.bought, updated_at: r.updatedAt })),
    meta: [{ key: "schema_version", value: SCHEMA_VERSION, updated_at: now() }],
  };
}

function tablesToState(t) {
  const s = emptyState();
  (t.ingredients || []).forEach((r) => { if (r.id) s.ingredients[r.id] = { id: r.id, name: r.name, category: r.category || "Other", unit: r.unit || "g", updatedAt: num(r.updated_at), deleted: r.deleted === "1" }; });
  (t.entries || []).forEach((r) => { if (r.id) s.entries[r.id] = { id: r.id, date: r.date, kind: r.kind || "meal", name: r.name, createdAt: num(r.created_at), updatedAt: num(r.updated_at), deleted: r.deleted === "1" }; });
  (t.entry_items || []).forEach((r) => { if (r.id) s.items[r.id] = { id: r.id, entryId: r.entry_id, ingId: r.ingredient_id, qty: num(r.qty), updatedAt: num(r.updated_at), deleted: r.deleted === "1" }; });
  (t.stock || []).forEach((r) => { if (r.ingredient_id) s.stock[r.ingredient_id] = { ingId: r.ingredient_id, fridge: num(r.fridge_qty), bought: num(r.bought_qty), updatedAt: num(r.updated_at) }; });
  (t.meta || []).forEach((r) => { if (r.key) s.meta[r.key] = r.value; });
  return s;
}

const clone = (s) => tablesToState(stateToTables(s));
const sameRecord = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

/* ---- three-way reconcile ------------------------------------------
   base   = snapshot at the last successful sync
   local  = what this device holds now
   remote = what the data source holds now
   Only records that actually changed on a side are candidates. A record
   changed on both sides is a genuine conflict; newest updated_at wins
   and the conflict is reported, never silently swallowed.
--------------------------------------------------------------------- */
function reconcile(base, local, remote) {
  const merged = emptyState();
  const conflicts = [];
  let fromLocal = 0, fromRemote = 0;

  COLLECTIONS.forEach((coll) => {
    const ids = new Set([...Object.keys(base[coll] || {}), ...Object.keys(local[coll] || {}), ...Object.keys(remote[coll] || {})]);
    ids.forEach((id) => {
      const b = base[coll]?.[id], l = local[coll]?.[id], r = remote[coll]?.[id];
      const lChanged = !sameRecord(b, l), rChanged = !sameRecord(b, r);
      let pick;
      if (lChanged && rChanged) {
        if (sameRecord(l, r)) pick = l;
        else {
          const mine = (l?.updatedAt || 0) >= (r?.updatedAt || 0);
          pick = mine ? l : r;
          conflicts.push({ coll, id, mine: l, theirs: r, taken: mine ? "mine" : "theirs" });
          mine ? fromLocal++ : fromRemote++;
        }
      } else if (lChanged) { pick = l; fromLocal++; }
      else if (rChanged) { pick = r; fromRemote++; }
      else pick = l ?? r ?? b;
      if (pick) merged[coll][id] = pick;
    });
  });

  merged.meta = { ...(base.meta || {}), ...(remote.meta || {}), ...(local.meta || {}) };
  return { merged, conflicts, fromLocal, fromRemote };
}

function pendingCount(base, local) {
  let n = 0;
  COLLECTIONS.forEach((coll) => {
    const ids = new Set([...Object.keys(base[coll] || {}), ...Object.keys(local[coll] || {})]);
    ids.forEach((id) => { if (!sameRecord(base[coll]?.[id], local[coll]?.[id])) n++; });
  });
  return n;
}

const countRecords = (s) =>
  Object.values(s.ingredients).filter((r) => !r.deleted).length +
  Object.values(s.entries).filter((r) => !r.deleted).length +
  Object.values(s.items).filter((r) => !r.deleted).length;

/* ================================================================== */
/* Layer 2 — cache                                                    */
/* ================================================================== */

const cache = (() => {
  let backing = null, mode = "memory";
  try {
    const probe = "__mb__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    backing = window.localStorage;
    mode = "localStorage";
  } catch { /* private mode, sandboxed frame, storage disabled */ }
  const mem = new Map();
  return {
    mode,
    get(k) { try { return backing ? backing.getItem(k) : mem.get(k) ?? null; } catch { return null; } },
    set(k, v) { try { backing ? backing.setItem(k, v) : mem.set(k, v); return true; } catch { return false; } },
    del(k) { try { backing ? backing.removeItem(k) : mem.delete(k); } catch { /* ignore */ } },
  };
})();

const readCachedState = (key) => {
  const raw = cache.get(key);
  if (!raw) return null;
  try { return tablesToState(JSON.parse(raw)); } catch { return null; }
};
const writeCachedState = (key, state) => cache.set(key, JSON.stringify(stateToTables(state)));

/* ================================================================== */
/* Layer 3 — remote adapters                                          */
/* ================================================================== */

/* --- none: the cache is the source of truth --- */
const localAdapter = () => ({
  id: "local",
  needsConnect: false,
  connected: () => true,
  describe: () => (cache.mode === "localStorage" ? "this device only" : "memory only — cache unavailable"),
  readTables: null,   // null means "no remote": commit is a cache write
  writeTables: null,
});

/* --- Google Drive: CSV records in an app-owned folder --- */
let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error("Google Identity unavailable")));
    s.onerror = () => reject(new Error("Could not load Google Identity Services — sandboxed frame or offline"));
    document.head.appendChild(s);
  });
  return gisPromise;
}

/* drive.file scope only grants an app visibility into files it created
   itself — a folder someone else merely shared with you never shows up
   in a files.list search. Picker is the one flow Google recognises as
   the user "opening" a file, which is what actually grants drive.file
   access to something the app didn't create. */
let pickerPromise = null;
function loadPicker() {
  if (pickerPromise) return pickerPromise;
  pickerPromise = new Promise((resolve, reject) => {
    if (window.google?.picker) return resolve(window.google);
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = () => {
      window.gapi.load("picker", {
        callback: () => (window.google?.picker ? resolve(window.google) : reject(new Error("Google Picker unavailable"))),
        onerror: () => reject(new Error("Could not load Google Picker")),
      });
    };
    s.onerror = () => reject(new Error("Could not load Google APIs — sandboxed frame or offline"));
    document.head.appendChild(s);
  });
  return pickerPromise;
}

function openFolderPicker(token, apiKey) {
  if (!apiKey) return Promise.reject(new Error("Add a Picker API key first — Storage → Drive connection."));
  return loadPicker().then((g) => new Promise((resolve, reject) => {
    const view = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMode(g.picker.DocsViewMode.LIST);
    new g.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        if (data.action === g.picker.Action.PICKED) {
          const doc = data.docs[0];
          resolve({ id: doc.id, name: doc.name });
        } else if (data.action === g.picker.Action.CANCEL) {
          reject(new Error("Folder pick cancelled"));
        }
      })
      .build()
      .setVisible(true);
  }));
}

function driveAdapter(cfg) {
  const st = { token: null, expiry: 0, folderId: null, folderName: null, fileIds: {}, user: null };

  const api = async (url, opts = {}) => {
    if (!st.token) throw new Error("Not connected to Drive");
    if (now() >= st.expiry) await auth(false);
    const res = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + st.token, ...(opts.headers || {}) } });
    if (res.status === 401) { st.token = null; throw new Error("Drive session expired — reconnect"); }
    if (!res.ok) throw new Error("Drive " + res.status + ": " + (await res.text()).slice(0, 140));
    const ct = res.headers.get("content-type") || "";
    return ct.includes("json") ? res.json() : res.text();
  };

  const auth = async (interactive) => {
    const g = await loadGis();
    const tok = await new Promise((resolve, reject) => {
      g.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: DRIVE_SCOPE,
        prompt: interactive ? "consent" : "",
        callback: (r) => (r.access_token ? resolve(r) : reject(new Error(r.error_description || r.error || "Authorisation cancelled"))),
        error_callback: (e) => reject(new Error(e?.message || "Authorisation window closed")),
      }).requestAccessToken();
    });
    st.token = tok.access_token;
    st.expiry = now() + (num(tok.expires_in) || 3500) * 1000 - 60000;
  };

  const createFile = async (name, content) => {
    const b = "mbnd" + uid();
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: [st.folderId], mimeType: "text/csv" }) +
      `\r\n--${b}\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${b}--`;
    const r = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body,
    });
    return r.id;
  };

  const identify = async () => {
    try {
      const about = await api("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)");
      st.user = about.user?.emailAddress || null;
    } catch { /* drive.file may not expose about */ }
  };

  const attachFolder = async (folderId) => {
    st.folderId = folderId;
    const listed = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name)&pageSize=100`);
    (listed.files || []).forEach((f) => (st.fileIds[f.name] = f.id));
    for (const n of TABLE_NAMES) {
      if (!st.fileIds[TABLES[n].file]) st.fileIds[TABLES[n].file] = await createFile(TABLES[n].file, toCSV(TABLES[n].cols, []));
    }
  };

  return {
    id: "drive",
    needsConnect: true,
    connected: () => !!st.token,
    describe: () => (st.token ? (st.user || "connected") + " · " + (st.folderName || cfg.folderName) : "not connected"),
    state: st,
    folderUrl: () => (st.folderId ? "https://drive.google.com/drive/folders/" + st.folderId : null),

    async connect() {
      await auth(true);
      await identify();

      if (cfg.driveFolderId) {
        await attachFolder(cfg.driveFolderId);
        return st.user;
      }

      const q = encodeURIComponent(`name='${cfg.folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const found = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`);
      const folderId = found.files?.[0]?.id || (await api("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cfg.folderName, mimeType: "application/vnd.google-apps.folder" }),
      })).id;
      await attachFolder(folderId);
      return st.user;
    },

    /* Join a folder someone else created and shared with you. Picking it
       explicitly through Picker is what grants drive.file access to a
       folder this app didn't create — a plain "Share by link" alone
       never becomes visible to another account's files.list search. */
    async joinSharedFolder() {
      await auth(true);
      await identify();
      const picked = await openFolderPicker(st.token, cfg.pickerApiKey);
      st.folderName = picked.name;
      await attachFolder(picked.id);
      return { id: picked.id, name: picked.name, user: st.user };
    },

    disconnect() { st.token = null; st.folderId = null; st.fileIds = {}; st.user = null; },

    async readTables() {
      const t = {};
      for (const n of TABLE_NAMES) {
        const id = st.fileIds[TABLES[n].file];
        if (!id) { t[n] = []; continue; }
        const text = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
        t[n] = parseCSV(typeof text === "string" ? text : "");
      }
      return t;
    },

    async writeTables(tables) {
      for (const n of TABLE_NAMES) {
        await api(`https://www.googleapis.com/upload/drive/v3/files/${st.fileIds[TABLES[n].file]}?uploadType=media`, {
          method: "PATCH", headers: { "Content-Type": "text/csv" }, body: toCSV(TABLES[n].cols, tables[n] || []),
        });
      }
    },

    async share(on) {
      if (on) {
        await api(`https://www.googleapis.com/drive/v3/files/${st.folderId}/permissions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "writer", type: "anyone" }),
        });
      } else {
        const p = await api(`https://www.googleapis.com/drive/v3/files/${st.folderId}/permissions?fields=permissions(id,type)`);
        for (const perm of p.permissions || []) {
          if (perm.type === "anyone") await api(`https://www.googleapis.com/drive/v3/files/${st.folderId}/permissions/${perm.id}`, { method: "DELETE" });
        }
      }
    },
  };
}

/* --- self-hosted: plain GET/PUT per CSV. Works against WebDAV
       (Nextcloud), the bundled data server, or anything that speaks
       those two verbs. --- */
function httpAdapter(cfg) {
  const base = (cfg.httpBase || "").replace(/\/+$/, "");
  const auth = () => {
    if (cfg.httpToken) return { Authorization: "Bearer " + cfg.httpToken };
    if (cfg.httpUser) return { Authorization: "Basic " + btoa(cfg.httpUser + ":" + (cfg.httpPass || "")) };
    return {};
  };
  return {
    id: "http",
    needsConnect: true,
    connected: () => !!base,
    describe: () => base || "no address set",

    async connect() {
      const res = await fetch(`${base}/${TABLES.meta.file}`, { headers: auth(), cache: "no-store" });
      if (!res.ok && res.status !== 404) throw new Error(`GET ${TABLES.meta.file} → ${res.status} ${res.statusText}`);
      return base;
    },
    disconnect() {},

    async readTables() {
      const t = {};
      for (const n of TABLE_NAMES) {
        const res = await fetch(`${base}/${TABLES[n].file}`, { headers: auth(), cache: "no-store" });
        if (res.status === 404) { t[n] = []; continue; }
        if (!res.ok) throw new Error(`GET ${TABLES[n].file} → ${res.status}`);
        t[n] = parseCSV(await res.text());
      }
      return t;
    },

    async writeTables(tables) {
      for (const n of TABLE_NAMES) {
        const res = await fetch(`${base}/${TABLES[n].file}`, {
          method: "PUT",
          headers: { ...auth(), "Content-Type": "text/csv" },
          body: toCSV(TABLES[n].cols, tables[n] || []),
        });
        if (!res.ok) throw new Error(`PUT ${TABLES[n].file} → ${res.status}`);
      }
    },
  };
}

const buildAdapter = (cfg) =>
  cfg.target === "drive" ? driveAdapter(cfg) : cfg.target === "http" ? httpAdapter(cfg) : localAdapter();

/* ================================================================== */
/* Derivation                                                         */
/* ================================================================== */

function derive(state, scopeEntries) {
  const list = [...scopeEntries].sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0));
  const need = {};
  list.forEach((e) => e.items.forEach((it) => { need[it.ingId] = (need[it.ingId] || 0) + num(it.qty); }));

  const fridge = {}, bought = {}, toBuy = {}, pool = {};
  Object.keys(need).forEach((id) => {
    const s = state.stock[id] || {};
    fridge[id] = num(s.fridge); bought[id] = num(s.bought);
    toBuy[id] = Math.max(0, need[id] - fridge[id]);
    pool[id] = fridge[id] + bought[id];
  });

  const left = { ...pool }, status = {}, covered = {};
  list.forEach((e) => {
    let full = e.items.length > 0;
    e.items.forEach((it) => {
      const want = num(it.qty);
      const take = Math.min(left[it.ingId] || 0, want);
      left[it.ingId] = (left[it.ingId] || 0) - take;
      covered[e.id + "|" + it.ingId] = take;
      if (take < want - 1e-9) full = false;
    });
    status[e.id] = e.items.length === 0 ? "empty" : full ? "ready" : "pending";
  });

  const usedBy = {};
  list.forEach((e) => e.items.forEach((it) => (usedBy[it.ingId] = usedBy[it.ingId] || []).push(e)));
  return { need, fridge, bought, toBuy, status, covered, usedBy, entries: list };
}

const rowState = (b, buy) => (buy <= 0 || b >= buy - 1e-9 ? "done" : b > 0 ? "partial" : "todo");

/* ================================================================== */
/* Shared UI                                                          */
/* ================================================================== */

function Gauge({ bought, toBuy, onClick, label }) {
  const st = rowState(bought, toBuy);
  const pct = toBuy <= 0 ? 100 : Math.max(0, Math.min(100, (bought / toBuy) * 100));
  return (
    <button className={"mb-gauge " + (st === "done" ? "done" : st === "todo" ? "todo" : "")} onClick={onClick} aria-label={label} title={label}>
      <i style={{ height: pct + "%" }} />{st === "done" && <b>✓</b>}
    </button>
  );
}

function CatIcon({ category }) {
  return (
    <span className="mb-chip" style={{ background: CATEGORY_TINT[category] || CATEGORY_TINT.Other }} aria-hidden="true">
      {CATEGORY_ICONS[category] || CATEGORY_ICONS.Other}
    </span>
  );
}

function Disclosure({ id, open, onToggle, label, children }) {
  return (
    <div className="mb-disc">
      <button className="mb-disc-btn" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className={"mb-caret " + (open ? "open" : "")}>▶</span>{label}
      </button>
      {open && <div className="mb-disc-body">{children}</div>}
    </div>
  );
}

const LinkRow = ({ dot, name, qty, onClick }) => (
  <button className="mb-link" onClick={onClick}>
    {dot && <span className={"mb-dot " + dot} />}
    <span className="grow">{name}</span>
    {qty && <span className="qty">{qty}</span>}
    <span className="mb-arrow">→</span>
  </button>
);

function Autocomplete({ value, onChange, onPick, options, placeholder, allowNew, autoFocus }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const q = norm(value);
  const matches = useMemo(() => (!q ? options.slice(0, 8) : options.filter((o) => norm(o.label).includes(q)).slice(0, 8)), [q, options]);
  const exact = options.some((o) => norm(o.label) === q);

  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="mb-ac" ref={box}>
      <input className="mb-input" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); if (matches.length && !exact) onPick(matches[0]); else if (value.trim()) onPick({ label: value.trim(), isNew: true }); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }} />
      {open && (matches.length > 0 || (allowNew && value.trim() && !exact)) && (
        <div className="mb-ac-list">
          {matches.map((o) => (
            <button key={o.id} onClick={() => { onPick(o); setOpen(false); }}>
              {o.label}{o.hint && <span className="qty" style={{ marginLeft: 8 }}>{o.hint}</span>}
            </button>
          ))}
          {allowNew && value.trim() && !exact && (
            <button className="new" onClick={() => { onPick({ label: value.trim(), isNew: true }); setOpen(false); }}>+ Add “{value.trim()}”</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Entry sheet                                                        */
/* ================================================================== */

function EntrySheet({ ingredients, entryList, draft, onClose, onSave, onDelete }) {
  const [name, setName] = useState(draft.name || "");
  const [kind, setKind] = useState(draft.kind || "meal");
  const [date, setDate] = useState(draft.date);
  const [items, setItems] = useState(draft.items ? draft.items.map((i) => ({ ingId: i.ingId, qty: i.qty })) : []);
  const [ingText, setIngText] = useState("");
  const [newIng, setNewIng] = useState(null);
  const [pending, setPending] = useState({});

  const allIngs = useMemo(() => ({ ...ingredients, ...pending }), [ingredients, pending]);
  const entryNames = useMemo(() => {
    const seen = new Map();
    entryList.forEach((e) => { if (e.name && !seen.has(norm(e.name))) seen.set(norm(e.name), e); });
    return [...seen.values()].map((e) => ({ id: e.id, label: e.name, entry: e }));
  }, [entryList]);
  const ingOptions = useMemo(
    () => Object.values(allIngs).filter((i) => !i.deleted && !items.some((it) => it.ingId === i.id)).map((i) => ({ id: i.id, label: i.name, hint: i.unit })),
    [allIngs, items]
  );

  return (
    <div className="mb-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mb-sheet" role="dialog" aria-modal="true">
        <div className="mb-sheet-head">
          <div className="mb-sheet-title">{draft.id ? "Edit entry" : "New entry"}</div>
          <button className="mb-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mb-field">
          <label className="mb-label">What is it</label>
          <Autocomplete value={name} onChange={setName}
            onPick={(o) => { setName(o.label); if (o.entry?.items?.length && items.length === 0) setItems(o.entry.items.map((i) => ({ ingId: i.ingId, qty: i.qty }))); }}
            options={entryNames} placeholder="Roast chicken, iced tea, popcorn…" allowNew autoFocus={!draft.id} />
        </div>

        <div className="mb-two">
          <div className="mb-field">
            <label className="mb-label">Kind</label>
            <div className="mb-seg">{KINDS.map((k) => <button key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{KIND_ICONS[k.id]} {k.label}</button>)}</div>
          </div>
          <div className="mb-field">
            <label className="mb-label">Day</label>
            <input className="mb-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="mb-field">
          <label className="mb-label">Ingredients</label>
          {items.map((it) => {
            const ing = allIngs[it.ingId];
            if (!ing) return null;
            return (
              <div className="mb-ing-row" key={it.ingId}>
                <span className="nm">{ing.name}</span>
                <input className="mb-qty" type="number" min="0" step="any" value={it.qty}
                  onChange={(e) => setItems((p) => p.map((x) => (x.ingId === it.ingId ? { ...x, qty: e.target.value === "" ? "" : Number(e.target.value) } : x)))} />
                <span className="mb-unit">{ing.unit}</span>
                <button className="mb-x" onClick={() => setItems((p) => p.filter((x) => x.ingId !== it.ingId))} aria-label={"Remove " + ing.name}>✕</button>
              </div>
            );
          })}
          {items.length === 0 && <div className="mb-none">Nothing added yet — an entry with no ingredients stays grey.</div>}

          {newIng ? (
            <div className="mb-card" style={{ padding: 11, marginTop: 6 }}>
              <label className="mb-label">New ingredient</label>
              <input className="mb-input" value={newIng.name} onChange={(e) => setNewIng({ ...newIng, name: e.target.value })} style={{ marginBottom: 8 }} />
              <div className="mb-two" style={{ marginBottom: 10 }}>
                <select className="mb-input" value={newIng.category} onChange={(e) => setNewIng({ ...newIng, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                <select className="mb-input" value={newIng.unit} onChange={(e) => setNewIng({ ...newIng, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              </div>
              <div className="mb-two">
                <button className="mb-btn ghost" onClick={() => setNewIng(null)}>Cancel</button>
                <button className="mb-btn" onClick={() => {
                  if (!newIng.name.trim()) return;
                  const id = uid();
                  setPending((p) => ({ ...p, [id]: { id, name: newIng.name.trim(), category: newIng.category, unit: newIng.unit, updatedAt: now(), deleted: false } }));
                  setItems((p) => [...p, { ingId: id, qty: stepFor(newIng.unit) }]);
                  setNewIng(null);
                }}>Add ingredient</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              <Autocomplete value={ingText} onChange={setIngText} options={ingOptions} placeholder="Type an ingredient…" allowNew
                onPick={(o) => {
                  if (o.isNew) { setNewIng({ name: o.label, category: "Other", unit: "g" }); setIngText(""); return; }
                  setItems((p) => [...p, { ingId: o.id, qty: stepFor(allIngs[o.id]?.unit) }]);
                  setIngText("");
                }} />
            </div>
          )}
        </div>

        <div className="mb-sheet-actions">
          {draft.id && <button className="mb-btn danger" onClick={() => onDelete(draft.id)}>Delete</button>}
          <button className="mb-btn ghost" onClick={onClose}>Cancel</button>
          <button className="mb-btn" onClick={() => onSave(
            { id: draft.id || uid(), name: name.trim() || "Untitled", kind, date, createdAt: draft.createdAt || now() },
            items.filter((i) => i.qty !== "" && Number(i.qty) > 0).map((i) => ({ ingId: i.ingId, qty: Number(i.qty) })),
            pending
          )}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Views                                                              */
/* ================================================================== */

function CalendarView({ ingredients, d, week, setWeek, open, toggle, goto, onNew, onEdit, onSample, hasEntries }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = iso(new Date());
  const byDay = {};
  d.entries.forEach((e) => (byDay[e.date] = byDay[e.date] || []).push(e));

  return (
    <div className="mb-view">
      <div className="mb-weekbar">
        <button className="mb-step" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">‹</button>
        <div className="lbl">{shortDate(week)} – {shortDate(addDays(week, 6))}</div>
        <button className="mb-today" onClick={() => setWeek(mondayOf(new Date()))}>Today</button>
        <button className="mb-step" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">›</button>
      </div>

      {!hasEntries && (
        <div className="mb-empty" style={{ marginBottom: 16 }}>
          <div className="mb-empty-ic">🥗</div>
          <p>Nothing planned yet. Add a meal to any day, or drop in a sample week to see the grocery list fill itself.</p>
          <button className="mb-btn" onClick={onSample}>Load a sample week</button>
        </div>
      )}

      {days.map((day) => {
        const ds = iso(day);
        const list = (byDay[ds] || []).sort((a, b) => KINDS.findIndex((k) => k.id === a.kind) - KINDS.findIndex((k) => k.id === b.kind));
        return (
          <div key={ds} className={"mb-day " + (ds === today ? "is-today" : "")}>
            <div className="mb-day-head">
              <span className="mb-day-name">{DAY_NAMES[(day.getDay() + 6) % 7]}</span>
              <span className="mb-day-date">{shortDate(day)}</span>
              <span className="mb-day-rule" />
              <button className="mb-add" onClick={() => onNew(ds)}>+ Add</button>
            </div>
            {list.length === 0 && <div className="mb-day-none">Nothing planned.</div>}
            {list.map((e) => {
              const st = d.status[e.id] || "empty";
              const ok = e.items.filter((it) => (d.covered[e.id + "|" + it.ingId] || 0) >= num(it.qty) - 1e-9).length;
              return (
                <div key={e.id} className={"mb-ticket " + st} id={"node-entry-" + e.id}>
                  <div className="mb-stub"><span className="mb-stub-ic" aria-hidden="true">{KIND_ICONS[e.kind] || "🍽️"}</span></div>
                  <div className="mb-ticket-body">
                    <div className="mb-ticket-row">
                      <button className="mb-ticket-name" onClick={() => onEdit(e)}>{e.name}</button>
                      <span className={"mb-stamp " + st}>{st === "ready" ? "All in" : st === "pending" ? "To buy" : "Empty"}</span>
                    </div>
                    <div className="mb-ticket-meta">{e.items.length === 0 ? "no ingredients" : `${ok}/${e.items.length} ingredients covered`}</div>
                    <div style={{ margin: "0 -12px -10px" }}>
                      <Disclosure id={"entry:" + e.id} open={!!open["entry:" + e.id]} onToggle={toggle} label={`Details · ${e.items.length} link${e.items.length === 1 ? "" : "s"}`}>
                        <div className="mb-link-h">Ingredients — tap to open in Groceries</div>
                        {e.items.length === 0 && <div className="mb-none">Add ingredients to link this entry to the grocery list.</div>}
                        {e.items.map((it) => {
                          const ing = ingredients[it.ingId];
                          if (!ing) return null;
                          const covered = (d.covered[e.id + "|" + it.ingId] || 0) >= num(it.qty) - 1e-9;
                          return <LinkRow key={it.ingId} dot={covered ? "ready" : "pending"} name={ing.name} qty={`${fmt(it.qty)} ${ing.unit}`}
                            onClick={() => goto(d.toBuy[it.ingId] > 0 ? "groceries" : "fridge", "ing:" + it.ingId)} />;
                        })}
                      </Disclosure>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function GroceryView({ ingredients, d, open, toggle, goto, setBought, scopeLabel }) {
  const [hideDone, setHideDone] = useState(false);
  const ids = Object.keys(d.need).filter((id) => ingredients[id] && d.toBuy[id] > 0);
  const groups = {};
  ids.forEach((id) => (groups[ingredients[id].category || "Other"] = groups[ingredients[id].category || "Other"] || []).push(id));
  const left = ids.filter((id) => rowState(d.bought[id], d.toBuy[id]) !== "done").length;
  const partial = ids.filter((id) => rowState(d.bought[id], d.toBuy[id]) === "partial").length;

  return (
    <div className="mb-view">
      <div className="mb-sum">
        <div className="fire"><div className="n">{left}</div><div className="l">Still to buy</div></div>
        <div><div className="n">{partial}</div><div className="l">Part bought</div></div>
        <div className="ready"><div className="n">{ids.length - left}</div><div className="l">Done</div></div>
      </div>

      {ids.length === 0 ? (
        <div className="mb-empty"><div className="mb-empty-ic">✅</div><p>Nothing to buy for {scopeLabel.toLowerCase()}. Plan some meals, or check the fridge — you may already have it all.</p></div>
      ) : (
        <>
          <div className="mb-group-head">
            <span className="mb-h">Grouped list</span><span className="mb-day-rule" />
            <label className="mb-toggle"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Hide done</label>
          </div>
          {CATEGORIES.filter((c) => groups[c]).map((cat) => {
            const rows = groups[cat].filter((id) => !(hideDone && rowState(d.bought[id], d.toBuy[id]) === "done"));
            if (!rows.length) return null;
            return (
              <div className="mb-group" key={cat}>
                <div className="mb-group-head"><span className="mb-h">{CATEGORY_ICONS[cat] || CATEGORY_ICONS.Other} {cat}</span><span className="mb-day-rule" /></div>
                {rows.sort((a, b) => ingredients[a].name.localeCompare(ingredients[b].name)).map((id) => {
                  const ing = ingredients[id];
                  const b = d.bought[id] || 0, buy = d.toBuy[id], st = rowState(b, buy), step = stepFor(ing.unit);
                  const users = d.usedBy[id] || [];
                  return (
                    <div className="mb-row" key={id} id={"node-ing-" + id}>
                      <div className="mb-row-main">
                        <Gauge bought={b} toBuy={buy} label={`${ing.name}: ${fmt(b)} of ${fmt(buy)} ${ing.unit} bought`} onClick={() => setBought(id, st === "done" ? 0 : buy)} />
                        <div className="mb-row-text">
                          <div className={"mb-row-name " + (st === "done" ? "struck" : "")}>{ing.name}</div>
                          <div className="mb-row-sub">
                            buy {fmt(buy)} {ing.unit}
                            {b > 0 && st !== "done" ? ` · ${fmt(b)} in the bag, ${fmt(buy - b)} left` : ""}
                            {d.fridge[id] > 0 ? ` · ${fmt(d.fridge[id])} in fridge` : ""}
                          </div>
                        </div>
                        <div className="mb-stepper">
                          <button onClick={() => setBought(id, Math.max(0, b - step))} disabled={b <= 0} aria-label={"Less " + ing.name}>−</button>
                          <button onClick={() => setBought(id, Math.min(buy, b + step))} disabled={b >= buy} aria-label={"More " + ing.name}>+</button>
                        </div>
                      </div>
                      <Disclosure id={"groc:" + id} open={!!open["groc:" + id]} onToggle={toggle} label={`Details · ${users.length + 2} links`}>
                        <div className="mb-link-h">Needed by</div>
                        {users.map((e) => (
                          <LinkRow key={e.id} dot={d.status[e.id]} name={`${e.name} · ${shortDate(parseISO(e.date))}`}
                            qty={`${fmt((e.items.find((i) => i.ingId === id) || {}).qty)} ${ing.unit}`}
                            onClick={() => goto("calendar", "entry:" + e.id, parseISO(e.date))} />
                        ))}
                        <div className="mb-link-h">Elsewhere</div>
                        <LinkRow name="In the fridge" qty={`${fmt(d.fridge[id])} ${ing.unit}`} onClick={() => goto("fridge", "ing:" + id)} />
                        <LinkRow name="Ingredient details" onClick={() => goto("ingredients", "ing:" + id)} />
                      </Disclosure>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function FridgeView({ ingredients, stock, d, open, toggle, goto, setFridge }) {
  const [q, setQ] = useState("");
  const all = Object.values(ingredients);
  const stocked = all.filter((i) => num(stock[i.id]?.fridge) > 0);
  const rest = all.filter((i) => !(num(stock[i.id]?.fridge) > 0) && (!q || norm(i.name).includes(norm(q))));

  const render = (ing, links) => {
    const have = num(stock[ing.id]?.fridge), step = stepFor(ing.unit);
    const users = d.usedBy[ing.id] || [], need = d.need[ing.id] || 0;
    return (
      <div className="mb-row" key={ing.id} id={"node-ing-" + ing.id}>
        <div className="mb-row-main">
          <CatIcon category={ing.category} />
          <div className="mb-row-text">
            <div className="mb-row-name">{ing.name}</div>
            <div className="mb-row-sub">{have > 0 ? `${fmt(have)} ${ing.unit} at home` : "none at home"}{need > 0 ? ` · ${fmt(need)} ${ing.unit} planned` : ""}</div>
          </div>
          <div className="mb-stepper">
            <button onClick={() => setFridge(ing.id, Math.max(0, have - step))} disabled={have <= 0} aria-label={"Less " + ing.name}>−</button>
            <button onClick={() => setFridge(ing.id, have + step)} aria-label={"More " + ing.name}>+</button>
          </div>
        </div>
        {links && (
          <Disclosure id={"fridge:" + ing.id} open={!!open["fridge:" + ing.id]} onToggle={toggle} label={`Details · ${users.length + 1} links`}>
            <div className="mb-link-h">Planned for</div>
            {users.length === 0 && <div className="mb-none">Not used by anything planned right now.</div>}
            {users.map((e) => <LinkRow key={e.id} dot={d.status[e.id]} name={`${e.name} · ${shortDate(parseISO(e.date))}`} onClick={() => goto("calendar", "entry:" + e.id, parseISO(e.date))} />)}
            <div className="mb-link-h">Elsewhere</div>
            {d.toBuy[ing.id] > 0
              ? <LinkRow name="On the grocery list" qty={`${fmt(d.toBuy[ing.id])} ${ing.unit}`} onClick={() => goto("groceries", "ing:" + ing.id)} />
              : <div className="mb-none">Not on the grocery list — covered or unplanned.</div>}
            <LinkRow name="Ingredient details" onClick={() => goto("ingredients", "ing:" + ing.id)} />
          </Disclosure>
        )}
      </div>
    );
  };

  return (
    <div className="mb-view">
      {all.length === 0 && <div className="mb-empty"><div className="mb-empty-ic">🧊</div><p>The fridge is empty because there are no ingredients yet. Add a meal first — its ingredients show up here.</p></div>}
      {stocked.length > 0 && (
        <div className="mb-group">
          <div className="mb-group-head"><span className="mb-h">In the fridge</span><span className="mb-day-rule" /></div>
          {stocked.sort((a, b) => a.name.localeCompare(b.name)).map((i) => render(i, true))}
        </div>
      )}
      {all.length > 0 && (
        <div className="mb-group">
          <div className="mb-group-head"><span className="mb-h">Add what you have</span><span className="mb-day-rule" /></div>
          <input className="mb-search" value={q} placeholder="Search ingredients…" onChange={(e) => setQ(e.target.value)} />
          {rest.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40).map((i) => render(i, false))}
          {rest.length === 0 && <div className="mb-none">No match.</div>}
        </div>
      )}
    </div>
  );
}

function IngredientsView({ ingredients, stock, entriesAll, d, open, toggle, goto, updateIng, deleteIng, addIng }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(null);
  const all = Object.values(ingredients).filter((i) => !q || norm(i.name).includes(norm(q))).sort((a, b) => a.name.localeCompare(b.name));
  const usage = {};
  entriesAll.forEach((e) => e.items.forEach((it) => { usage[it.ingId] = (usage[it.ingId] || 0) + 1; }));
  const groups = {};
  all.forEach((i) => (groups[i.category || "Other"] = groups[i.category || "Other"] || []).push(i));

  return (
    <div className="mb-view">
      <div className="mb-group-head">
        <span className="mb-h">All ingredients · {Object.keys(ingredients).length}</span>
        <span className="mb-day-rule" />
        <button className="mb-add" onClick={() => setAdding({ name: "", category: "Other", unit: "g" })}>+ New</button>
      </div>

      {adding && (
        <div className="mb-card" style={{ padding: 11, marginBottom: 12 }}>
          <label className="mb-label">Name</label>
          <input className="mb-input" autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} style={{ marginBottom: 8 }} />
          <div className="mb-two" style={{ marginBottom: 10 }}>
            <select className="mb-input" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="mb-input" value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <div className="mb-two">
            <button className="mb-btn ghost" onClick={() => setAdding(null)}>Cancel</button>
            <button className="mb-btn" onClick={() => { if (adding.name.trim()) { addIng(adding); setAdding(null); } }}>Save ingredient</button>
          </div>
        </div>
      )}

      <input className="mb-search" value={q} placeholder="Search…" onChange={(e) => setQ(e.target.value)} />
      {all.length === 0 && <div className="mb-empty"><div className="mb-empty-ic">🥕</div><p>No ingredients yet. They collect here automatically as you build meals, and drive every autocomplete in the app.</p></div>}

      {CATEGORIES.filter((c) => groups[c]).map((cat) => (
        <div className="mb-group" key={cat}>
          <div className="mb-group-head"><span className="mb-h">{CATEGORY_ICONS[cat] || CATEGORY_ICONS.Other} {cat}</span><span className="mb-day-rule" /></div>
          {groups[cat].map((ing) => {
            const users = d.usedBy[ing.id] || [], used = usage[ing.id] || 0;
            return (
              <div className="mb-row" key={ing.id} id={"node-ing-" + ing.id}>
                <div className="mb-row-main">
                  <div className="mb-row-text">
                    <div className="mb-row-name">{ing.name}</div>
                    <div className="mb-row-sub">{ing.unit} · used in {used} entr{used === 1 ? "y" : "ies"}{d.need[ing.id] > 0 ? ` · ${fmt(d.need[ing.id])} ${ing.unit} planned` : ""}</div>
                  </div>
                  <select className="mb-input" style={{ width: 78, padding: "6px 6px", fontSize: 13 }} value={ing.unit} onChange={(e) => updateIng(ing.id, { unit: e.target.value })}>
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <Disclosure id={"ing:" + ing.id} open={!!open["ing:" + ing.id]} onToggle={toggle} label={`Details · ${users.length + 2} links`}>
                  <div className="mb-link-h">Category</div>
                  <select className="mb-input" value={ing.category} onChange={(e) => updateIng(ing.id, { category: e.target.value })} style={{ marginBottom: 4 }}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <div className="mb-link-h">Used in</div>
                  {users.length === 0 && <div className="mb-none">Not in anything planned.</div>}
                  {users.map((e) => <LinkRow key={e.id} dot={d.status[e.id]} name={`${e.name} · ${shortDate(parseISO(e.date))}`} onClick={() => goto("calendar", "entry:" + e.id, parseISO(e.date))} />)}
                  <div className="mb-link-h">Elsewhere</div>
                  {d.toBuy[ing.id] > 0 && <LinkRow name="On the grocery list" qty={`${fmt(d.toBuy[ing.id])} ${ing.unit}`} onClick={() => goto("groceries", "ing:" + ing.id)} />}
                  <LinkRow name="In the fridge" qty={`${fmt(stock[ing.id]?.fridge || 0)} ${ing.unit}`} onClick={() => goto("fridge", "ing:" + ing.id)} />
                  {used === 0 && <button className="mb-btn danger" style={{ width: "100%", marginTop: 8 }} onClick={() => deleteIng(ing.id)}>Delete ingredient</button>}
                </Disclosure>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Storage view                                                       */
/* ================================================================== */

function StorageView({ config, setConfig, adapter, sync, state, pending, conflicts, error, onConnect, onDisconnect, onJoinDrive, onLeaveDrive, onSync, onShare, onWipeCache }) {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const apply = (patch) => setConfig({ ...config, ...patch });

  const download = (t) => {
    const csv = toCSV(TABLES[t].cols, stateToTables(state)[t]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = TABLES[t].file; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const label = (c) => {
    const rec = c.mine || c.theirs;
    if (c.coll === "entries") return rec?.name || "entry";
    if (c.coll === "ingredients") return rec?.name || "ingredient";
    if (c.coll === "stock") return (state.ingredients[c.id]?.name || "stock") + " — fridge/bought";
    const ing = state.ingredients[rec?.ingId];
    return (state.entries[rec?.entryId]?.name || "entry") + " → " + (ing?.name || "ingredient");
  };

  const Target = ({ id, title, blurb }) => (
    <button className={"mb-target " + (config.target === id ? "on" : "")} onClick={() => apply({ target: id })}>
      <span className="pip" />
      <span style={{ flex: 1 }}><h4>{title}</h4><span>{blurb}</span></span>
    </button>
  );

  return (
    <div className="mb-view">
      <div className="mb-group-head"><span className="mb-h">How this app stores data</span><span className="mb-day-rule" /></div>

      <div className="mb-panel">
        <p><strong>React state</strong> is the live copy — every screen reads it, nothing waits on the network.
        <strong> The cache</strong> ({cache.mode === "localStorage" ? "localStorage" : "in-memory fallback — this browser blocks localStorage"}) is written on every change, so a reload or a dead connection loses nothing.
        <strong> The data source</strong> below is only ever written after a reconcile against the snapshot from your last sync.</p>
      </div>

      <div className="mb-group-head"><span className="mb-h">Data source</span><span className="mb-day-rule" /></div>
      <Target id="local" title="This device only" blurb="Cache is the source of truth. No account, no network, nothing leaves the browser. Clearing site data erases the plan — export the CSVs to keep a copy." />
      <Target id="drive" title="Google Drive" blurb="A folder of CSVs in Drive, using the drive.file scope. Create your own folder, or join one someone shared with you, to collaborate from anywhere." />
      <Target id="http" title="Self-hosted" blurb="Any endpoint that answers GET and PUT per file — the bundled data server, Nextcloud WebDAV, or your own. Nothing touches Google." />

      {error && <div className="mb-note" style={{ marginTop: 12 }}>{error}</div>}

      {config.target === "drive" && (
        <div className="mb-panel">
          <div className="mb-group-head"><span className="mb-h">Drive connection</span><span className="mb-day-rule" /></div>
          <div className="mb-field">
            <label className="mb-label">OAuth client ID</label>
            <input className="mb-input" value={draft.clientId || ""} placeholder="1234-abcd.apps.googleusercontent.com"
              onChange={(e) => setDraft({ ...draft, clientId: e.target.value })} onBlur={() => apply({ clientId: (draft.clientId || "").trim() })} />
          </div>
          <div className="mb-field">
            <label className="mb-label">Picker API key <span style={{ textTransform: "none", letterSpacing: 0 }}>— only needed to join someone else's folder</span></label>
            <input className="mb-input" value={draft.pickerApiKey || ""} placeholder="AIza…"
              onChange={(e) => setDraft({ ...draft, pickerApiKey: e.target.value })} onBlur={() => apply({ pickerApiKey: (draft.pickerApiKey || "").trim() })} />
          </div>

          {config.driveFolderId ? (
            <div className="mb-note good" style={{ marginBottom: 12 }}>
              Following a shared folder: <strong>{config.folderName}</strong>.
              {" "}<button className="mb-btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={onLeaveDrive}>Use my own folder instead</button>
            </div>
          ) : (
            <div className="mb-field">
              <label className="mb-label">Folder name</label>
              <input className="mb-input" value={draft.folderName || ""} onChange={(e) => setDraft({ ...draft, folderName: e.target.value })}
                onBlur={() => apply({ folderName: (draft.folderName || "").trim() || "Mealboard" })} />
            </div>
          )}

          <div className="mb-two">
            {adapter.connected()
              ? <button className="mb-btn ghost" onClick={onDisconnect}>Disconnect</button>
              : <button className="mb-btn" disabled={!config.clientId} onClick={onConnect}>{config.driveFolderId ? "Reconnect" : "Connect"}</button>}
            <button className="mb-btn ghost" disabled={!adapter.connected()} onClick={onSync}>Sync now</button>
          </div>
          <button className="mb-btn ghost" style={{ width: "100%", marginTop: 8 }} disabled={!config.clientId || !config.pickerApiKey} onClick={onJoinDrive}>
            Join a shared folder…
          </button>
          {adapter.connected() && (
            <>
              <div style={{ marginTop: 12 }}>
                <div className="mb-kv"><span>Account</span><span>{adapter.state?.user || "connected"}</span></div>
                <div className="mb-kv"><span>Folder</span><span>{config.folderName}</span></div>
              </div>
              <div className="mb-two" style={{ marginTop: 10 }}>
                <button className="mb-btn ghost" onClick={() => onShare(true)}>Share by link</button>
                <button className="mb-btn ghost" onClick={() => onShare(false)}>Stop sharing</button>
              </div>
              {adapter.folderUrl?.() && (
                <a className="mb-btn ghost" style={{ display: "block", marginTop: 8, textDecoration: "none" }} href={adapter.folderUrl()} target="_blank" rel="noreferrer">Open folder in Drive</a>
              )}
            </>
          )}
          <div className="mb-note" style={{ marginTop: 12, marginBottom: 0 }}>
            Add <code>{origin || "your site origin"}</code> to the OAuth client's authorised JavaScript origins, and to the Picker API key's website restrictions — origin only, no path. Google blocks OAuth from sandboxed frames, so this needs the deployed site.
            To collaborate: the owner picks <strong>Connect</strong> and <strong>Share by link</strong>; everyone else pastes in the same client ID (and a Picker API key) and picks <strong>Join a shared folder…</strong> to select it from "Shared with me" — a plain link alone won't let their app find it.
          </div>
        </div>
      )}

      {config.target === "http" && (
        <div className="mb-panel">
          <div className="mb-group-head"><span className="mb-h">Self-hosted endpoint</span><span className="mb-day-rule" /></div>
          <div className="mb-field">
            <label className="mb-label">Base URL</label>
            <input className="mb-input" value={draft.httpBase || ""} placeholder="https://data.example.com/mealboard"
              onChange={(e) => setDraft({ ...draft, httpBase: e.target.value })} onBlur={() => apply({ httpBase: (draft.httpBase || "").trim() })} />
          </div>
          <div className="mb-field">
            <label className="mb-label">Bearer token (or leave blank for basic auth)</label>
            <input className="mb-input" type="password" value={draft.httpToken || ""}
              onChange={(e) => setDraft({ ...draft, httpToken: e.target.value })} onBlur={() => apply({ httpToken: draft.httpToken })} />
          </div>
          <div className="mb-two" style={{ marginBottom: 12 }}>
            <input className="mb-input" placeholder="user" value={draft.httpUser || ""} onChange={(e) => setDraft({ ...draft, httpUser: e.target.value })} onBlur={() => apply({ httpUser: draft.httpUser })} />
            <input className="mb-input" type="password" placeholder="password" value={draft.httpPass || ""} onChange={(e) => setDraft({ ...draft, httpPass: e.target.value })} onBlur={() => apply({ httpPass: draft.httpPass })} />
          </div>
          <div className="mb-two">
            <button className="mb-btn" disabled={!config.httpBase} onClick={onConnect}>Test &amp; connect</button>
            <button className="mb-btn ghost" disabled={!adapter.connected()} onClick={onSync}>Sync now</button>
          </div>
          <div className="mb-note" style={{ marginTop: 12, marginBottom: 0 }}>
            The server must send CORS headers allowing <code>{origin || "this origin"}</code> for GET and PUT, or the browser blocks it. Credentials are held in this browser's storage — prefer a scoped token over your account password.
          </div>
        </div>
      )}

      <div className="mb-group-head"><span className="mb-h">Sync</span><span className="mb-day-rule" /></div>
      <div className="mb-panel">
        <div className="mb-kv"><span>Source</span><span>{adapter.describe()}</span></div>
        <div className="mb-kv"><span>Cache</span><span>{cache.mode}</span></div>
        <div className="mb-kv"><span>Last sync</span><span>{clock(sync.at)}</span></div>
        <div className="mb-kv"><span>Uncommitted</span><span>{pending} record{pending === 1 ? "" : "s"}</span></div>
        <div className="mb-kv"><span>Records</span><span>{countRecords(state)}</span></div>
        <label className="mb-toggle" style={{ marginTop: 12, marginLeft: 0 }}>
          <input type="checkbox" checked={!!config.autoSync} onChange={(e) => apply({ autoSync: e.target.checked })} />
          Reconcile automatically every 30s
        </label>
      </div>

      {conflicts.length > 0 && (
        <>
          <div className="mb-group-head"><span className="mb-h">Last reconcile · {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}</span><span className="mb-day-rule" /></div>
          {conflicts.slice(0, 12).map((c, i) => (
            <div className="mb-conflict" key={i}>
              <div className="ttl">{label(c)}</div>
              <div className="side"><b>Yours</b>{clock(c.mine?.updatedAt)}<span className="mb-pill">{c.taken === "mine" ? "kept" : "dropped"}</span></div>
              <div className="side"><b>Theirs</b>{clock(c.theirs?.updatedAt)}<span className="mb-pill">{c.taken === "theirs" ? "kept" : "dropped"}</span></div>
            </div>
          ))}
          <p className="mb-none">Both sides changed these since your last sync. The newer edit won; the older is listed so you can put it back by hand.</p>
        </>
      )}

      <div className="mb-group-head" style={{ marginTop: 8 }}><span className="mb-h">Records</span><span className="mb-day-rule" /></div>
      <div className="mb-panel">
        <p>Five CSVs joined by id. <code>entry_items.csv</code> holds the many-to-many between entries and ingredients. Every row carries <code>updated_at</code> and a <code>deleted</code> tombstone, which is what makes reconciling per record possible.</p>
        <div className="mb-files">{TABLE_NAMES.map((t) => <button key={t} onClick={() => download(t)}>↓ {TABLES[t].file}</button>)}</div>
        <button className="mb-btn danger" style={{ width: "100%", marginTop: 12 }} onClick={onWipeCache}>Clear this device's cache</button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Sample data                                                        */
/* ================================================================== */

function sampleState(base) {
  const s = emptyState(), t = now();
  const mk = (name, category, unit) => { const id = uid(); s.ingredients[id] = { id, name, category, unit, updatedAt: t, deleted: false }; return id; };
  const chicken = mk("Chicken thighs", "Meat & fish", "g"), onion = mk("Onion", "Produce", "pcs"),
    garlic = mk("Garlic", "Produce", "pcs"), rice = mk("Rice", "Pantry", "g"),
    coconut = mk("Coconut milk", "Pantry", "can"), spinach = mk("Spinach", "Produce", "g"),
    eggs = mk("Eggs", "Dairy & eggs", "pcs"), milk = mk("Milk", "Dairy & eggs", "ml"),
    bread = mk("Bread", "Bakery", "pcs"), lemons = mk("Lemons", "Produce", "pcs"),
    mint = mk("Mint", "Produce", "bunch"), corn = mk("Popcorn kernels", "Pantry", "g");

  const add = (off, kind, name, pairs) => {
    const id = uid();
    s.entries[id] = { id, date: iso(addDays(base, off)), kind, name, createdAt: t, updatedAt: t, deleted: false };
    pairs.forEach(([ingId, qty]) => { const i = uid(); s.items[i] = { id: i, entryId: id, ingId, qty, updatedAt: t, deleted: false }; });
  };
  add(0, "meal", "Coconut chicken curry", [[chicken, 600], [onion, 2], [garlic, 3], [coconut, 1], [rice, 300]]);
  add(1, "meal", "Spinach omelette", [[eggs, 6], [spinach, 150], [milk, 100]]);
  add(1, "snack", "Popcorn", [[corn, 100]]);
  add(2, "drink", "Mint lemonade", [[lemons, 4], [mint, 1]]);
  add(3, "meal", "Garlic fried rice", [[rice, 250], [garlic, 4], [eggs, 2]]);
  add(4, "meal", "Eggs on toast", [[eggs, 4], [bread, 4]]);
  s.stock[rice] = { ingId: rice, fridge: 200, bought: 0, updatedAt: t };
  s.stock[garlic] = { ingId: garlic, fridge: 5, bought: 0, updatedAt: t };
  return s;
}

/* ================================================================== */
/* App                                                                */
/* ================================================================== */

const defaultConfig = { target: "local", clientId: "", pickerApiKey: "", folderName: "Mealboard", driveFolderId: "", httpBase: "", httpToken: "", httpUser: "", httpPass: "", autoSync: true };

export default function App() {
  /* Layer 1 — the live copy. Seeded synchronously from layer 2. */
  const [state, setState] = useState(() => readCachedState(CACHE_KEY) || emptyState());
  const [config, setConfigState] = useState(() => {
    try { return { ...defaultConfig, ...JSON.parse(cache.get(CONF_KEY) || "{}") }; } catch { return defaultConfig; }
  });

  const [view, setView] = useState("calendar");
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [scope, setScope] = useState("week");
  const [open, setOpen] = useState({});
  const [sheet, setSheet] = useState(null);
  const [sync, setSync] = useState({ status: "idle", at: 0 });
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState("");

  const baseline = useRef(readCachedState(BASE_KEY) || emptyState());
  const stateRef = useRef(state); stateRef.current = state;
  const adapterRef = useRef(null);
  const busy = useRef(false);

  if (!adapterRef.current) adapterRef.current = buildAdapter(config);

  const setConfig = (next) => {
    setConfigState(next);
    cache.set(CONF_KEY, JSON.stringify(next));
    if (next.target !== config.target || next.clientId !== config.clientId || next.httpBase !== config.httpBase) {
      adapterRef.current?.disconnect?.();
      adapterRef.current = buildAdapter(next);
      setSync({ status: "idle", at: 0 });
      setConflicts([]);
      setError("");
    }
  };

  /* Layer 2 — every mutation lands in the cache immediately. */
  const mutate = useCallback((fn) => {
    setState((s) => {
      const next = fn(s);
      writeCachedState(CACHE_KEY, next);
      return next;
    });
  }, []);

  const pending = useMemo(() => pendingCount(baseline.current, state), [state, sync.at]);

  /* Layer 3 — reconcile, then commit. Never a blind overwrite. */
  const runSync = useCallback(async (silent) => {
    const ad = adapterRef.current;
    if (!ad?.readTables) {                       // local-only target
      baseline.current = clone(stateRef.current);
      writeCachedState(BASE_KEY, baseline.current);
      setSync({ status: "ok", at: now() });
      return;
    }
    if (!ad.connected() || busy.current) return;
    busy.current = true;
    setSync((s) => ({ ...s, status: "busy" }));
    try {
      const remote = tablesToState(await ad.readTables());
      const local = clone(stateRef.current);
      const r = reconcile(baseline.current, local, remote);

      if (r.fromLocal > 0 || r.conflicts.length > 0) await ad.writeTables(stateToTables(r.merged));

      baseline.current = clone(r.merged);
      writeCachedState(BASE_KEY, baseline.current);
      writeCachedState(CACHE_KEY, r.merged);
      setState(r.merged);
      setConflicts(r.conflicts);
      setSync({ status: "ok", at: now() });
      setError("");
    } catch (e) {
      setSync((s) => ({ ...s, status: "bad" }));
      if (!silent) setError(e.message || String(e));
    } finally {
      busy.current = false;
    }
  }, []);

  /* auto-reconcile */
  useEffect(() => {
    if (!config.autoSync) return;
    const t = setInterval(() => runSync(true), 30000);
    return () => clearInterval(t);
  }, [config.autoSync, runSync]);

  /* commit shortly after edits settle */
  useEffect(() => {
    if (!config.autoSync) return;
    const t = setTimeout(() => runSync(true), 2500);
    return () => clearTimeout(t);
  }, [state, config.autoSync, runSync]);

  const connect = async () => {
    setError(""); setSync((s) => ({ ...s, status: "busy" }));
    try {
      adapterRef.current = buildAdapter(config);
      await adapterRef.current.connect();
      await runSync(false);
    } catch (e) {
      setSync((s) => ({ ...s, status: "bad" }));
      setError(e.message || String(e));
    }
  };

  const disconnect = () => { adapterRef.current?.disconnect?.(); setSync({ status: "idle", at: 0 }); setConflicts([]); };

  const joinDrive = async () => {
    setError(""); setSync((s) => ({ ...s, status: "busy" }));
    try {
      const ad = buildAdapter(config);
      const picked = await ad.joinSharedFolder();
      adapterRef.current = ad;
      setConfig({ ...config, driveFolderId: picked.id, folderName: picked.name || config.folderName });
      await runSync(false);
    } catch (e) {
      setSync((s) => ({ ...s, status: "bad" }));
      setError(e.message || String(e));
    }
  };

  const leaveDriveFolder = () => {
    adapterRef.current?.disconnect?.();
    setConfig({ ...config, driveFolderId: "" });
    setSync({ status: "idle", at: 0 });
    setConflicts([]);
  };

  const wipeCache = () => {
    cache.del(CACHE_KEY); cache.del(BASE_KEY);
    baseline.current = emptyState();
    setState(emptyState());
    setSync({ status: "idle", at: 0 });
  };

  /* --- selectors --- */
  const ingredients = useMemo(() => {
    const o = {}; Object.values(state.ingredients).forEach((i) => { if (!i.deleted) o[i.id] = i; }); return o;
  }, [state.ingredients]);

  const itemsByEntry = useMemo(() => {
    const o = {};
    Object.values(state.items).forEach((it) => { if (!it.deleted && ingredients[it.ingId]) (o[it.entryId] = o[it.entryId] || []).push(it); });
    return o;
  }, [state.items, ingredients]);

  const entriesAll = useMemo(
    () => Object.values(state.entries).filter((e) => !e.deleted).map((e) => ({ ...e, items: itemsByEntry[e.id] || [] })),
    [state.entries, itemsByEntry]
  );

  const scopeEntries = useMemo(() => {
    if (scope === "all") return entriesAll;
    const a = iso(week), b = iso(addDays(week, 6));
    return entriesAll.filter((e) => e.date >= a && e.date <= b);
  }, [entriesAll, scope, week]);

  const d = useMemo(() => derive(state, scopeEntries), [state, scopeEntries]);
  const toBuyCount = Object.keys(d.need).filter((id) => d.toBuy[id] > 0 && rowState(d.bought[id], d.toBuy[id]) !== "done").length;

  /* --- mutations --- */
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const goto = (v, nodeKey, jumpWeek) => {
    if (jumpWeek) setWeek(mondayOf(jumpWeek));
    setView(v);
    if (!nodeKey) return;
    const [kind, id] = nodeKey.split(":");
    const prefix = v === "groceries" ? "groc:" : v === "fridge" ? "fridge:" : v === "ingredients" ? "ing:" : "entry:";
    setOpen((o) => ({ ...o, [prefix + id]: true }));
    setTimeout(() => {
      const el = document.getElementById("node-" + kind + "-" + id);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("mb-flash"); void el.offsetWidth; el.classList.add("mb-flash");
    }, 90);
  };

  const saveEntry = (entry, items, newIngs) => {
    const t = now();
    mutate((s) => {
      const ing = { ...s.ingredients };
      Object.values(newIngs).forEach((i) => (ing[i.id] = { ...i, updatedAt: t }));
      const rows = { ...s.items };
      Object.values(s.items).forEach((r) => {
        if (r.entryId === entry.id && !r.deleted && !items.some((i) => i.ingId === r.ingId)) rows[r.id] = { ...r, deleted: true, updatedAt: t };
      });
      items.forEach((i) => {
        const ex = Object.values(s.items).find((r) => r.entryId === entry.id && r.ingId === i.ingId);
        const id = ex ? ex.id : uid();
        rows[id] = { id, entryId: entry.id, ingId: i.ingId, qty: i.qty, updatedAt: t, deleted: false };
      });
      return { ...s, ingredients: ing, items: rows, entries: { ...s.entries, [entry.id]: { ...entry, updatedAt: t, deleted: false } } };
    });
    setSheet(null);
  };

  const deleteEntry = (id) => {
    const t = now();
    mutate((s) => {
      const rows = { ...s.items };
      Object.values(s.items).forEach((r) => { if (r.entryId === id) rows[r.id] = { ...r, deleted: true, updatedAt: t }; });
      return { ...s, items: rows, entries: { ...s.entries, [id]: { ...s.entries[id], deleted: true, updatedAt: t } } };
    });
    setSheet(null);
  };

  const setStock = (ingId, patch) => mutate((s) => {
    const prev = s.stock[ingId] || { ingId, fridge: 0, bought: 0 };
    return { ...s, stock: { ...s.stock, [ingId]: { ...prev, ...patch, ingId, updatedAt: now() } } };
  });
  const setBought = (id, v) => setStock(id, { bought: Math.max(0, v) });
  const setFridge = (id, v) => setStock(id, { fridge: Math.max(0, v) });
  const updateIng = (id, patch) => mutate((s) => ({ ...s, ingredients: { ...s.ingredients, [id]: { ...s.ingredients[id], ...patch, updatedAt: now() } } }));
  const addIng = (data) => mutate((s) => {
    const id = uid();
    return { ...s, ingredients: { ...s.ingredients, [id]: { id, name: data.name.trim(), category: data.category, unit: data.unit, updatedAt: now(), deleted: false } } };
  });
  const deleteIng = (id) => mutate((s) => ({ ...s, ingredients: { ...s.ingredients, [id]: { ...s.ingredients[id], deleted: true, updatedAt: now() } } }));
  const loadSample = () => mutate((s) => reconcile(emptyState(), s, sampleState(week)).merged);

  const scopeLabel = scope === "week" ? "This week" : "Everything planned";
  const led = sync.status === "busy" ? "busy" : sync.status === "bad" ? "bad" : pending > 0 ? "pending" : sync.status === "ok" ? "ok" : "";
  const railNote = config.target === "local"
    ? "on device" + (pending ? " · " + pending + " unsaved" : "")
    : (adapterRef.current?.connected() ? (pending ? pending + " to commit" : "in sync") : "not connected");

  const NAV = [
    { id: "calendar", ic: "🗓️", tx: "Calendar" },
    { id: "groceries", ic: "🛒", tx: "Groceries", badge: toBuyCount },
    { id: "fridge", ic: "🧊", tx: "Fridge" },
    { id: "ingredients", ic: "📋", tx: "Items" },
    { id: "storage", ic: "⚙️", tx: "Storage", badge: conflicts.length },
  ];

  return (
    <div className="mb-root">
      <style>{CSS}</style>
      <div className="mb-shell">
        <header className="mb-rail">
          <div className="mb-rail-top">
            <span className="mb-wordmark"><span aria-hidden="true">🍲</span> Mealboard</span>
            <span className="mb-rail-note"><span className={"mb-led " + led} />{railNote}</span>
          </div>
          <div className="mb-scope">
            <button className={scope === "week" ? "on" : ""} onClick={() => setScope("week")}>This week</button>
            <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>Everything</button>
          </div>
        </header>

        {view === "calendar" && (
          <CalendarView ingredients={ingredients} d={d} week={week} setWeek={setWeek} open={open} toggle={toggle} goto={goto}
            onNew={(date) => setSheet({ date })} onEdit={(e) => setSheet(e)} onSample={loadSample} hasEntries={entriesAll.length > 0} />
        )}
        {view === "groceries" && <GroceryView ingredients={ingredients} d={d} open={open} toggle={toggle} goto={goto} setBought={setBought} scopeLabel={scopeLabel} />}
        {view === "fridge" && <FridgeView ingredients={ingredients} stock={state.stock} d={d} open={open} toggle={toggle} goto={goto} setFridge={setFridge} />}
        {view === "ingredients" && <IngredientsView ingredients={ingredients} stock={state.stock} entriesAll={entriesAll} d={d} open={open} toggle={toggle} goto={goto} updateIng={updateIng} deleteIng={deleteIng} addIng={addIng} />}
        {view === "storage" && (
          <StorageView config={config} setConfig={setConfig} adapter={adapterRef.current} sync={sync} state={state}
            pending={pending} conflicts={conflicts} error={error}
            onConnect={connect} onDisconnect={disconnect} onJoinDrive={joinDrive} onLeaveDrive={leaveDriveFolder} onSync={() => runSync(false)}
            onShare={(on) => adapterRef.current.share?.(on).catch((e) => setError(e.message))}
            onWipeCache={wipeCache} />
        )}
      </div>

      <nav className="mb-nav">
        <div className="mb-nav-in">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? "on" : ""} onClick={() => setView(n.id)}>
              <span className="mb-navwrap">
                <span className="ic">{n.ic}</span>
                {n.badge > 0 && <span className="mb-badge">{n.badge}</span>}
              </span>
              <span className="tx">{n.tx}</span>
            </button>
          ))}
        </div>
      </nav>

      {sheet && <EntrySheet ingredients={ingredients} entryList={entriesAll} draft={sheet} onClose={() => setSheet(null)} onSave={saveEntry} onDelete={deleteEntry} />}
    </div>
  );
}
