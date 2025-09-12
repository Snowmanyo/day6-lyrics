import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== Types ===================== */
type LyricLine = { id: string; kor: string; zh: string };
type VocabItem = { id: string; word: string; zh?: string };
type GrammarPoint = { id: string; pattern: string; explain?: string; example?: string };
type Song = { id: string; title: string; releaseDate?: string; lyrics: LyricLine[]; vocab: VocabItem[]; grammar: GrammarPoint[] };
type Album = { id: string; title: string; releaseDate: string; cover?: string; songs: Song[] };
type AppData = { artist: string; albums: Album[]; updatedAt: string; version: string };

/* ===================== Helpers ===================== */
const HAMBURGER = "\u2630"; // ☰
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
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
// 放在 alignLyrics 之後
function trimLyricsTail(rows: { kor: string; zh: string }[]) {
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
function toCSV(rows: (string | number | null | undefined)[][]) {
  return rows.map(r =>
    r.map(c => {
      const s = String(c ?? "");
      // 若包含逗號或引號，用 CSV quoting
      const needQuote = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needQuote ? `"${escaped}"` : escaped;
    }).join(",")
  ).join("\n");
}
/** 極簡 CSV 解析器（支援雙引號與逗號） */
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
        // 處理 \r\n
        if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = ""; i++; continue;
      }
      field += ch; i++;
    }
  }
  row.push(field); rows.push(row);
  // 去掉可能的最後空行
  while (rows.length && rows[rows.length - 1].every(c => c === "")) rows.pop();
  return rows;
}
function fileToDataURL(file: File): Promise<string> {
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result||"")); fr.readAsDataURL(file); });
}

/* ===================== Seed ===================== */
const SEED: AppData = {
  artist: "DAY6",
  version: "2.7.0",
  updatedAt: new Date().toISOString(),
  albums: [
    {
      id: uid(),
      title: "The Day",
      releaseDate: "2015-09-07",
      cover: "",
      songs: [
        { id: uid(), title: "Freely", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [] },
        { id: uid(), title: "Congratulations", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [] },
        { id: uid(), title: "Out of My Mind", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [] },
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

/* Toggle switch */
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
  collapsed: Record<string, boolean>;
  onToggleCollapse: (albumId: string)=>void;
}) {
  return (
    <aside className="w-[317px] shrink-0 overflow-y-auto border-r p-3 hidden md:block">
      {/* 內層固定 284px */}
      <div className="w-[284px]">
        {/* Top bar */}
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

        {/* Album cards */}
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

                    {/* 右側：排序模式 → 上下移；一般模式 → ✎ 編輯 */}
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

                            {/* 右側操作：排序模式顯示上下移；否則若在專輯編輯模式顯示刪除 */}
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
          {/* ⚠️ 不要在 render 用 .sort 破壞儲存的排序！ */}
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
function LyricsPanel({
  song, onUpdate, editMode, setEditMode
}: {
  song: Song; onUpdate: (patch: Partial<Song>)=>void; editMode: boolean; setEditMode: (v:boolean)=>void;
}) {
  // 原始文字（來自狀態）
  const korFromState = useMemo(()=> song.lyrics.map(l=>l.kor).join("\n"), [song.lyrics]);
  const zhFromState  = useMemo(()=> song.lyrics.map(l=>l.zh ).join("\n"), [song.lyrics]);

  // 編輯用草稿（受控）
  const [korDraft, setKorDraft] = useState(korFromState);
  const [zhDraft , setZhDraft ] = useState(zhFromState);

  // 切換編輯時，同步草稿
  useEffect(()=>{
    if (editMode) { setKorDraft(korFromState); setZhDraft(zhFromState); }
  }, [editMode, korFromState, zhFromState]);

  // 依目前顯示來源產生預覽（編輯時用草稿，否則用實際值）
  const previewKor = editMode ? korDraft : korFromState;
  const previewZh  = editMode ? zhDraft  : zhFromState;
  const aligned = useMemo(()=> alignLyrics(previewKor, previewZh), [previewKor, previewZh]);

  function save() {
    // 對齊 → 去尾端全空白行 → 存回 state
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
    <div className="rounded-2xl border bg-white/70 p-4">
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

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium">對照預覽</div>
        <div className="max-h-[300px] overflow-auto rounded-xl border bg-white/60">
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
    setNewWord(""); setNewZh("");
    setEdit(true);
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

/* Inline title editor（歌曲標題✎） */
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
      <button className="rounded-md border px-2 py-1 text-xs hover:bg黑/5" onClick={()=>{ onSave(val.trim() || title); setEditing(false); }}>儲存</button>
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ setVal(title); setEditing(false); }}>取消</button>
    </div>
  );
}

/* ===================== App ===================== */
export default function App() {
  // data & persistence
  const [data, setData] = useState<AppData>(() => {
    try { const saved = localStorage.getItem('day6_lyrics_app_data_v2'); if (saved) return JSON.parse(saved) as AppData; } catch {}
    return SEED;
  });
  useEffect(() => { try { localStorage.setItem('day6_lyrics_app_data_v2', JSON.stringify({ ...data, updatedAt: new Date().toISOString() })); } catch {} }, [data]);

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

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
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
    const album: Album = { id: uid(), title, releaseDate, cover: cover || "", songs: [] };
    setData(d => ({ ...d, albums: [...d.albums, album] }));
  }
  function addSongImpl(payload: { albumId: string; title: string; releaseDate?: string; kor: string; zh: string }) {
  const { albumId, title, releaseDate = '' , kor, zh } = payload;
  const lyrics: LyricLine[] = alignLyrics(kor, zh).map(l => ({ id: uid(), kor: l.kor, zh: l.zh }));
  const song: Song = { id: uid(), title, releaseDate, lyrics, vocab: [], grammar: [] };
  setData(d => ({ ...d, albums: d.albums.map(a => a.id===albumId ? { ...a, songs: [...a.songs, song] } : a) }));
  setSelected({ albumId, songId: song.id });
}

  function updateSong(songId: string, patch: Partial<Song>) {
    setData(d => ({ ...d, albums: d.albums.map(a => ({ ...a, songs: a.songs.map(s => s.id===songId ? { ...s, ...patch } : s) })) }));
  }

  // ===== CSV 匯入/匯出（五種） =====
  function exportAlbumsCSV() {
    const rows: (string|number)[][] = [["albumId","title","releaseDate","cover"]];
    for (const a of data.albums) rows.push([a.id, a.title, a.releaseDate, a.cover||""]);
    download(`albums.csv`, toCSV(rows));
  }
  function exportSongsCSV() {
    const rows: (string|number)[][] = [["albumId","songId","title","releaseDate"]];
    for (const a of data.albums) for (const s of a.songs) rows.push([a.id, s.id, s.title, s.releaseDate||""]);
    download(`songs.csv`, toCSV(rows));
  }
  function exportLyricsCSVAll() {
    const rows: (string|number)[][] = [["songId","line","kor","zh"]];
    for (const a of data.albums) for (const s of a.songs) s.lyrics.forEach((l,idx)=> rows.push([s.id, idx+1, l.kor, l.zh]));
    download(`lyrics.csv`, toCSV(rows));
  }
  function exportVocabCSVAll() {
    const rows: (string|number)[][] = [["songId","word","zh"]];
    for (const a of data.albums) for (const s of a.songs) for (const v of s.vocab) rows.push([s.id, v.word, v.zh||""]);
    download(`vocab.csv`, toCSV(rows));
  }
  function exportGrammarCSVAll() {
    const rows: (string|number)[][] = [["songId","pattern","explain","example"]];
    for (const a of data.albums) for (const s of a.songs) for (const g of s.grammar) rows.push([s.id, g.pattern, g.explain||"", g.example||""]);
    download(`grammar.csv`, toCSV(rows));
  }
  // 範本
  function downloadTemplate(kind: "albums"|"songs"|"lyrics"|"vocab"|"grammar") {
    const base: Record<string,string[]> = {
      albums: ["albumId(optional)","title","releaseDate(YYYY-MM-DD)","cover(optional dataURL or URL)"],
      songs: ["albumId","songId(optional)","title","releaseDate(optional)"],
      lyrics: ["songId","line(1-based)","kor","zh"],
      vocab: ["songId","word","zh(optional)"],
      grammar: ["songId","pattern","explain(optional)","example(optional)"],
    };
    download(`${kind}-template.csv`, toCSV([base[kind]]));
  }
  // 匯入
  function importCSV(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result||"");
        const rows = parseCSV(text);
        if (!rows.length) return alert("找不到資料列");
        const header = rows[0].map(h=>h.trim().toLowerCase());

        // 判斷種類
        const isAlbums = header.join(",") === "albumid,title,releaseDate".toLowerCase() || header.includes("albumid") && header.includes("title") && header.includes("releasedate");
        const isSongs  = header.includes("albumid") && header.includes("title") && header.includes("songid");
        const isLyrics = header.includes("songid") && header.includes("line") && header.includes("kor") && header.includes("zh");
        // 將表頭做「去空白、小寫」正規化
        const H = header.map(h => h.replace(/\s+/g, '').toLowerCase());
        const idxOf = (keys: string[]) => { for (const k of keys) { const i = H.indexOf(k); if (i >= 0) return i; } return -1; };

        // 支援多語表頭
        const idxSongId     = idxOf(["songid"]);
        const idxAlbumTitle = idxOf(["album","albumtitle","專輯","專輯名稱"]);
        const idxSongTitle  = idxOf(["song","songtitle","title","歌曲","歌名"]);
        const idxWord       = idxOf(["word","korean","kr","han","韓文","單字"]);
        const idxZhCol      = idxOf(["zh","chinese","cn","中文","翻譯","釋義"]);

        // 單字表判斷：有 word 欄位，且 (有 songId 或 有 專輯+歌曲)
        const isVocab  = (idxWord >= 0) && (idxSongId >= 0 || (idxAlbumTitle >= 0 && idxSongTitle >= 0));


        if (isAlbums) {
          // albums: albumId?, title, releaseDate, cover?
          const idx = {
            albumId: header.indexOf("albumid"),
            title: header.indexOf("title"),
            release: header.indexOf("releasedate"),
            cover: header.indexOf("cover"),
          };
          const payload = rows.slice(1).filter(r=>r.length>1);
          setData(d => {
            const map: Record<string, Album> = {};
            // 先把現有放進 map（利於覆蓋）
            for (const a of d.albums) map[a.id] = { ...a, songs: [...a.songs] };
            const order: Album[] = [];
            for (const r of payload) {
              const aid = (idx.albumId>=0 ? (r[idx.albumId]||"").trim() : "") || uid();
              const title = (r[idx.title]||"").trim();
              const releaseDate = (r[idx.release]||"").trim();
              const cover = idx.cover>=0 ? (r[idx.cover]||"").trim() : "";
              const exist = map[aid];
              const album: Album = exist ? { ...exist, title: title||exist.title, releaseDate: releaseDate||exist.releaseDate, cover: cover||exist.cover } : { id: aid, title: title||"(未命名)", releaseDate: releaseDate||today(), cover, songs: [] };
              map[aid] = album;
              order.push(album);
            }
            // 以 CSV 順序重建（保留舊的但未出現在 CSV 的放在後面）
            const rest = d.albums.filter(a => !order.find(x => x.id === a.id));
            return { ...d, albums: [...order, ...rest] };
          });
          alert("已匯入專輯（含排序）");
          return;
        }
        if (isSongs) {
          // songs: albumId, songId?, title, releaseDate?
          const idx = {
            albumId: header.indexOf("albumid"),
            songId: header.indexOf("songid"),
            title: header.indexOf("title"),
            release: header.indexOf("releasedate"),
          };
          const payload = rows.slice(1).filter(r=>r.length>1);
          setData(d => {
            const nextAlbums = d.albums.map(a => ({ ...a, songs: [...a.songs] }));
            for (const r of payload) {
              const albumId = (r[idx.albumId]||"").trim();
              const songId = idx.songId>=0 ? (r[idx.songId]||"").trim() : "";
              const title = (r[idx.title]||"").trim();
              const releaseDate = (idx.release>=0 ? (r[idx.release]||"").trim() : "");
              const ai = nextAlbums.findIndex(a => a.id === albumId);
              if (ai < 0) continue;
              if (songId) {
                const si = nextAlbums[ai].songs.findIndex(s => s.id === songId);
                if (si >= 0) { nextAlbums[ai].songs[si] = { ...nextAlbums[ai].songs[si], title: title||nextAlbums[ai].songs[si].title, releaseDate: releaseDate||nextAlbums[ai].songs[si].releaseDate }; }
                else nextAlbums[ai].songs.push({ id: songId, title: title||"(未命名)", releaseDate, lyrics: [], vocab: [], grammar: [] });
              } else {
                nextAlbums[ai].songs.push({ id: uid(), title: title||"(未命名)", releaseDate, lyrics: [], vocab: [], grammar: [] });
              }
            }
            return { ...d, albums: nextAlbums };
          });
          alert("已匯入歌曲");
          return;
        }
        if (isLyrics) {
          // lyrics: songId, line, kor, zh
          const idx = {
            songId: header.indexOf("songid"),
            line: header.indexOf("line"),
            kor: header.indexOf("kor"),
            zh: header.indexOf("zh"),
          };
          const grouped: Record<string, { line: number; kor: string; zh: string }[]> = {};
          for (const r of rows.slice(1)) {
            const sid = (r[idx.songId]||"").trim(); if (!sid) continue;
            const line = Number(r[idx.line]||"0") || 0;
            const kor = (r[idx.kor]||"").trim();
            const zh  = (r[idx.zh ]||"").trim();
            (grouped[sid] ||= []).push({ line, kor, zh });
          }
          setData(d => ({
            ...d,
            albums: d.albums.map(a => ({
              ...a,
              songs: a.songs.map(s => grouped[s.id]
                ? { ...s, lyrics: grouped[s.id].sort((x,y)=>x.line-y.line).map(x => ({ id: uid(), kor: x.kor, zh: x.zh })) }
                : s
              )
            }))
          }));
          alert("已匯入歌詞");
          return;
        }

        
        if (isVocab) {
        const payload = rows.slice(1).filter(r => r.length > 0);

        setData(d => {
          const grouped: Record<string, { word: string; zh: string }[]> = {};
          let matched = 0, skipped = 0;

          for (const r of payload) {
            // 解析欄位
            const sidRaw = idxSongId >= 0 ? (r[idxSongId] || "").trim() : "";
            const albumName = idxAlbumTitle >= 0 ? (r[idxAlbumTitle] || "").trim() : "";
            const songName  = idxSongTitle  >= 0 ? (r[idxSongTitle ] || "").trim() : "";
            const word = (r[idxWord] || "").trim();
            const zh   = idxZhCol >= 0 ? (r[idxZhCol] || "").trim() : "";

            if (!word) { skipped++; continue; }

            // 解析目標 songId：優先用 songId，否則用「專輯名+歌名」匹配
            let sid = sidRaw;
            if (!sid) {
              const album = d.albums.find(a => a.title.trim() === albumName);
              const song  = album?.songs.find(s => s.title.trim() === songName);
              sid = song?.id || "";
            }

            if (!sid) { skipped++; continue; }
            (grouped[sid] ||= []).push({ word, zh });
            matched++;
          }

          const next = {
            ...d,
            albums: d.albums.map(a => ({
              ...a,
              songs: a.songs.map(s => grouped[s.id]
                ? { ...s, vocab: grouped[s.id].map(x => ({ id: uid(), word: x.word, zh: x.zh })) } // 覆寫該歌單字表
                : s
              )
            }))
          };

          // 提示結果（可移除）
          alert(`已匯入單字：${matched} 筆；找不到歌曲：${skipped} 行`);
          return next;
        });

        return;
      }


        alert("無法辨識的 CSV 表頭，請先下載範本查看欄位。");
      } catch (e) {
        alert("CSV 解析失敗");
      }
    };
    reader.readAsText(file);
  }

  // 匯出/匯入選單（CSV）
  const CSVMenu = (
    <>
      {/* 匯出 */}
      <div className="px-3 py-1 text-xs text-zinc-500">匯出 CSV</div>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportAlbumsCSV}>專輯（含排序）</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportSongsCSV}>歌曲清單</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportLyricsCSVAll}>歌詞</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportVocabCSVAll}>單字</button>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5" onClick={exportGrammarCSVAll}>文法</button>
      <div className="my-1 border-t" />
      {/* 範本 */}
      <div className="px-3 py-1 text-xs text-zinc-500">下載範本</div>
      <div className="grid grid-cols-2 gap-1 px-2 pb-1">
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5" onClick={()=>downloadTemplate("albums")}>專輯</button>
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5" onClick={()=>downloadTemplate("songs")}>歌曲</button>
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5" onClick={()=>downloadTemplate("lyrics")}>歌詞</button>
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5" onClick={()=>downloadTemplate("vocab")}>單字</button>
        <button className="rounded-md border px-2 py-1 text-left text-xs hover:bg-black/5" onClick={()=>downloadTemplate("grammar")}>文法</button>
      </div>
      <div className="my-1 border-t" />
      {/* 匯入 */}
      <div className="px-3 py-1 text-xs text-zinc-500">匯入 CSV</div>
      <label className="block w-full cursor-pointer px-3 py-1 text-left hover:bg-black/5">
        選擇檔案
        <input type="file" className="hidden" accept=".csv,text/csv" onChange={e=>{ const f=e.target.files?.[0]; if (f) importCSV(f); }}/>
      </label>
      <div className="px-3 pb-2 pt-1 text-[11px] leading-5 text-zinc-500">
        建議流程：先下載「範本」確認欄位 → 編輯 → 再用「匯入 CSV」。
        <br/>※ 歌詞/單字/文法的匯入會以 <b>songId</b> 指向歌曲並覆寫該類別內容。
      </div>
    </>
  );

  // New menu（把「新增歌曲」放第一）
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
              {/* 搜尋下拉略 */}
              <DropMenu label="匯入 / 匯出（CSV）" items={CSVMenu} />
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

/* 拆出主內容（維持原功能） */
function MainArea({ data, selected, updateSong }:{
  data: AppData;
  selected: { albumId: string; songId: string } | null;
  updateSong: (songId: string, patch: Partial<Song>)=>void;
}) {

  const current = useMemo(() => {
    if (!selected) return null as { album: Album; song: Song } | null;
    const album = data.albums.find(a => a.id === selected.albumId); if (!album) return null;
    const song = album.songs.find(s => s.id === selected.songId); if (!song) return null;
    return { album, song };
  }, [data, selected]);

  const [tab, setTab] = useState<'lyrics' | 'vocab' | 'flash' | 'grammar'>('lyrics');
  const [editMode, setEditMode] = useState(false);

  return (
    <div className="min-w-0 flex-1 space-y-4">
      {current ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <SongTitleEditable
                title={current.song.title}
                onSave={(nextTitle)=>{
                  // 就地更新歌名
                  const sid = current.song.id;
                  updateSong(sid, { title: nextTitle });
                }}
              />
              <div className="text-xs text-zinc-500">{current.album.title} • {current.song.releaseDate || current.album.releaseDate}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TabButton active={tab==='lyrics'} onClick={()=>setTab('lyrics')}>歌詞</TabButton>
              <TabButton active={tab==='vocab'}  onClick={()=>setTab('vocab')}>單字表</TabButton>
              <TabButton active={tab==='flash'}  onClick={()=>setTab('flash')}>單字卡</TabButton>
              <TabButton active={tab==='grammar'} onClick={()=>setTab('grammar')}>文法</TabButton>
            </div>
          </div>

          {tab==='lyrics'  && <LyricsPanel  song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} editMode={editMode} setEditMode={setEditMode} />}
          {tab==='vocab'   && <VocabPanel   song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
          {tab==='flash'   && <FlashcardPanel song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
          {tab==='grammar' && <GrammarPanel  song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
        </>
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

function AddSongModal({ open, onClose, onSubmit, albums, defaultAlbumId }: { open: boolean; onClose: () => void; onSubmit: (payload: { albumId: string; title: string; releaseDate?: string; kor: string; zh: string }) => void; albums: Album[]; defaultAlbumId?: string }) {
  const [albumId, setAlbumId] = useState<string>(defaultAlbumId || albums[0]?.id || "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kor, setKor] = useState("");
  const [zh , setZh ] = useState("");

  useEffect(()=>{ if (open) { setAlbumId(defaultAlbumId || albums[0]?.id || ""); setTitle(""); setDate(""); setKor(""); setZh(""); } }, [open, defaultAlbumId, albums.length]);

  return (
    <Modal open={open} onClose={onClose} title="新增歌曲">
      <form onSubmit={(e)=>{ e.preventDefault(); if (!albumId || !title.trim()) return; onSubmit({ albumId, title: title.trim(), releaseDate: date, kor, zh }); }} className="space-y-3">
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
        <div>
          <div className="mb-1 text-xs text-zinc-500">歌名</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2" placeholder="例如：Congratulations"/>
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
