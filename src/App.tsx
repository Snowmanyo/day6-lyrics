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

/* ===================== Helpers ===================== */
const HAMBURGER = "\u2630"; // ☰
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

function download(filename: string, text: string) {
  const BOM = "\uFEFF"; // 讓 Excel 正確以 UTF-8 開啟
  const blob = new Blob([BOM, text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
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
function toTSV(rows: (string | number | null | undefined)[][]) {
  return rows.map(r => r.map(c => String(c ?? "")).join("\t")).join("\n");
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
                        <div className="truncate text-xs text-zinc-500">{a.releaseDate}</div>
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
                    <div className="flex items中心 justify-between gap-2">
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
                          <div className="grid w-full grid-cols-[1fr,auto] items-center gap-2">
                            <button
                              onClick={()=>onSelect(a.id, s.id)}
                              className={`min-w-0 rounded-lg px-2 py-1 text-left hover:bg-black/5 ${selected?.songId===s.id ? 'bg-black/5 font-medium' : ''}`}
                              title="開啟歌曲"
                            >
                              <div className="truncate">{s.title}</div>
                            </button>

                            {sortMode ? (
                              <div className="flex items-center gap-1">
                                <button
                                  className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40"
                                  onClick={()=>onReorderSong(a.id, songIdx, songIdx-1)}
                                  disabled={sTop}
                                  title="上移歌曲"
                                >▲</button>
                                <button
                                  className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-40"
                                  onClick={()=>onReorderSong(a.id, songIdx, songIdx+1)}
                                  disabled={sBottom}
                                  title="下移歌曲"
                                >▼</button>
                              </div>
                            ) : editing ? (
                              <button
                                onClick={(e)=>{ e.stopPropagation(); onDeleteSong(a.id, s.id); }}
                                className="shrink-0 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-black/5"
                                title="刪除此歌曲"
                              >×</button>
                            ) : null}
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
                  <div className="truncate text-xs text-zinc-500">{a.releaseDate}</div>
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
    <div className="rounded-2xl border bg白/70 p-4">
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
function SongTitleEditable({ title, onSave }: { title: string; onSave: (t: string)=>void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
  useEffect(()=>{ setVal(title); }, [title]);
  if (!editing) {
    return (
      <div className="text-2xl font-bold flex items-center gap-2">
        <span className="truncate">{title}</span>
        <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>setEditing(true)} title="編輯歌名">✎</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input value={val} onChange={e=>setVal(e.target.value)} className="text-2xl font-bold rounded-md border px-2 py-1" autoFocus />
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ onSave(val.trim() || title); setEditing(false); }}>儲存</button>
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ setVal(title); setEditing(false); }}>取消</button>
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

  /* ===== 匯出（TXT/TSV） ===== */
  function exportAlbumsTXT() {
    const rows: (string|number)[][] = [["albumTitle","releaseDate","cover"]];
    for (const a of data.albums) rows.push([a.title, a.releaseDate, a.cover||""]);
    download(`albums.txt`, toTSV(rows));
  }
  function exportSongsTXT() {
    const rows: (string|number)[][] = [["albumTitle","songTitle","releaseDate","lyricist","composer"]];
    for (const a of data.albums) for (const s of a.songs) rows.push([a.title, s.title, s.releaseDate||"", s.lyricist||"", s.composer||""]);
    download(`songs.txt`, toTSV(rows));
  }
  function exportLyricsTXTAll() {
    const rows: (string|number)[][] = [["albumTitle","songTitle","line","kor","zh"]];
    for (const a of data.albums) for (const s of a.songs) s.lyrics.forEach((l,idx)=> rows.push([a.title, s.title, idx+1, l.kor, l.zh]));
    download(`lyrics.txt`, toTSV(rows));
  }
  function exportVocabTXTAll() {
    const rows: (string|number)[][] = [["albumTitle","songTitle","word","zh"]];
    for (const a of data.albums) for (const s of a.songs) for (const v of s.vocab) rows.push([a.title, s.title, v.word, v.zh||""]);
    download(`vocab.txt`, toTSV(rows));
  }
  function exportGrammarTXTAll() {
    const rows: (string|number)[][] = [["albumTitle","songTitle","pattern","explain","example"]];
    for (const a of data.albums) for (const s of a.songs) for (const g of s.grammar) rows.push([a.title, s.title, g.pattern, g.explain||"", g.example||""]);
    download(`grammar.txt`, toTSV(rows));
  }

  // 範本（只含表頭）
  // 範本（只含表頭）：僅提供「統一範本」的 .xlsx
async function downloadTemplate() {
  // 與你既有統一範本欄位一致：albumTitle、songTitle 必填，其餘選填
  const header = [
    "albumTitle","songTitle",
    "releaseDate(optional)","lyricist(optional)","composer(optional)","cover(optional)",
    "line(optional)","kor(optional)","zh(optional)",
    "word(optional)","pattern(optional)","explain(optional)","example(optional)"
  ];

  const XLSX = await import("xlsx");                         // 動態載入，避免首屏負擔
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
  a.download = "unified-template.xlsx";
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

      // 先判斷副檔名，.xlsx 走 SheetJS，其它走原本 TXT/TSV/CSV 邏輯
      const lower = file.name.toLowerCase();
      let rows: string[][] = [];

      if (lower.endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(bytes, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as any[][];
        rows = (aoa || []).map(r => (r || []).map(c => (c == null ? "" : String(c))));
      } else {
        // ====== 走原本 TXT/TSV/CSV 流程 ======
        // 判斷 BOM
        let encoding: "utf-8" | "utf-16le" | "utf-16be" = "utf-8";
        if (bytes.length >= 2) {
          if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
          else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
        }
        let text = new TextDecoder(encoding).decode(bytes);
        // 若是 TSV（第一行無逗號但有 tab），轉逗號解析；否則維持你原本 parseCSV()
        const firstLine = text.split(/\r?\n/, 1)[0] || "";
        if (!firstLine.includes(",") && firstLine.includes("\t")) {
          text = text.replace(/\t/g, ",");
        }
        rows = parseCSV(text);
      }

      if (!rows.length) {
        alert("找不到資料列");
        return;
      }

      // ====== 以下維持你原本的欄位正規化 / 統一範本 / 舊個別檔判斷 / 寫回資料 ======
      // 標頭正規化
      const rawHeader = rows[0].map(c => stripCell(c));
      const H = rawHeader.map(normalizeHeader);

      const col = {
        albumTitle:  idxOfAny(H, ["albumtitle","album","專輯","專輯名稱","專輯名"]),
        songTitle:   idxOfAny(H, ["songtitle","song","title","歌曲","歌名"]),
        releaseDate: idxOfAny(H, ["releasedate","date","發佈日","發佈日期","發布日","發布日期"]),
        cover:       idxOfAny(H, ["cover","封面","圖片","封面圖"]),
        lyricist:    idxOfAny(H, ["lyricist","作詞","詞作者","填詞"]),
        composer:    idxOfAny(H, ["composer","作曲","曲作者","譜曲"]),
        line:        idxOfAny(H, ["line","行","行號","序"]),
        kor:         idxOfAny(H, ["kor","korean","kr","han","韓文"]),
        zh:          idxOfAny(H, ["zh","chinese","cn","中文","翻譯","釋義"]),
        word:        idxOfAny(H, ["word","koreanword","單字","詞"]),
        pattern:     idxOfAny(H, ["pattern","文法","語法"]),
        explain:     idxOfAny(H, ["explain","說明"]),
        example:     idxOfAny(H, ["example","例句"]),
      };
      const has = (i: number) => i >= 0;

      // 統一表格：album+song 必填，其餘任一欄存在即為統一表
      const kindUnified =
        has(col.albumTitle) && has(col.songTitle) &&
        (has(col.kor) || has(col.zh) || has(col.word) || has(col.pattern) ||
         has(col.lyricist) || has(col.composer) || has(col.releaseDate) ||
         has(col.cover) || has(col.line));

      // 舊個別檔（為了相容，如果你未來不需要，可移除）
      const kindAlbums = has(col.albumTitle) && !has(col.songTitle)
        && !has(col.word) && !has(col.pattern) && !has(col.kor) && !has(col.zh);
      const kindSongs = has(col.albumTitle) && has(col.songTitle) && !has(col.kor) && !has(col.zh)
        && !has(col.word) && !has(col.pattern);
      const kindLyrics = has(col.albumTitle) && has(col.songTitle) && (has(col.kor) || has(col.zh));
      const kindVocab = has(col.albumTitle) && has(col.songTitle) && has(col.word) && !has(col.pattern);
      const kindGrammar = has(col.albumTitle) && has(col.songTitle) && has(col.pattern) && !has(col.word);

      // 去掉表頭
      const body = rows.slice(1);

      // ====== 統一表格路徑（你的原本實作搬過來） ======
      if (kindUnified) {
        setData(d => {
          const next = d.albums.map(a => ({ ...a, songs: a.songs.map(s => ({ ...s })) }));
          const perSongRowSeq: Record<string, number> = {};

          const getAlbumIndex = (title: string) => {
            const key = title.toLowerCase();
            let ai = next.findIndex(a => a.title.toLowerCase() === key);
            if (ai < 0) { next.push({ id: uid(), title, releaseDate: today(), cover: "", songs: [] }); ai = next.length - 1; }
            return ai;
          };
          const getSongIndex = (ai: number, title: string) => {
            const key = title.toLowerCase();
            let si = next[ai].songs.findIndex(s => s.title.toLowerCase() === key);
            if (si < 0) { next[ai].songs.push({ id: uid(), title, releaseDate: today(), lyricist: "", composer: "", lyrics: [], vocab: [], grammar: [] }); si = next[ai].songs.length - 1; }
            return si;
          };

          for (let rowIdx = 0; rowIdx < body.length; rowIdx++) {
            const r = body[rowIdx];
            const aTitle = has(col.albumTitle) ? stripCell(r[col.albumTitle]) : "";
            const sTitle = has(col.songTitle)  ? stripCell(r[col.songTitle ]) : "";
            if (!aTitle || !sTitle) continue;

            const ai = getAlbumIndex(aTitle);
            const si = getSongIndex(ai, sTitle);
            const song = next[ai].songs[si] as Song & {
              __importLyrics?: { line:number; kor:string; zh:string }[];
              __importVocab?: { word:string; zh:string }[];
              __importGrammar?: { pattern:string; explain:string; example:string }[];
              __touchedLyrics?: boolean;
              __touchedVocab?: boolean;
              __touchedGrammar?: boolean;
            };

            // 專輯/歌曲層級欄位
            const date = has(col.releaseDate) ? stripCell(r[col.releaseDate]) : "";
            const lyr  = has(col.lyricist)    ? stripCell(r[col.lyricist])    : "";
            const comp = has(col.composer)    ? stripCell(r[col.composer])    : "";
            const cov  = has(col.cover)       ? stripCell(r[col.cover])       : "";
            if (date) song.releaseDate = date;
            if (lyr)  song.lyricist    = lyr;
            if (comp) song.composer    = comp;
            if (cov)  next[ai].cover   = cov;

            // 歌詞
            if (has(col.kor) || has(col.zh)) {
              const line = has(col.line) ? parseInt(stripCell(r[col.line] || ""), 10) : NaN;
              const seqKey = `${ai}#${si}`;
              const seq = (perSongRowSeq[seqKey] = (perSongRowSeq[seqKey] || 0) + 1);
              const ln = Number.isFinite(line) ? line : seq;

              const kor = has(col.kor) ? stripCell(r[col.kor]) : "";
              const zh  = has(col.zh)  ? stripCell(r[col.zh])  : "";
              if (!song.__importLyrics) song.__importLyrics = [];
              song.__importLyrics.push({ line: ln, kor, zh });
              song.__touchedLyrics = true;
            }

            // 單字
            if (has(col.word) && !has(col.pattern)) {
              const word = stripCell(r[col.word] || "");
              const zh   = has(col.zh) ? stripCell(r[col.zh] || "") : "";
              if (word) {
                if (!song.__importVocab) song.__importVocab = [];
                song.__importVocab.push({ word, zh });
                song.__touchedVocab = true;
              }
            }

            // 文法
            if (has(col.pattern) && !has(col.word)) {
              const pattern = stripCell(r[col.pattern] || "");
              const explain = has(col.explain) ? stripCell(r[col.explain] || "") : "";
              const example = has(col.example) ? stripCell(r[col.example] || "") : "";
              if (pattern) {
                if (!song.__importGrammar) song.__importGrammar = [];
                song.__importGrammar.push({ pattern, explain, example });
                song.__touchedGrammar = true;
              }
            }
          }

          // 收斂寫回（維持你原本的整理邏輯）
          for (const a of next) {
            for (let i = 0; i < a.songs.length; i++) {
              const s = a.songs[i] as Song & {
                __importLyrics?: { line:number; kor:string; zh:string }[];
                __importVocab?: { word:string; zh:string }[];
                __importGrammar?: { pattern:string; explain:string; example:string }[];
                __touchedLyrics?: boolean;
                __touchedVocab?: boolean;
                __touchedGrammar?: boolean;
              };
              if (s.__touchedLyrics && s.__importLyrics) {
                const withId = s.__importLyrics.sort((x, y) => x.line - y.line).map(x => ({ id: uid(), kor: x.kor, zh: x.zh }));
                s.lyrics = trimLyricsTail<LyricLine>(withId);
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

          alert("已匯入統一範本");
          return { ...d, albums: next };
        });
        return;
      }

      // ====== 舊個別檔（保留相容；你若不再需要可刪） ======
      // ...（此處沿用你原本的個別檔支援邏輯，無需變更）...
      // 直接貼回你現有程式裡「kindAlbums / kindSongs / kindLyrics / kindVocab / kindGrammar」後續原碼

      // 若以上都沒命中：
      alert("無法判斷格式，請使用統一範本 .xlsx 或 .txt");
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
      <div className="px-3 py-1 text-xs text-zinc-500">匯出（TXT / UTF-8 BOM, TSV）</div>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportAlbumsTXT}>專輯（含排序）</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportSongsTXT}>歌曲清單（含作詞/作曲）</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportLyricsTXTAll}>歌詞</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportVocabTXTAll}>單字</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportGrammarTXTAll}>文法</button>
      <div className="my-1 border-t" />
      <div className="px-3 py-1 text-xs text-zinc-500">下載範本（XLSX）</div>
      <div className="px-2 pb-1">
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5"
                onClick={downloadTemplate}>
          統一範本（.xlsx）
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 px-2 pb-1">
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5" onClick={()=>downloadTemplate("unified")}>統一範本（建議）</button>
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
        建議使用<b>統一範本</b>：必填 <b>albumTitle, songTitle</b>；其餘欄位可選（作詞、作曲、歌詞、單字、文法…）。
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
    </div>
  );
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
                onSave={(nextTitle)=>{ updateSong(current.song.id, { title: nextTitle }); }}
              />
              <div className="text-xs text-zinc-500">{current.album.title} • {current.song.releaseDate || current.album.releaseDate}</div>
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
