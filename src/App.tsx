// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

// === Soft Beige Border Theme (全站淡土黃邊框/hover 覆蓋) ===
const __SOFT_BORDER_CSS__ = `
:root{
  --soft-border-color: #E9DFC9;              /* 淡土黃，和 bg-amber-50/40 很接近 */
  --soft-hover-bg: rgba(233,223,201,0.35);   /* 同系色系的 hover 底 */
}

/* 只改顏色，不改寬度/圓角：覆蓋所有使用 Tailwind 邊框的元素 */
.border, .border-t, .border-b, .border-l, .border-r {
  border-color: var(--soft-border-color) !important;
}

/* 把原本灰黑系 hover 底，改成淡土黃透明 */
.hover\\:bg-black\\/5:hover { background-color: var(--soft-hover-bg) !important; }
.bg-black\\/5               { background-color: var(--soft-hover-bg) !important; }

/* 假如有 dark: 邊框色（少數情境），一併柔化處理 */
.dark\\:border-zinc-700, .dark\\:border-zinc-800 {
  --tw-border-opacity: 1 !important;
  border-color: var(--soft-border-color) !important;
}
`;

// 將上面的 CSS 動態注入 <head>（載入一次即可）
if (typeof document !== 'undefined') {
  const THEME_ID = 'soft-border-theme';
  if (!document.getElementById(THEME_ID)) {
    const style = document.createElement('style');
    style.id = THEME_ID;
    style.textContent = __SOFT_BORDER_CSS__;
    document.head.appendChild(style);
  }
}

/* ===================== Types ===================== */
type LyricLine = { id: string; kor: string; zh: string };
type VocabItem = { id: string; word: string; zh?: string };
type GrammarPoint = { id: string; pattern: string; explain?: string; example?: string };
type Song = {
  id: string;
  title: string;
  releaseDate?: string;
  lyricist?: string;
  composer?: string;
  lyrics: LyricLine[];
  vocab: VocabItem[];
  grammar: GrammarPoint[];
};
type Album = { id: string; title: string; releaseDate: string; cover?: string; songs: Song[] };
type AppData = { artist: string; albums: Album[]; updatedAt: string; version: string };
type ExportFieldKey =
  | "albumTitle" | "cover" | "songTitle" | "releaseDate"
  | "lyricist" | "composer"
  | "kor" | "zh"
  | "word" | "zhWord"
  | "pattern" | "explain" | "example";

const EXPORT_FIELD_LABEL: Record<ExportFieldKey, string> = {
  albumTitle: "專輯名稱(必填)",
  cover: "專輯封面圖連結",
  songTitle: "歌曲名稱(必填)",
  releaseDate: "歌曲發行日(YYYY/M/D)",
  lyricist: "作詞",
  composer: "作曲",
  kor: "韓文歌詞",
  zh: "中文歌詞",
  word: "韓文單字",
  zhWord: "中文單字",
  pattern: "韓文文法",
  explain: "文法說明",
  example: "文法例句",
};

function ExportModal({
  open,
  onClose,
  defaultSelected,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  defaultSelected: ExportFieldKey[];
  onExport: (cols: ExportFieldKey[]) => void;
}) {
  const [sel, setSel] = useState<Set<ExportFieldKey>>(new Set(defaultSelected));
  const must = new Set<ExportFieldKey>(["albumTitle","songTitle"]);

  useEffect(()=>{ if (open) setSel(new Set(defaultSelected)); }, [open, defaultSelected]);

  function toggle(k: ExportFieldKey) {
    if (must.has(k)) return;
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function selectAll(v: boolean) {
    const all = Object.keys(EXPORT_FIELD_LABEL) as ExportFieldKey[];
    const next = new Set<ExportFieldKey>(["albumTitle","songTitle"]);
    if (v) for (const k of all) next.add(k);
    setSel(next);
  }

  return (
    <Modal open={open} onClose={onClose} title="匯出（自訂欄位，XLSX）">
      <div className="space-y-3">
        <div className="text-sm text-zinc-600">必含欄位：專輯名稱、歌曲名稱。其餘可自由勾選。</div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(EXPORT_FIELD_LABEL) as ExportFieldKey[]).map(k => (
            <label key={k} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-sm ${sel.has(k)?'bg-black/5':''}`}>
              <input
                type="checkbox"
                checked={sel.has(k)}
                disabled={k==="albumTitle" || k==="songTitle"}
                onChange={()=>toggle(k)}
              />
              {EXPORT_FIELD_LABEL[k]}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-zinc-600">快速：</div>
          <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>selectAll(true)}>全選</button>
          <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>selectAll(false)}>只留必填</button>
        </div>

        <div className="flex justify-end gap-2">
          <ToolbarButton onClick={onClose}>取消</ToolbarButton>
          <ToolbarButton onClick={()=>onExport(Array.from(sel))}>匯出 XLSX</ToolbarButton>
        </div>
      </div>
    </Modal>
  );
}


/* ===================== Helpers ===================== */
const HAMBURGER = "\u2630"; // ☰
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);


function alignLyrics(korRaw: string, zhRaw: string) {
  const kor = (korRaw || "").split(/\r?\n/);
  const zh = (zhRaw || "").split(/\r?\n/);
  const max = Math.max(kor.length, zh.length);
  const out: { kor: string; zh: string }[] = [];
  for (let i = 0; i < max; i++) out.push({ kor: (kor[i] || "").trim(), zh: (zh[i] || "").trim() });
  return out;
}
function trimLyricsTail<T extends { kor: string; zh: string }>(rows: T[]): T[] {
  let last = rows.length - 1;
  while (last >= 0 && rows[last].kor.trim() === "" && rows[last].zh.trim() === "") last--;
  return rows.slice(0, last + 1);
}
const isHangul = (s: string) => /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(s);
function tokenizeKorean(text: string) {
  return (text || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/)
    .filter(Boolean)
    .filter(isHangul);
}

/** 簡易 CSV 解析器（支援引號轉義） */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0, field = "", row: string[] = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      } else { field += ch; i++; continue; }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { row.push(field); field = ""; i++; continue; }
      if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = ""; i++; continue;
      }
      field += ch; i++;
    }
  }
  row.push(field); rows.push(row);
  while (rows.length && rows[rows.length - 1].every(c => c === "")) rows.pop();
  return rows;
}
function fileToDataURL(file: File): Promise<string> {
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result||"")); fr.readAsDataURL(file); });
}

/* ===== 匯入工具（只用專輯+歌名；寬鬆表頭、支援 TSV/UTF-16） ===== */
const BOM = "\uFEFF";
const stripCell = (s: string) => (s || "").replace(BOM, "").trim();
const normalizeHeader = (s: string) =>
  (s || "")
    .replace(BOM, "")
    .toLowerCase()
    .replace(/optional|可選|選填/g, "")
    .replace(/[\s_\-（）()]/g, "");
function idxOfAny(H: string[], aliases: string[]) {
  for (const a of aliases) { const i = H.indexOf(a); if (i >= 0) return i; }
  for (const a of aliases) { const i = H.findIndex(h => h.startsWith(a)); if (i >= 0) return i; }
  for (const a of aliases) { const i = H.findIndex(h => h.includes(a)); if (i >= 0) return i; }
  return -1;
}

/* ===================== Seed ===================== */
const SEED: AppData = {
  artist: "DAY6",
  version: "3.2.0",
  updatedAt: new Date().toISOString(),
  albums: [
    {
      id: uid(),
      title: "The Day",
      releaseDate: "2015-09-07",
      cover: "",
      songs: [
        { id: uid(), title: "Congratulations", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [] },
        { id: uid(), title: "Freely", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [] },
      ],
    },
  ],
};

/* ===================== Small UI atoms ===================== */
function TabButton({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black text-white' : 'border hover:bg-black/5'}`}>{children}</button>
  );
}
function ToolbarButton({ children, onClick, type = 'button', className = '' }: { children: React.ReactNode; onClick?: () => void; type?: 'button'|'submit'|'reset'; className?: string }) {
  return <button type={type} onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm hover:bg-black/5 active:scale-[0.99] ${className}`}>{children}</button>;
}
function DropMenu({ label, items }: { label: string; items: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (!ref.current) return; if (!ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDocClick); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <div ref={ref} className="relative">
      <ToolbarButton onClick={() => setOpen(o => !o)}>{label}</ToolbarButton>
      {open && (
        <div className="absolute right-0 z-[9999] mt-1 w-64 overflow-hidden rounded-lg border bg-white py-1 text-sm shadow-xl">
          {items}
        </div>
      )}
    </div>
  );
}
function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-[9600] w-[min(740px,92vw)] rounded-2xl border bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between"><div className="text-lg font-semibold">{title}</div><ToolbarButton onClick={onClose}>關閉</ToolbarButton></div>
        {children}
      </div>
    </div>
  );
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v:boolean)=>void }) {
  return (
    <button
      type="button"
      onClick={()=>onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border ${checked ? 'bg-black' : 'bg-white'}`}
      aria-pressed={checked}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

/* ===================== Desktop Sidebar ===================== */
function DesktopSidebar({
  data, selected, onSelect,
  sortMode, onToggleSort,
  editingAlbumId, onToggleAlbumEdit,
  onUpdateAlbum, onUploadAlbumCover,
  onReorderAlbum, onReorderSong, onDeleteSong,
  onDeleteAlbum,
  collapsed, onToggleCollapse
}: {
  data: AppData;
  selected: { albumId: string; songId: string } | null;
  onSelect: (albumId: string, songId: string) => void;
  sortMode: boolean; onToggleSort: () => void;
  editingAlbumId: string | null; onToggleAlbumEdit: (id: string | null)=>void;
  onUpdateAlbum: (albumId: string, patch: Partial<Album>)=>void;
  onUploadAlbumCover: (albumId: string, file: File)=>void;
  onReorderAlbum: (from: number, to: number) => void;
  onReorderSong: (albumId: string, from: number, to: number) => void;
  onDeleteSong: (albumId: string, songId: string) => void;
  onDeleteAlbum: (albumId: string) => void;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (albumId: string)=>void;
}) {
  return (
    <aside className="w-[317px] shrink-0 overflow-y-auto border-r p-3 hidden md:block">
      <div className="w-[284px]">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">專輯 / 歌曲</div>
          <button
            onClick={()=>{ if (editingAlbumId) onToggleAlbumEdit(null); onToggleSort(); }}
            className={`rounded-lg border px-2 py-1 text-xs hover:bg-black/5 ${sortMode ? 'bg-black/5' : ''}`}
            title="切換排序模式（上下移動）"
          >
            {sortMode ? '完成' : '排序'}
          </button>
        </div>

        <div className="space-y-3">
          {data.albums.map((a, albumIdx) => {
            const editing = editingAlbumId === a.id;
            const atTop = albumIdx === 0;
            const atBottom = albumIdx === data.albums.length - 1;
            const isCollapsed = !!collapsed[a.id];

            return (
              <div key={a.id} className="w-[284px] overflow-hidden rounded-xl border bg-white/70 p-2">
                {/* Header */}
                {!editing ? (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        onClick={()=>onToggleCollapse(a.id)}
                        className="shrink-0 rounded-md border px-1.5 py-1 text-xs hover:bg-black/5"
                        aria-label={isCollapsed ? '展開' : '收合'}
                        title={isCollapsed ? '展開' : '收合'}
                      >{isCollapsed ? "▶" : "▼"}</button>

                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white/60">
                        {a.cover ? <img src={a.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">無封面</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.title}</div>
                        <div className="truncate text-xs text-zinc-500">{normalizeDateSlash(a.releaseDate)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {sortMode ? (
                        <>
                          <button
                            className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40"
                            onClick={()=>onReorderAlbum(albumIdx, albumIdx-1)}
                            disabled={atTop}
                            title="上移專輯"
                          >▲</button>
                          <button
                            className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40"
                            onClick={()=>onReorderAlbum(albumIdx, albumIdx+1)}
                            disabled={atBottom}
                            title="下移專輯"
                          >▼</button>
                        </>
                      ) : (
                        <button
                          onClick={()=>onToggleAlbumEdit(a.id)}
                          className="shrink-0 rounded-lg border px-2 py-1 text-xs hover:bg-black/5"
                          title="編輯專輯"
                        >✎</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mb-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          onClick={()=>onToggleCollapse(a.id)}
                          className="shrink-0 rounded-md border px-1.5 py-1 text-xs hover:bg-black/5"
                          title="收合/展開"
                        >{collapsed[a.id] ? "▶" : "▼"}</button>
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white/60">
                          {a.cover ? <img src={a.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">無封面</div>}
                        </div>
                        <div className="min-w-0">
                          <input
                            value={a.title}
                            onChange={e=>onUpdateAlbum(a.id,{title:e.target.value})}
                            className="w-full truncate rounded-md border px-2 py-1 text-sm font-medium"
                          />
                          <input
                            type="date"
                            value={a.releaseDate}
                            onChange={e=>onUpdateAlbum(a.id,{releaseDate:e.target.value})}
                            className="mt-1 w-full truncate rounded-md border px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                      <button
                        onClick={()=>onToggleAlbumEdit(null)}
                        className="shrink-0 rounded-lg border px-2 py-1 text-xs hover:bg-black/5"
                        title="完成編輯"
                      >完成</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-lg border px-2 py-1 text-xs hover:bg-black/5">
                        上傳封面
                        <input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if (f) onUploadAlbumCover(a.id, f); }} />
                      </label>
                      {a.cover && <button onClick={()=>onUpdateAlbum(a.id,{cover:""})} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5">清除封面</button>}
                      <button
                        onClick={()=>{ if (confirm(`確定要刪除專輯「${a.title}」？此操作將刪除底下所有歌曲。`)) onDeleteAlbum(a.id); }}
                        className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-black/5"
                      >刪除專輯</button>
                    </div>
                  </div>
                )}

                {/* Song list（可收合） */}
                {!isCollapsed && (
                  <ul className="space-y-1">
                    {a.songs.map((s, songIdx) => {
                      const sTop = songIdx === 0;
                      const sBottom = songIdx === a.songs.length - 1;

                      return (
                        <li key={s.id}>
                          <div className="flex w-full items-center justify-between gap-2">
                            <button
                              onClick={() => onSelect(a.id, s.id)}
                              className={`min-w-0 flex-1 rounded-lg px-2 py-1 text-left hover:bg-black/5 ${
                                selected?.songId === s.id ? "bg-black/5 font-medium" : ""
                              }`}
                              title="開啟歌曲"
                            >
                              <div className="truncate">{s.title}</div>
                            </button>

                            <div className="flex items-center gap-1">
                              {(sortMode || editing) && (
                                <>
                                  <button
                                    className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40"
                                    onClick={() => onReorderSong(a.id, songIdx, songIdx - 1)}
                                    disabled={sTop}
                                    title="上移歌曲"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40"
                                    onClick={() => onReorderSong(a.id, songIdx, songIdx + 1)}
                                    disabled={sBottom}
                                    title="下移歌曲"
                                  >
                                    ▼
                                  </button>
                                </>
                              )}
                              {editing && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSong(a.id, s.id);
                                  }}
                                  className="shrink-0 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-black/5"
                                  title="刪除此歌曲"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        </li>


                      );
                    })}
                    {a.songs.length===0 && <li className="px-2 py-1 text-xs text-zinc-500">（此專輯尚無歌曲）</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

/* ===================== Mobile Drawer（RWD） ===================== */
function SideDrawer({ open, onClose, data, selected, onSelect, onOpenAddAlbum, onOpenAddSong }: {
  open: boolean; onClose: () => void;
  data: AppData;
  selected: { albumId: string; songId: string } | null;
  onSelect: (albumId: string, songId: string) => void;
  onOpenAddAlbum: () => void; onOpenAddSong: (albumId: string) => void;
}) {
  return (
    <div className={`fixed inset-0 z-[9000] md:hidden ${open ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div className={`absolute left-0 top-0 h-full w-[85vw] max-w-[320px] transform bg-white shadow-2xl transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div className="font-semibold">專輯 / 歌曲</div>
          <div className="flex gap-2">
            <button onClick={onOpenAddAlbum} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5">+ 專輯</button>
            <button className="rounded-lg border px-2 py-1 text-sm hover:bg-black/5" onClick={onClose}>關閉</button>
          </div>
        </div>
        <div className="h-[calc(100%-49px)] space-y-3 overflow-auto p-3">
          {data.albums.map(a => (
            <div key={a.id} className="rounded-xl border p-2">
              <div className="mb-1 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.title}</div>
                  <div className="truncate text-xs text-zinc-500">{normalizeDateSlash(a.releaseDate)}</div>
                </div>
                <button onClick={()=>onOpenAddSong(a.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5">+ 歌曲</button>
              </div>
              <ul className="space-y-1">
                {a.songs.map(s => (
                  <li key={s.id}>
                    <button onClick={()=>{onSelect(a.id, s.id); onClose();}} className={`w-full rounded-lg px-2 py-1 text-left hover:bg-black/5 ${selected?.songId===s.id ? 'bg-black/5 font-medium' : ''}`}>
                      <div className="truncate">{s.title}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================== Panels ===================== */
function LyricsPanel({ song, onUpdate, editMode, setEditMode }: { song: Song; onUpdate: (patch: Partial<Song>)=>void; editMode: boolean; setEditMode: (v:boolean)=>void; }) {
  const korFromState = useMemo(()=> song.lyrics.map(l=>l.kor).join("\n"), [song.lyrics]);
  const zhFromState  = useMemo(()=> song.lyrics.map(l=>l.zh ).join("\n"), [song.lyrics]);
  const [korDraft, setKorDraft] = useState(korFromState);
  const [zhDraft , setZhDraft ] = useState(zhFromState);
  useEffect(()=>{ if (editMode) { setKorDraft(korFromState); setZhDraft(zhFromState); } }, [editMode, korFromState, zhFromState]);

  const previewKor = editMode ? korDraft : korFromState;
  const previewZh  = editMode ? zhDraft  : zhFromState;
  const aligned = useMemo(()=> alignLyrics(previewKor, previewZh), [previewKor, previewZh]);

  function save() {
    const rows = trimLyricsTail(alignLyrics(korDraft, zhDraft));
    const normalized = rows.map(r => ({ id: uid(), kor: r.kor, zh: r.zh }));
    onUpdate({ lyrics: normalized });
    setEditMode(false);
  }
  function cancel() {
    setKorDraft(korFromState);
    setZhDraft(zhFromState);
    setEditMode(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-white/70 p-4">
      {/* 標題列（這段以前少了 Fragment/多了錯關閉，已修正） */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">歌詞</div>
        <div className="flex items-center gap-2 text-sm">
          {!editMode ? (
            <>
              <span>編輯模式</span>
              <Toggle checked={editMode} onChange={setEditMode} />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <ToolbarButton onClick={save}>儲存</ToolbarButton>
              <ToolbarButton onClick={cancel}>取消</ToolbarButton>
            </div>
          )}
        </div>
      </div>

      {/* 編輯表單 */}
      {editMode && (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">韓文歌詞（每行一句）</div>
            <textarea
              value={korDraft}
              onChange={e=>setKorDraft(e.target.value)}
              className="h-48 w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">中文歌詞（每行一句）</div>
            <textarea
              value={zhDraft}
              onChange={e=>setZhDraft(e.target.value)}
              className="h-48 w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>
      )}

      {/* 對照預覽 */}
      <div className="mt-4 flex-1 overflow-auto">
        <div className="mb-2 text-sm font-medium">對照預覽</div>
        <div className="rounded-xl border bg-white/60">
          {aligned.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 border-b px-3 py-2 last:border-none">
              <div className="col-span-12 md:col-span-6 whitespace-pre-wrap">{l.kor || <span className="text-zinc-400">(空)</span>}</div>
              <div className="col-span-12 md:col-span-6 whitespace-pre-wrap">{l.zh  || <span className="text-zinc-400">(空)</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function VocabPanel({ song, onUpdate }: { song: Song; onUpdate: (patch: Partial<Song>)=>void }) {
  const [edit, setEdit] = useState(false);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<VocabItem[]>(song.vocab);
  const [newWord, setNewWord] = useState("");
  const [newZh, setNewZh] = useState("");
  useEffect(()=>{ setDraft(song.vocab); setNewWord(""); setNewZh(""); }, [song.id, song.vocab]);
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase(); if (!q) return draft;
    return draft.filter(v => (v.word||"").toLowerCase().includes(q) || (v.zh||"").toLowerCase().includes(q));
  }, [draft, filter]);
  function addFromInputs() {
    const w = newWord.trim(); const z = newZh.trim();
    if (!w && !z) return;
    setDraft(d => [{ id: uid(), word: w, zh: z }, ...d]);
    setNewWord(""); setNewZh(""); setEdit(true);
  }
  function up(id: string, patch: Partial<VocabItem>) { setDraft(d => d.map(v => v.id===id ? { ...v, ...patch } : v)); }
  function del(id: string) { setDraft(d => d.filter(v => v.id!==id)); }
  function save() { onUpdate({ vocab: draft }); setEdit(false); }

  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">單字表（含中文）</div>
        <div className="flex flex-wrap items-center gap-2">
          {edit ? (
            <>
              <ToolbarButton onClick={save}>儲存</ToolbarButton>
              <ToolbarButton onClick={()=>{ setDraft(song.vocab); setEdit(false); }}>取消</ToolbarButton>
            </>
          ) : (
            <ToolbarButton onClick={()=>setEdit(true)}>編輯</ToolbarButton>
          )}
          <input placeholder="過濾…" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border px-2 py-1 text-sm w-[140px] md:w-[180px]"/>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-12 gap-2">
        <input value={newWord} onChange={e=>setNewWord(e.target.value)} placeholder="韓文" className="col-span-6 md:col-span-5 rounded-lg border px-2 py-1"/>
        <input value={newZh} onChange={e=>setNewZh(e.target.value)} placeholder="中文" className="col-span-6 md:col-span-5 rounded-lg border px-2 py-1"/>
        <ToolbarButton onClick={addFromInputs} className="col-span-12 md:col-span-2 text-center">+ 新增</ToolbarButton>
      </div>

      <div className="overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-white/70">
            <tr className="border-b text-left">
              <th className="w-1/2 px-3 py-2">韓文</th>
              <th className="w-1/2 px-3 py-2">中文</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map(v => (
              <tr key={v.id} className="border-b">
                <td className="px-3 py-2">
                  {edit ? <input value={v.word} onChange={e=>up(v.id,{word:e.target.value})} className="w-full bg-transparent outline-none"/> : <span>{v.word}</span>}
                </td>
                <td className="px-3 py-2">
                  {edit ? <input value={v.zh||""} onChange={e=>up(v.id,{zh:e.target.value})} className="w-full bg-transparent outline-none"/> : <span>{v.zh}</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {edit ? <button onClick={()=>del(v.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5">刪除</button> : <span className="text-xs text-zinc-400">—</span>}
                </td>
              </tr>
            ))}
            {list.length===0 && (<tr><td colSpan={3} className="px-3 py-6 text-center text-zinc-500">{edit?'尚未新增單字，請使用上方輸入框':'（沒有單字）'}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrammarPanel({ song, onUpdate }: { song: Song; onUpdate: (patch: Partial<Song>)=>void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<GrammarPoint[]>(song.grammar);
  useEffect(()=>{ setDraft(song.grammar); }, [song.id, song.grammar]);
  function add() { setDraft(d => [{ id: uid(), pattern: "", explain: "", example: "" }, ...d]); }
  function up(id: string, patch: Partial<GrammarPoint>) { setDraft(d => d.map(g => g.id===id ? { ...g, ...patch } : g)); }
  function del(id: string) { setDraft(d => d.filter(g => g.id!==id)); }
  function save() { onUpdate({ grammar: draft }); setEdit(false); }

  return (
    <div className="rounded-2xl border bg-white/70 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">文法點</div>
        <div className="flex items-center gap-2">
          {edit ? (
            <>
              <ToolbarButton onClick={save}>儲存</ToolbarButton>
              <ToolbarButton onClick={()=>{ setDraft(song.grammar); setEdit(false); }}>取消</ToolbarButton>
              <ToolbarButton onClick={add}>+ 新增文法</ToolbarButton>
            </>
          ) : (
            <ToolbarButton onClick={()=>setEdit(true)}>編輯</ToolbarButton>
          )}
        </div>
      </div>

      {!edit ? (
        <div className="space-y-3">
          {draft.map(g => (
            <div key={g.id} className="rounded-xl border p-3">
              <div className="font-medium">{g.pattern || <span className="text-zinc-400">（未填）</span>}</div>
              {g.explain && <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{g.explain}</div>}
              {g.example && <div className="mt-1 rounded-md bg-black/5 px-2 py-1 text-sm"><span className="text-zinc-500">例句：</span>{g.example}</div>}
            </div>
          ))}
          {draft.length===0 && <div className="py-6 text-center text-sm text-zinc-500">尚未新增文法點</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {draft.map(g => (
            <div key={g.id} className="rounded-xl border p-3">
              <div className="grid grid-cols-12 gap-2">
                <input value={g.pattern} onChange={e=>up(g.id,{pattern:e.target.value})} placeholder="文法（如：-(으)니까）" className="col-span-12 md:col-span-4 rounded-lg border px-2 py-1"/>
                <textarea value={g.explain||""} onChange={e=>up(g.id,{explain:e.target.value})} placeholder="說明" className="col-span-12 md:col-span-8 min-h-[60px] rounded-lg border px-2 py-1"/>
                <input value={g.example||""} onChange={e=>up(g.id,{example:e.target.value})} placeholder="例句（可選）" className="col-span-12 rounded-lg border px-2 py-1"/>
              </div>
              <div className="mt-2 text-right"><button onClick={()=>del(g.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5">刪除</button></div>
            </div>
          ))}
          {draft.length===0 && <div className="py-6 text-center text-sm text-zinc-500">尚未新增文法點</div>}
        </div>
      )}
    </div>
  );
}

function FlashcardPanel({ song, onUpdate }: { song: Song; onUpdate: (patch: Partial<Song>)=>void }) {
  const vocab = song.vocab;
  const [queue, setQueue] = useState<number[]>(() => vocab.map((_, i) => i));
  const [meta, setMeta] = useState(() => vocab.map(() => ({ firstSeen: false } as { firstSeen: boolean })));
  const [reveal, setReveal] = useState(false);
  useEffect(()=>{ setQueue(vocab.map((_,i)=>i)); setMeta(vocab.map(()=>({firstSeen:false}))); setReveal(false); }, [vocab.map(v=>v.id).join(',')]);
  const total = vocab.length; const currentIdx = queue[0] ?? null; const current = currentIdx != null ? vocab[currentIdx] : null; const firstSeenCount = meta.filter(m => m.firstSeen).length;
  function grade(level: 'again' | 'good' | 'easy') {
    if (currentIdx == null) return;
    setMeta(m => { const next = [...m]; if (!next[currentIdx].firstSeen) next[currentIdx].firstSeen = true; return next; });
    setQueue(q => { const rest = q.slice(1); if (level === 'again') { const insertAt = Math.min(2, rest.length); return [...rest.slice(0, insertAt), currentIdx, ...rest.slice(insertAt)]; } if (level === 'good') return [...rest, currentIdx]; return rest; });
  }
  if (total === 0) return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center">
      <div className="mb-2 text-sm">尚無單字</div>
      <ToolbarButton onClick={()=>{
        const toks = Array.from(new Set(tokenizeKorean(song.lyrics.map(l=>l.kor).join('\n'))));
        onUpdate({ vocab: toks.map(t => ({ id: uid(), word: t, zh: '' })) });
      }}>從歌詞自動擷取</ToolbarButton>
    </div>
  );
  if (current == null) return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center">
      <div className="mb-2 text-sm">本輪完成！</div>
      <ToolbarButton onClick={() => { setQueue(vocab.map((_, i) => i)); setMeta(vocab.map(() => ({ firstSeen: false }))); }}>重新開始</ToolbarButton>
    </div>
  );
  return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center">
      <div className="mb-2 text-xs text-zinc-500">單字卡　已看過：{firstSeenCount}/{total}</div>
      <div className="text-2xl font-bold">{current.word}</div>
      <div className="mt-2 text-lg text-zinc-700">{reveal ? (current.zh||'（尚未填中文）') : '———'}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2"><ToolbarButton onClick={()=>setReveal(r=>!r)}>{reveal?'隱藏':'顯示解答'}</ToolbarButton></div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button onClick={()=>grade('again')} className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5">不熟</button>
        <button onClick={()=>grade('good')}  className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5">一般</button>
        <button onClick={()=>grade('easy')}  className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5">很熟</button>
      </div>
    </div>
  );
}

/* Inline editors */
function SongTitleEditable({
  title,
  releaseDate,
  onSave,
}: {
  title: string;
  releaseDate?: string;
  onSave: (t: string, date?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [valTitle, setValTitle] = useState(title);
  const [valDate, setValDate] = useState(releaseDate || "");

  useEffect(() => { setValTitle(title); }, [title]);
  useEffect(() => { setValDate(releaseDate || ""); }, [releaseDate]);

  if (!editing) {
    return (
      <div className="text-2xl font-bold flex items-center gap-2">
        <span className="truncate">{title}</span>
        <button
          className="rounded-md border px-2 py-1 text-xs hover:bg-black/5"
          onClick={() => setEditing(true)}
          title="編輯歌名與日期"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 歌名 */}
      <input
        value={valTitle}
        onChange={(e) => setValTitle(e.target.value)}
        placeholder="歌曲名稱"
        className="w-56 text-2xl font-bold rounded-md border px-2 py-1"
        autoFocus
      />
      {/* 日期（用文字輸入以支援 2015/9/7） */}
      <input
        value={valDate}
        onChange={(e) => setValDate(e.target.value)}
        placeholder="發行日 例如 2015/9/7"
        className="w-44 rounded-md border px-2 py-1 text-sm"
        inputMode="numeric"
      />
      <button
        className="rounded-md border px-2 py-1 text-xs hover:bg-black/5"
        onClick={() => {
          const t = (valTitle || "").trim();
          if (!t) { alert("歌名不可空白"); return; }
          const d = normalizeDateSlash(valDate);
          onSave(t, d || undefined);
          setEditing(false);
        }}
      >
        儲存
      </button>
      <button
        className="rounded-md border px-2 py-1 text-xs hover:bg-black/5"
        onClick={() => { setValTitle(title); setValDate(releaseDate || ""); setEditing(false); }}
      >
        取消
      </button>
    </div>
  );
}


function MetaEditable({ label, value, placeholder, onSave }: { label: string; value?: string; placeholder?: string; onSave: (v: string)=>void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  useEffect(()=>{ setVal(value || ""); }, [value]);
  if (!editing) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <span className="text-zinc-500">{label}：</span>
        <span className="min-w-[24px]">{value || <span className="text-zinc-400">（未填）</span>}</span>
        <button className="rounded-md border px-1 py-0.5 text-[11px] hover:bg-black/5" onClick={()=>setEditing(true)} title={`編輯${label}`}>✎</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-zinc-500">{label}：</span>
      <input value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder} className="rounded-md border px-2 py-1 text-sm" autoFocus />
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ onSave(val.trim()); setEditing(false); }}>儲存</button>
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ setVal(value||""); setEditing(false); }}>取消</button>
    </div>
  );
}

/* ===================== App ===================== */
export default function App() {
  // data & persistence
  const [data, setData] = useState<AppData>(() => {
    try { const saved = localStorage.getItem('day6_lyrics_app_data_v3'); if (saved) return JSON.parse(saved) as AppData; } catch {}
    return SEED;
  });
  useEffect(() => { try { localStorage.setItem('day6_lyrics_app_data_v3', JSON.stringify({ ...data, updatedAt: new Date().toISOString() })); } catch {} }, [data]);

  // 專輯收合狀態（持久化）
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem('lyrics_album_collapsed'); if (raw) return JSON.parse(raw); } catch {}
    return {};
  });
  useEffect(()=>{ try { localStorage.setItem('lyrics_album_collapsed', JSON.stringify(collapsed)); } catch {} }, [collapsed]);

  // modes
  const [sortMode, setSortMode] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string|null>(null);

  // reorder helpers
  function arrayMove<T>(arr: T[], from: number, to: number) {
    const next = [...arr];
    if (to < 0 || to >= next.length || from === to) return next;
    const item = next.splice(from, 1)[0];
    next.splice(to, 0, item);
    return next;
  }
  function reorderAlbum(fromIdx: number, toIdx: number) {
    setData(d => ({ ...d, albums: arrayMove(d.albums, fromIdx, toIdx) }));
  }
  function reorderSong(albumId: string, fromIdx: number, toIdx: number) {
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId); if (ai < 0) return d;
      const album = d.albums[ai];
      const nextSongs = arrayMove(album.songs, fromIdx, toIdx);
      const nextAlbums = [...d.albums]; nextAlbums[ai] = { ...album, songs: nextSongs };
      return { ...d, albums: nextAlbums };
    });
  }
  function deleteSong(albumId: string, songId: string) {
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId); if (ai < 0) return d;
      const album = d.albums[ai];
      const nextAlbums = [...d.albums]; nextAlbums[ai] = { ...album, songs: album.songs.filter(s => s.id !== songId) };
      return { ...d, albums: nextAlbums };
    });
    if (selected?.albumId === albumId && selected?.songId === songId) setSelected(null);
  }
  function deleteAlbum(albumId: string) {
    setData(d => ({ ...d, albums: d.albums.filter(a => a.id !== albumId) }));
    setSelected(sel => (sel?.albumId === albumId ? null : sel));
    setEditingAlbumId(id => (id === albumId ? null : id));
  }

  // album update
  function updateAlbum(albumId: string, patch: Partial<Album>) { setData(d => ({ ...d, albums: d.albums.map(a => a.id===albumId ? { ...a, ...patch } : a) })); }
  async function uploadAlbumCover(albumId: string, file: File) { const dataUrl = await fileToDataURL(file); updateAlbum(albumId, { cover: dataUrl }); }

  // selection & current
  const [selected, setSelected] = useState<{ albumId: string; songId: string } | null>(() => {
    const a0 = SEED.albums[0]; const s0 = a0?.songs[0]; return a0 && s0 ? { albumId: a0.id, songId: s0.id } : null;
  });
  const current = useMemo(() => {
    if (!selected) return null as { album: Album; song: Song } | null;
    const album = data.albums.find(a => a.id === selected.albumId); if (!album) return null;
    const song = album.songs.find(s => s.id === selected.songId); if (!song) return null;
    return { album, song };
  }, [data, selected]);

  // UI & RWD
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [tab, setTab] = useState<'lyrics' | 'vocab' | 'flash' | 'grammar'>('lyrics');
  const [editMode, setEditMode] = useState(false); // 歌詞編輯預設關閉
  const [query, setQuery] = useState("");
  useEffect(() => {
    try { const side = localStorage.getItem('lyrics_sidebar'); if (side === 'closed') setSidebarVisible(false); } catch {}
  }, []);
  const toggleSidebar = () => {
    setSidebarVisible(v => { const next = !v; try { localStorage.setItem('lyrics_sidebar', next ? 'open' : 'closed'); } catch {} return next; });
  };
  const toggleCollapse = (albumId: string) => setCollapsed(c => ({ ...c, [albumId]: !c[albumId] }));

  // CRUD helpers
  function addAlbumImpl(title: string, releaseDate: string, cover?: string) {
    const album: Album = { id: uid(), title: title.trim() || "(未命名)", releaseDate: releaseDate || today(), cover: cover || "", songs: [] };
    setData(d => ({ ...d, albums: [...d.albums, album] }));
  }
  function addSongImpl(payload: { albumId: string; title: string; releaseDate?: string; kor: string; zh: string; lyricist?: string; composer?: string }) {
    const { albumId, title, releaseDate = '' , kor, zh, lyricist = "", composer = "" } = payload;
    const lyrics: LyricLine[] = alignLyrics(kor, zh).map(l => ({ id: uid(), kor: l.kor, zh: l.zh }));
    const song: Song = { id: uid(), title: title.trim() || "(未命名)", releaseDate, lyricist, composer, lyrics, vocab: [], grammar: [] };
    setData(d => ({ ...d, albums: d.albums.map(a => a.id===albumId ? { ...a, songs: [...a.songs, song] } : a) }));
    setSelected({ albumId, songId: song.id });
  }
  function updateSong(songId: string, patch: Partial<Song>) {
    setData(d => ({ ...d, albums: d.albums.map(a => ({ ...a, songs: a.songs.map(s => s.id===songId ? { ...s, ...patch } : s) })) }));
  }

  // ===== 自訂欄位匯出（只輸出 XLSX） =====
const [exportOpen, setExportOpen] = useState(false);

const DEFAULT_EXPORT_COLS: ExportFieldKey[] = [
  "albumTitle","songTitle","releaseDate","lyricist","composer",
  "kor","zh","word","zhWord","pattern","explain","example"
];

async function exportCustom(cols: ExportFieldKey[]) {
  const header = cols.map(k => EXPORT_FIELD_LABEL[k]);
  const aoa: (string | number)[][] = [header];

  for (const a of data.albums) {
    for (const s of a.songs) {
      // 歌詞
      for (const l of s.lyrics) {
        const row = {
          albumTitle: a.title, cover: a.cover || "", songTitle: s.title,
          releaseDate: normalizeDateSlash(s.releaseDate || a.releaseDate || ""),
          lyricist: s.lyricist || "", composer: s.composer || "",
          kor: l.kor || "", zh: l.zh || "",
          word: "", zhWord: "", pattern: "", explain: "", example: "",
        } as Record<ExportFieldKey,string>;
        aoa.push(cols.map(k => row[k]));
      }
      // 單字
      for (const v of s.vocab) {
        const row = {
          albumTitle: a.title, cover: a.cover || "", songTitle: s.title,
          releaseDate: normalizeDateSlash(s.releaseDate || a.releaseDate || ""),
          lyricist: s.lyricist || "", composer: s.composer || "",
          kor: "", zh: "", word: v.word || "", zhWord: v.zh || "",
          pattern: "", explain: "", example: "",
        } as Record<ExportFieldKey,string>;
        aoa.push(cols.map(k => row[k]));
      }
      // 文法
      for (const g of s.grammar) {
        const row = {
          albumTitle: a.title, cover: a.cover || "", songTitle: s.title,
          releaseDate: normalizeDateSlash(s.releaseDate || a.releaseDate || ""),
          lyricist: s.lyricist || "", composer: s.composer || "",
          kor: "", zh: "", word: "", zhWord: "",
          pattern: g.pattern || "", explain: g.explain || "", example: g.example || "",
        } as Record<ExportFieldKey,string>;
        aoa.push(cols.map(k => row[k]));
      }

      if (s.lyrics.length===0 && s.vocab.length===0 && s.grammar.length===0) {
        const row = {
          albumTitle: a.title, cover: a.cover || "", songTitle: s.title,
          releaseDate: normalizeDateSlash(s.releaseDate || a.releaseDate || ""),
          lyricist: s.lyricist || "", composer: s.composer || "",
          kor: "", zh: "", word: "", zhWord: "", pattern: "", explain: "", example: "",
        } as Record<ExportFieldKey,string>;
        aoa.push(cols.map(k => row[k]));
      }
    }
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "export");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.xlsx";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setExportOpen(false);
}



 
      // 範本（只含表頭）：中文欄位、日期格式 YYYY/M/D、兩個欄位加(必填)
      async function downloadTemplate() {
        const header = [
          "專輯名稱(必填)",
          "專輯封面圖連結",
          "歌曲名稱(必填)",
          "歌曲發行日(YYYY/M/D)",
          "作詞",
          "作曲",
          "韓文歌詞",
          "中文歌詞",
          "韓文單字",
          "中文單字",
          "韓文文法",
          "文法說明",
          "文法例句",
        ];

        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([header]);
        XLSX.utils.book_append_sheet(wb, ws, "template");

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob(
          [wbout],
          { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "統一範本.xlsx";
        a.click();
        URL.revokeObjectURL(url);
      }



  /* ===== 匯入（支援單一表格；UTF-8/UTF-16；TSV/CSV） ===== */
function importCSV(file: File) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const buf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);

      let stat = { lyric: 0, vocab: 0, grammar: 0, skipped: 0 };

      function toYMD(d: Date) {
        const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
        return `${y}/${m}/${day}`;
      }
      function fromExcelSerial(n: number) {
        const base = Date.UTC(1899, 11, 30);
        const ms = Math.round(n * 86400 * 1000);
        return new Date(base + ms);
      }
      function normalizeDateFromAny(v: any): string {
        if (v == null) return "";
        if (v instanceof Date) return toYMD(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
        if (typeof v === "number" && v > 20000 && v < 60000) return toYMD(fromExcelSerial(Math.floor(v)));
        const s = String(v).trim();
        if (/^\d{4,5}(\.\d+)?$/.test(s)) return toYMD(fromExcelSerial(Math.floor(Number(s))));
        return normalizeDateSlash(s);
      }

      const lower = file.name.toLowerCase();
      let rows: any[][] = [];

      if (lower.endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(bytes, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false, dateNF: "yyyy/m/d" }) as any[][];
        rows = (aoa || []).map(r => (r || []).map(c => (c == null ? "" : c)));
      } else {
        let encoding: "utf-8" | "utf-16le" | "utf-16be" = "utf-8";
        if (bytes.length >= 2) {
          if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
          else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
        }
        let text = new TextDecoder(encoding).decode(bytes);
        const firstLine = text.split(/\r?\n/, 1)[0] || "";
        if (!firstLine.includes(",") && firstLine.includes("\t")) text = text.replace(/\t/g, ",");
        rows = parseCSV(text);
      }

      if (!rows.length) { alert("找不到資料列"); return; }

      const rawHeader = rows[0].map((c: any) => stripCell(String(c)));
      const H = rawHeader.map(normalizeHeader);
      const col = {
        albumTitle:  idxOfAny(H, ["專輯名稱","專輯","專輯名","albumtitle","album"]),
        cover:       idxOfAny(H, ["專輯封面圖連結","封面","封面圖","圖片","cover"]),
        songTitle:   idxOfAny(H, ["歌曲名稱","歌曲","歌名","songtitle","song","title"]),
        releaseDate: idxOfAny(H, [
          "歌曲發行日(yyyy/m/d)","歌曲發行日(yyyy-mm-dd)","歌曲發行日yyyy-mm-dd",
          "歌曲發行日","發行日","發布日","發布日期","releasedate","date"
        ]),
        lyricist:    idxOfAny(H, ["作詞","詞作者","lyricist"]),
        composer:    idxOfAny(H, ["作曲","曲作者","composer"]),
        kor:         idxOfAny(H, ["韓文歌詞","kor","korean","kr","han","韓文"]),
        zhLyric:     idxOfAny(H, ["中文歌詞","zh_lyric","zh(lyric)"]),
        word:        idxOfAny(H, ["韓文單字","單字","word"]),
        zhWord:      idxOfAny(H, ["中文單字","單字中文","釋義","zh_word"]),
        pattern:     idxOfAny(H, ["韓文文法","文法","pattern"]),
        explain:     idxOfAny(H, ["文法說明","說明","explain"]),
        example:     idxOfAny(H, ["文法例句","例句","example"]),
      };
      const has = (i: number) => i >= 0;

      if (!(has(col.albumTitle) && has(col.songTitle))) {
        alert("欄位缺少「專輯名稱 / 歌曲名稱」，請使用統一範本 .xlsx 或 .txt");
        return;
      }

      const body = rows.slice(1);

      setData(d => {
        const next = d.albums.map(a => ({ ...a, songs: a.songs.map(s => ({ ...s })) }));

        const getAlbumIndex = (title: string) => {
          const key = title.toLowerCase();
          let ai = next.findIndex(a => a.title.toLowerCase() === key);
          if (ai < 0) {
            next.push({ id: uid(), title, releaseDate: today(), cover: "", songs: [] });
            ai = next.length - 1;
          }
          return ai;
        };
        const getSongIndex = (ai: number, title: string) => {
          const key = title.toLowerCase();
          let si = next[ai].songs.findIndex(s => s.title.toLowerCase() === key);
          if (si < 0) {
            next[ai].songs.push({
              id: uid(), title, releaseDate: today(), lyricist: "", composer: "", lyrics: [], vocab: [], grammar: []
            });
            si = next[ai].songs.length - 1;
          }
          return si;
        };

        for (let rowIdx = 0; rowIdx < body.length; rowIdx++) {
          const r = body[rowIdx];

          const aTitle = has(col.albumTitle) ? stripCell(r[col.albumTitle]) : "";
          const sTitle = has(col.songTitle)  ? stripCell(r[col.songTitle ]) : "";
          if (!aTitle || !sTitle) { stat.skipped++; continue; }

          const ai = getAlbumIndex(aTitle);
          const si = getSongIndex(ai, sTitle);
          const song = next[ai].songs[si] as Song & {
            __importLyrics?: { kor:string; zh:string }[];
            __importVocab?: { word:string; zh:string }[];
            __importGrammar?: { pattern:string; explain:string; example:string }[];
            __touchedLyrics?: boolean;
            __touchedVocab?: boolean;
            __touchedGrammar?: boolean;
          };

          const rawDate = has(col.releaseDate) ? r[col.releaseDate] : "";
          const date    = normalizeDateFromAny(rawDate);
          const lyr     = has(col.lyricist) ? stripCell(r[col.lyricist]) : "";
          const comp    = has(col.composer) ? stripCell(r[col.composer]) : "";
          const cov     = has(col.cover)    ? stripCell(r[col.cover])    : "";

          if (date) song.releaseDate = date;
          if (lyr)  song.lyricist    = lyr;
          if (comp) song.composer    = comp;
          if (cov)  next[ai].cover   = cov;

          const korVal  = has(col.kor)     ? stripCell(r[col.kor])     : "";
          const zhLyVal = has(col.zhLyric) ? stripCell(r[col.zhLyric]) : "";
          const wordVal = has(col.word)    ? stripCell(r[col.word])    : "";
          const zhWdVal = has(col.zhWord)  ? stripCell(r[col.zhWord])  : "";
          const pattVal = has(col.pattern) ? stripCell(r[col.pattern]) : "";
          const explVal = has(col.explain) ? stripCell(r[col.explain]) : "";
          const exmpVal = has(col.example) ? stripCell(r[col.example]) : "";

          const isLyricRow   = !!(korVal || zhLyVal);
          const isGrammarRow = !!pattVal;
          const isVocabRow   = !!(wordVal || zhWdVal) && !isGrammarRow;

          if (isLyricRow) {
            if (!song.__importLyrics) song.__importLyrics = [];
            song.__importLyrics.push({ kor: korVal, zh: zhLyVal });
            song.__touchedLyrics = true; stat.lyric++;
          }
          if (isVocabRow) {
            if (!song.__importVocab) song.__importVocab = [];
            song.__importVocab.push({ word: wordVal, zh: zhWdVal });
            song.__touchedVocab = true; stat.vocab++;
          }
          if (isGrammarRow) {
            if (!song.__importGrammar) song.__importGrammar = [];
            song.__importGrammar.push({ pattern: pattVal, explain: explVal, example: exmpVal });
            song.__touchedGrammar = true; stat.grammar++;
          }
          if (!isLyricRow && !isVocabRow && !isGrammarRow) stat.skipped++;
        }

        for (const a of next) {
          for (let i = 0; i < a.songs.length; i++) {
            const s = a.songs[i] as Song & {
              __importLyrics?: { kor:string; zh:string }[];
              __importVocab?: { word:string; zh:string }[];
              __importGrammar?: { pattern:string; explain:string; example:string }[];
              __touchedLyrics?: boolean;
              __touchedVocab?: boolean;
              __touchedGrammar?: boolean;
            };
            if (s.__touchedLyrics && s.__importLyrics) {
              s.lyrics = trimLyricsTail(s.__importLyrics.map(x => ({ id: uid(), kor: x.kor, zh: x.zh })));
              delete s.__importLyrics; delete s.__touchedLyrics;
            }
            if (s.__touchedVocab && s.__importVocab) {
              s.vocab = s.__importVocab.map(x => ({ id: uid(), word: x.word, zh: x.zh }));
              delete s.__importVocab; delete s.__touchedVocab;
            }
            if (s.__touchedGrammar && s.__importGrammar) {
              s.grammar = s.__importGrammar.map(x => ({ id: uid(), pattern: x.pattern, explain: x.explain, example: x.example }));
              delete s.__importGrammar; delete s.__touchedGrammar;
            }
          }
        }
        return { ...d, albums: next };
      });

      const ok = stat.lyric + stat.vocab + stat.grammar;
      alert(`匯入完成：成功 ${ok} 筆（歌詞 ${stat.lyric} / 單字 ${stat.vocab} / 文法 ${stat.grammar}），失敗/略過 ${stat.skipped} 筆。`);
    } catch (e) {
      console.error(e);
      alert("XLSX/TXT 解析或匯入失敗");
    }
  };
  reader.readAsArrayBuffer(file);
}





  // 匯出/匯入選單
  const CSVMenu = (
  <>
    <button
      className="block w-full px-3 py-1 text-left hover:bg-black/5"
      onClick={()=>setExportOpen(true)}
    >
      匯出（自訂欄位，XLSX）
    </button>
    <div className="my-1 border-t" />

    <div className="px-3 py-1 text-xs text-zinc-500">下載範本（XLSX）</div>
    <div className="px-2 pb-1">
      <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5"
              onClick={downloadTemplate}>
        統一範本（.xlsx）
      </button>
    </div>

    <div className="my-1 border-t" />
    <div className="px-3 py-1 text-xs text-zinc-500">匯入（XLSX / TXT）</div>
    <label className="block w-full cursor-pointer px-3 py-1 text-left hover:bg-black/5">
      選擇檔案
      <input
        type="file"
        className="hidden"
        accept=".xlsx,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
        onChange={e=>{ const f = e.target.files?.[0]; if (f) importCSV(f); }}
      />
    </label>
    <div className="px-3 pb-2 pt-1 text-[11px] leading-5 text-zinc-500">
      建議使用<b>統一範本</b>：必填 <b>專輯名稱(必填)、歌曲名稱(必填)</b>；其餘欄位皆為選填（作詞、作曲、歌詞、單字、文法…）。
    </div>
  </>
);



  const NewMenu = (
    <>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={()=>setModal({ type: 'song', albumId: current?.album.id })}>新增歌曲</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={()=>setModal({ type: 'album' })}>新增專輯</button>
    </>
  );

  // modal
  const [modal, setModal] = useState<{ type: null | 'album' | 'song'; albumId?: string }>({ type: null });

  return (
    <div className="min-h-screen bg-amber-50/40 text-gray-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1280px] px-4">
          <div className="flex flex-nowrap items-center gap-2 py-3">
            <button className="shrink-0 rounded-lg border px-2 py-1 text-sm hover:bg-black/5" title="切換側邊選單" onClick={() => {
              if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) toggleSidebar(); else setDrawerOpen(true);
            }}>{HAMBURGER} 選單</button>
            <div className="min-w-0 shrink-0 truncate whitespace-nowrap text-xl font-bold">DAY6 歌詞學韓文</div>
            <div className="relative ml-auto flex flex-nowrap items-center gap-2">
              <input placeholder="搜尋：歌名 / 歌詞 / 單字 / 文法" value={query} onChange={e=>setQuery(e.target.value)} className="w-[52vw] max-w-[420px] rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring md:w-72" />
              <DropMenu label="匯入 / 匯出" items={CSVMenu} />
              <DropMenu label="新增" items={NewMenu} />
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <div className="md:flex md:gap-4">
          {sidebarVisible && (
            <div className="rounded-xl border bg-white/70 md:w-[317px] md:shrink-0">
              <DesktopSidebar
                data={data}
                selected={selected}
                onSelect={(aid,sid)=>setSelected({ albumId: aid, songId: sid })}
                sortMode={sortMode}
                onToggleSort={()=>setSortMode(m=>!m)}
                editingAlbumId={editingAlbumId}
                onToggleAlbumEdit={(id)=>setEditingAlbumId(id)}
                onUpdateAlbum={updateAlbum}
                onUploadAlbumCover={uploadAlbumCover}
                onReorderAlbum={reorderAlbum}
                onReorderSong={reorderSong}
                onDeleteSong={deleteSong}
                onDeleteAlbum={deleteAlbum}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
              />
            </div>
          )}

          {/* Main */}
          <MainArea
            data={data}
            selected={selected}
            updateSong={updateSong}
            tab={tab}
            setTab={setTab}
            editMode={editMode}
            setEditMode={setEditMode}
          />
        </div>
      </div>

      {/* Mobile Drawer */}
      <SideDrawer
        open={drawerOpen}
        onClose={()=>setDrawerOpen(false)}
        data={data}
        selected={selected}
        onSelect={(aid,sid)=>setSelected({ albumId: aid, songId: sid })}
        onOpenAddAlbum={()=>setModal({ type: 'album' })}
        onOpenAddSong={(aid)=>setModal({ type: 'song', albumId: aid })}
      />

      {/* Modals */}
      <AddAlbumModal open={modal.type==='album'} onClose={()=>setModal({ type: null })} onSubmit={(p)=>{ addAlbumImpl(p.title, p.releaseDate, p.cover); setModal({ type: null }); }} />
      <AddSongModal  open={modal.type==='song'}  onClose={()=>setModal({ type: null })} albums={data.albums} defaultAlbumId={modal.albumId} onSubmit={(p)=>{ addSongImpl(p); setModal({ type: null }); }} />
      <ExportModal
          open={exportOpen}
          onClose={()=>setExportOpen(false)}
          defaultSelected={DEFAULT_EXPORT_COLS}
          onExport={exportCustom}
        />

    </div>
  );
}
    function normalizeDateSlash(input: string): string {
      const t = (input || "").trim();
      if (!t) return "";
      const m = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (!m) return t;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      if (!y || !mo || !d) return t;
      return `${y}/${mo}/${d}`; // 無前導零：2015/9/7
    }



/* Main Area */
function MainArea({ data, selected, updateSong, tab, setTab, editMode, setEditMode }:{
  data: AppData;
  selected: { albumId: string; songId: string } | null;
  updateSong: (songId: string, patch: Partial<Song>)=>void;
  tab: 'lyrics'|'vocab'|'flash'|'grammar';
  setTab: (t:'lyrics'|'vocab'|'flash'|'grammar')=>void;
  editMode: boolean; setEditMode: (v:boolean)=>void;
}) {
  const current = useMemo(() => {
    if (!selected) return null as { album: Album; song: Song } | null;
    const album = data.albums.find(a => a.id === selected.albumId); if (!album) return null;
    const song = album.songs.find(s => s.id === selected.songId); if (!song) return null;
    return { album, song };
  }, [data, selected]);

  return (
    <div className="min-w-0 flex-1">
      {current ? (
        <div className="flex min-h-[calc(100vh-200px)] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <SongTitleEditable
                title={current.song.title}
                releaseDate={current.song.releaseDate}
                onSave={(nextTitle, nextDate) => {
                  updateSong(current.song.id, {
                    title: nextTitle,
                    releaseDate: nextDate ? normalizeDateSlash(nextDate) : undefined,
                  });
                }}
              />

              <div className="text-xs text-zinc-500">
                {current.album.title} • {normalizeDateSlash(current.song.releaseDate || current.album.releaseDate || "")}
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                <MetaEditable
                  label="作詞"
                  value={current.song.lyricist}
                  placeholder="填入作詞"
                  onSave={(v)=>updateSong(current.song.id, { lyricist: v })}
                />
                <MetaEditable
                  label="作曲"
                  value={current.song.composer}
                  placeholder="填入作曲"
                  onSave={(v)=>updateSong(current.song.id, { composer: v })}
                />
              </div>

            </div>
            <div className="flex flex-wrap gap-2">
              <TabButton active={tab==='lyrics'} onClick={()=>setTab('lyrics')}>歌詞</TabButton>
              <TabButton active={tab==='vocab'}  onClick={()=>setTab('vocab')}>單字表</TabButton>
              <TabButton active={tab==='flash'}  onClick={()=>setTab('flash')}>單字卡</TabButton>
              <TabButton active={tab==='grammar'} onClick={()=>setTab('grammar')}>文法</TabButton>
            </div>
          </div>

          {tab==='lyrics'  && <div className="flex min-h-0 flex-1"><LyricsPanel  song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} editMode={editMode} setEditMode={setEditMode} /></div>}
          {tab==='vocab'   && <VocabPanel   song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
          {tab==='flash'   && <FlashcardPanel song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
          {tab==='grammar' && <GrammarPanel  song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white/70 p-6 text-zinc-500">請在左側選擇或新增一首歌曲</div>
      )}
    </div>
  );
}

/* ===================== Add Album / Song Modals ===================== */
function AddAlbumModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (payload: { title: string; releaseDate: string; cover?: string }) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [cover, setCover] = useState<string | undefined>(undefined);
  useEffect(()=>{ if (open) { setTitle(""); setDate(today()); setCover(undefined); } }, [open]);

  function onPickFile(file?: File) {
    if (!file) { setCover(undefined); return; }
    fileToDataURL(file).then(setCover);
  }

  return (
    <Modal open={open} onClose={onClose} title="新增專輯">
      <form
        onSubmit={(e)=>{ e.preventDefault(); if (!title.trim()) return; onSubmit({ title: title.trim(), releaseDate: date || today(), cover }); }}
        className="space-y-3"
      >
        <div>
          <div className="mb-1 text-xs text-zinc-500">專輯名稱</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="例如：The Book of Us"/>
        </div>
        <div>
          <div className="mb-1 text-xs text-zinc-500">發佈日期</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2"/>
        </div>
        <div>
          <div className="mb-1 text-xs text-zinc-500">封面圖片（可選）</div>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5">
              選擇圖片
              <input type="file" accept="image/*" className="hidden" onChange={e=>onPickFile(e.target.files?.[0])}/>
            </label>
            <div className="h-16 w-16 overflow-hidden rounded-lg border bg-white/60">
              {cover ? <img src={cover} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">預覽</div>}
            </div>
            {cover && <button type="button" className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>setCover(undefined)}>清除</button>}
          </div>
        </div>
        <div className="flex justify-end gap-2"><ToolbarButton onClick={onClose}>取消</ToolbarButton><ToolbarButton type="submit">新增</ToolbarButton></div>
      </form>
    </Modal>
  );
}

function AddSongModal({ open, onClose, onSubmit, albums, defaultAlbumId }: {
  open: boolean; onClose: () => void;
  onSubmit: (payload: { albumId: string; title: string; releaseDate?: string; kor: string; zh: string; lyricist?: string; composer?: string }) => void;
  albums: Album[]; defaultAlbumId?: string
}) {
  const [albumId, setAlbumId] = useState<string>(defaultAlbumId || albums[0]?.id || "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [lyricist, setLyricist] = useState("");
  const [composer, setComposer] = useState("");
  const [kor, setKor] = useState("");
  const [zh , setZh ] = useState("");

  useEffect(()=>{ if (open) {
    setAlbumId(defaultAlbumId || albums[0]?.id || "");
    setTitle(""); setDate(""); setLyricist(""); setComposer(""); setKor(""); setZh("");
  } }, [open, defaultAlbumId, albums.length]);

  return (
    <Modal open={open} onClose={onClose} title="新增歌曲">
      <form
        onSubmit={(e)=>{ e.preventDefault(); if (!albumId || !title.trim()) return; onSubmit({ albumId, title: title.trim(), releaseDate: date, lyricist, composer, kor, zh }); }}
        className="space-y-3"
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">選擇專輯</div>
            <select value={albumId} onChange={e=>setAlbumId(e.target.value)} className="w-full rounded-lg border px-3 py-2">
              {albums.map(a => (<option key={a.id} value={a.id}>{a.title}（{a.releaseDate}）</option>))}
            </select>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">發佈日（可空）</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2"/>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">歌名</div>
            <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="例如：Congratulations"/>
          </div>
          <div className="col-span-12 md:col-span-3">
            <div className="mb-1 text-xs text-zinc-500">作詞（可空）</div>
            <input value={lyricist} onChange={e=>setLyricist(e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="作詞人"/>
          </div>
          <div className="col-span-12 md:col-span-3">
            <div className="mb-1 text-xs text-zinc-500">作曲（可空）</div>
            <input value={composer} onChange={e=>setComposer(e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="作曲人"/>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">韓文歌詞（每行一句）</div>
            <textarea value={kor} onChange={e=>setKor(e.target.value)} className="h-40 w-full rounded-lg border px-3 py-2"/>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">中文歌詞（每行一句）</div>
            <textarea value={zh} onChange={e=>setZh(e.target.value)} className="h-40 w-full rounded-lg border px-3 py-2"/>
          </div>
        </div>
        <div className="flex justify-end gap-2"><ToolbarButton onClick={onClose}>取消</ToolbarButton><ToolbarButton type="submit">新增</ToolbarButton></div>
      </form>
    </Modal>
  );
}

