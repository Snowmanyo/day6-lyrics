import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== Types ===================== */
type LyricLine = { id: string; kor: string; zh: string };
type VocabItem = { id: string; word: string; zh?: string };
type GrammarPoint = { id: string; pattern: string; explain?: string };
type Song = { id: string; title: string; releaseDate?: string; lyrics: LyricLine[]; vocab: VocabItem[]; grammar: GrammarPoint[] };
type Album = { id: string; title: string; releaseDate: string; cover?: string; songs: Song[] };
type AppData = { artist: string; albums: Album[]; updatedAt: string; version: string };

/* ===================== Helpers ===================== */
const HAMBURGER = "\u2630"; // ☰
const DOTS = "⋮⋮";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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
const isHangul = (s: string) => /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(s);
function tokenizeKorean(text: string) {
  return (text || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/)
    .filter(Boolean)
    .filter(isHangul);
}
function toCSV(rows: string[][]) {
  return rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g,'""') + '"').join(',')).join("\n");
}
function fileToDataURL(file: File): Promise<string> {
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result||"")); fr.readAsDataURL(file); });
}

/* ===================== Seed ===================== */
const SEED: AppData = {
  artist: "DAY6",
  version: "2.3.0",
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
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-black text-white dark:bg-white dark:text-black' : 'border hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10'}`}>{children}</button>
  );
}
function ToolbarButton({ children, onClick, type = 'button' }: { children: React.ReactNode; onClick?: () => void; type?: 'button'|'submit'|'reset' }) {
  return <button type={type} onClick={onClick} className="shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm hover:bg-black/5 active:scale-[0.99] dark:border-zinc-700 dark:hover:bg-white/10">{children}</button>;
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
        <div className="absolute right-0 z-[9999] mt-1 w-56 overflow-hidden rounded-lg border bg-white py-1 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
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
      <div className="relative z-[9600] w-[min(680px,92vw)] rounded-2xl border bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between"><div className="text-lg font-semibold">{title}</div><ToolbarButton onClick={onClose}>關閉</ToolbarButton></div>
        {children}
      </div>
    </div>
  );
}

/* ===================== Desktop Sidebar ===================== */
function DesktopSidebar({
  data, selected, onSelect,
  sortMode, onToggleSort,
  editingAlbumId, onToggleAlbumEdit,
  onUpdateAlbum, onUploadAlbumCover,
  onReorderAlbum, onReorderSong, onDeleteSong
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
}) {
  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-r p-3 dark:border-zinc-800">
      {/* Top bar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">專輯 / 歌曲</div>
        <button
          onClick={()=>{ if (editingAlbumId) onToggleAlbumEdit(null); onToggleSort(); }}
          className={`rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10 ${sortMode ? 'bg-black/5 dark:bg-white/10' : ''}`}
          title="切換排序模式（桌面可拖曳）"
        >
          {sortMode ? '完成' : '排序'}
        </button>
      </div>

      {/* Album cards */}
      <div className="space-y-3">
        {data.albums.map((a, albumIdx) => {
          const editing = editingAlbumId === a.id;
          return (
            <div
              key={a.id}
              className={`overflow-hidden rounded-xl border bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/60 ${sortMode ? 'cursor-grab' : ''}`}
              draggable={sortMode}
              onDragStart={(e)=>{ if (!sortMode) return; e.dataTransfer.setData('type','album'); e.dataTransfer.setData('from', String(albumIdx)); }}
              onDragOver={(e)=>{ if (!sortMode) return; if (e.dataTransfer.getData('type')==='album') e.preventDefault(); }}
              onDrop={(e)=>{ if (!sortMode) return; if (e.dataTransfer.getData('type')==='album') { const from = Number(e.dataTransfer.getData('from')); onReorderAlbum(from, albumIdx); } }}
            >
              {/* Header */}
              {!editing ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60">
                      {a.cover ? <img src={a.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">無封面</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.title}</div>
                      <div className="truncate text-xs text-zinc-500">{a.releaseDate}</div>
                    </div>
                  </div>
                  {!sortMode && (
                    <button
                      onClick={()=>onToggleAlbumEdit(a.id)}
                      className="shrink-0 rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
                      title="編輯專輯"
                    >✎</button>
                  )}
                </div>
              ) : (
                <div className="mb-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60">
                        {a.cover ? <img src={a.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">無封面</div>}
                      </div>
                      <div className="min-w-0">
                        <input
                          value={a.title}
                          onChange={e=>onUpdateAlbum(a.id,{title:e.target.value})}
                          className="w-full truncate rounded-md border px-2 py-1 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <input
                          type="date"
                          value={a.releaseDate}
                          onChange={e=>onUpdateAlbum(a.id,{releaseDate:e.target.value})}
                          className="mt-1 w-full truncate rounded-md border px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </div>
                    </div>
                    <button
                      onClick={()=>onToggleAlbumEdit(null)}
                      className="shrink-0 rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
                      title="完成編輯"
                    >完成</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">
                      上傳封面
                      <input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if (f) onUploadAlbumCover(a.id, f); }} />
                    </label>
                    {a.cover && <button onClick={()=>onUpdateAlbum(a.id,{cover:""})} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">清除封面</button>}
                  </div>
                </div>
              )}

              {/* Song list */}
              <ul className="space-y-1">
                {a.songs.map((s, songIdx) => (
                  <li
                    key={s.id}
                    className={`${sortMode ? 'cursor-grab' : ''}`}
                    draggable={sortMode}
                    onDragStart={(e)=>{ if (!sortMode) return; e.dataTransfer.setData('type','song'); e.dataTransfer.setData('aid', a.id); e.dataTransfer.setData('from', String(songIdx)); }}
                    onDragOver={(e)=>{ if (!sortMode) return; const t = e.dataTransfer.getData('type'); const aid = e.dataTransfer.getData('aid'); if (t==='song' && aid===a.id) e.preventDefault(); }}
                    onDrop={(e)=>{ if (!sortMode) return; const t = e.dataTransfer.getData('type'); const aid = e.dataTransfer.getData('aid'); if (t==='song' && aid===a.id) { const from = Number(e.dataTransfer.getData('from')); onReorderSong(a.id, from, songIdx); } }}
                  >
                    {/* 關鍵：用 grid [1fr,auto] + min-w-0，刪除鍵不會把文字擠出外框 */}
                    <div className="grid w-full grid-cols-[1fr,auto] items-center gap-2">
                      <button
                        onClick={()=>onSelect(a.id, s.id)}
                        className={`min-w-0 rounded-lg px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10 ${selected?.songId===s.id ? 'bg-black/5 font-medium dark:bg-white/10' : ''}`}
                        title={sortMode ? '拖曳以排序' : '開啟歌曲'}
                      >
                        <div className="truncate">{sortMode ? `${DOTS} ` : ''}{s.title}</div>
                      </button>

                      {/* 刪除鍵：只有在「該專輯的編輯模式」才顯示 */}
                      {editing && !sortMode ? (
                        <button
                          onClick={(e)=>{ e.stopPropagation(); onDeleteSong(a.id, s.id); }}
                          className="shrink-0 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10"
                          title="刪除此歌曲"
                        >×</button>
                      ) : null}
                    </div>
                  </li>
                ))}
                {a.songs.length===0 && <li className="px-2 py-1 text-xs text-zinc-500">（此專輯尚無歌曲）</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ===================== Mobile Drawer（不做拖曳/編輯） ===================== */
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
      <div className={`absolute left-0 top-0 h-full w-[300px] transform bg-white shadow-2xl transition-transform dark:bg-zinc-900 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between gap-2 border-b p-3 dark:border-zinc-800">
          <div className="font-semibold">專輯 / 歌曲</div>
          <div className="flex gap-2">
            <button onClick={onOpenAddAlbum} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">+ 專輯</button>
            <button className="rounded-lg border px-2 py-1 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={onClose}>關閉</button>
          </div>
        </div>
        <div className="h-[calc(100%-49px)] space-y-3 overflow-auto p-3">
          {data.albums.sort((a,b)=>a.releaseDate.localeCompare(b.releaseDate)).map(a => (
            <div key={a.id} className="rounded-xl border p-2 dark:border-zinc-800">
              <div className="mb-1 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.title}</div>
                  <div className="truncate text-xs text-zinc-500">{a.releaseDate}</div>
                </div>
                <button onClick={()=>onOpenAddSong(a.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">+ 歌曲</button>
              </div>
              <ul className="space-y-1">
                {a.songs.map(s => (
                  <li key={s.id}>
                    <button onClick={()=>{onSelect(a.id, s.id); onClose();}} className={`w-full rounded-lg px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10 ${selected?.songId===s.id ? 'bg-black/5 font-medium dark:bg-white/10' : ''}`}>
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

/* ===================== Panels（保持不變） ===================== */
function LyricsPanel({ song, onUpdate, editMode, setEditMode }: { song: Song; onUpdate: (patch: Partial<Song>)=>void; editMode: boolean; setEditMode: (v:boolean)=>void; }) {
  const kor = useMemo(()=> song.lyrics.map(l=>l.kor).join("\n"), [song.lyrics]);
  const zh  = useMemo(()=> song.lyrics.map(l=>l.zh ).join("\n"), [song.lyrics]);
  const aligned = useMemo(()=> alignLyrics(kor, zh), [kor, zh]);
  function writeFromText(korRaw: string, zhRaw: string) {
    const rows = alignLyrics(korRaw, zhRaw).map(r => ({ id: uid(), kor: r.kor, zh: r.zh }));
    onUpdate({ lyrics: rows });
  }
  return (
    <div className="rounded-2xl border bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium">中韓對照</div>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={editMode} onChange={e=>setEditMode(e.target.checked)} /> 編輯模式</label>
      </div>
      {editMode && (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">韓文歌詞（每行一句）</div>
            <textarea defaultValue={kor} onChange={e=>writeFromText(e.target.value, zh)} className="h-48 w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">中文歌詞（每行一句）</div>
            <textarea defaultValue={zh} onChange={e=>writeFromText(kor, e.target.value)} className="h-48 w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>
      )}
      <div className="mt-4">
        <div className="mb-2 text-sm font-medium">對照預覽</div>
        <div className="max-h-[300px] overflow-auto rounded-xl border bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60">
          {aligned.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 border-b px-3 py-2 last:border-none">
              <div className="col-span-6 whitespace-pre-wrap">{l.kor || <span className="text-zinc-400">(空)</span>}</div>
              <div className="col-span-6 whitespace-pre-wrap">{l.zh  || <span className="text-zinc-400">(空)</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function VocabPanel({ song, onUpdate }: { song: Song; onUpdate: (patch: Partial<Song>)=>void }) {
  const [filter, setFilter] = useState("");
  const list = useMemo(() => song.vocab.filter(v => {
    const q = filter.trim(); if (!q) return true; return (v.word||"").includes(q) || (v.zh||"").includes(q);
  }), [song.vocab, filter]);
  function add() { onUpdate({ vocab: [{ id: uid(), word: "", zh: "" }, ...song.vocab] }); }
  function up(id: string, patch: Partial<VocabItem>) { onUpdate({ vocab: song.vocab.map(v => v.id===id ? { ...v, ...patch } : v) }); }
  function del(id: string) { onUpdate({ vocab: song.vocab.filter(v => v.id!==id) }); }
  return (
    <div className="rounded-2xl border bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">單字表（含中文）</div>
        <div className="flex items-center gap-2"><ToolbarButton onClick={add}>+ 新增單字</ToolbarButton><input placeholder="過濾…" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"/></div>
      </div>
      <div className="overflow-auto rounded-xl border dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-white/70 dark:bg-zinc-900/60"><tr className="border-b text-left dark:border-zinc-800"><th className="w-1/2 px-3 py-2">韓文</th><th className="w-1/2 px-3 py-2">中文</th><th className="w-28 px-3 py-2 text-right">操作</th></tr></thead>
          <tbody>
            {list.map(v => (
              <tr key={v.id} className="border-b dark:border-zinc-800">
                <td className="px-3 py-2"><input value={v.word} onChange={e=>up(v.id,{word:e.target.value})} className="w-full bg-transparent outline-none"/></td>
                <td className="px-3 py-2"><input value={v.zh||""} onChange={e=>up(v.id,{zh:e.target.value})} className="w-full bg-transparent outline-none"/></td>
                <td className="px-3 py-2 text-right"><button onClick={()=>del(v.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">刪除</button></td>
              </tr>
            ))}
            {list.length===0 && (<tr><td colSpan={3} className="px-3 py-6 text-center text-zinc-500">沒有符合條件的單字</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function GrammarPanel({ song, onUpdate }: { song: Song; onUpdate: (patch: Partial<Song>)=>void }) {
  function add() { onUpdate({ grammar: [{ id: uid(), pattern: "", explain: "" }, ...song.grammar] }); }
  function up(id: string, patch: Partial<GrammarPoint>) { onUpdate({ grammar: song.grammar.map(g => g.id===id ? { ...g, ...patch } : g) }); }
  function del(id: string) { onUpdate({ grammar: song.grammar.filter(g => g.id!==id) }); }
  return (
    <div className="rounded-2xl border bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 flex items-center justify-between"><div className="text-sm font-medium">文法點</div><ToolbarButton onClick={add}>+ 新增文法</ToolbarButton></div>
      <div className="space-y-3">
        {song.grammar.map(g => (
          <div key={g.id} className="rounded-xl border p-3 dark:border-zinc-800">
            <div className="grid grid-cols-12 gap-2">
              <input value={g.pattern} onChange={e=>up(g.id,{pattern:e.target.value})} placeholder="如：-았/었-、-(으)니까" className="col-span-12 md:col-span-4 rounded-lg border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"/>
              <textarea value={g.explain||""} onChange={e=>up(g.id,{explain:e.target.value})} placeholder="說明" className="col-span-12 md:col-span-8 min-h-[60px] rounded-lg border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"/>
            </div>
            <div className="mt-2 text-right"><button onClick={()=>del(g.id)} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">刪除</button></div>
          </div>
        ))}
        {song.grammar.length===0 && <div className="py-6 text-center text-sm text-zinc-500">尚未新增文法點</div>}
      </div>
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
    <div className="rounded-2xl border bg-white/70 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 text-sm">尚無單字</div>
      <ToolbarButton onClick={()=>{
        const toks = Array.from(new Set(tokenizeKorean(song.lyrics.map(l=>l.kor).join('\n'))));
        onUpdate({ vocab: toks.map(t => ({ id: uid(), word: t, zh: '' })) });
      }}>從歌詞自動擷取</ToolbarButton>
    </div>
  );
  if (current == null) return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 text-sm">本輪完成！</div>
      <ToolbarButton onClick={() => { setQueue(vocab.map((_, i) => i)); setMeta(vocab.map(() => ({ firstSeen: false }))); }}>重新開始</ToolbarButton>
    </div>
  );
  return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 text-xs text-zinc-500">單字卡　已看過：{firstSeenCount}/{total}</div>
      <div className="text-2xl font-bold">{current.word}</div>
      <div className="mt-2 text-lg text-zinc-600 dark:text-zinc-300">{reveal ? (current.zh||'（尚未填中文）') : '———'}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2"><ToolbarButton onClick={()=>setReveal(r=>!r)}>{reveal?'隱藏':'顯示解答'}</ToolbarButton></div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button onClick={()=>grade('again')} className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">不熟</button>
        <button onClick={()=>grade('good')}  className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">一般</button>
        <button onClick={()=>grade('easy')}  className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">很熟</button>
      </div>
    </div>
  );
}

/* ===================== Inline title editor ===================== */
function SongTitleEditable({ title, onSave }: { title: string; onSave: (t: string)=>void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
  useEffect(()=>{ setVal(title); }, [title]);
  if (!editing) {
    return (
      <div className="text-2xl font-bold flex items-center gap-2">
        <span className="truncate">{title}</span>
        <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={()=>setEditing(true)} title="編輯歌名">✎</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input value={val} onChange={e=>setVal(e.target.value)} className="text-2xl font-bold rounded-md border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" autoFocus />
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={()=>{ onSave(val.trim() || title); setEditing(false); }}>儲存</button>
      <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={()=>{ setVal(title); setEditing(false); }}>取消</button>
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

  // modes
  const [sortMode, setSortMode] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string|null>(null);

  // DnD helpers
  function arrayMove<T>(arr: T[], from: number, to: number) {
    const next = [...arr];
    const item = next.splice(from, 1)[0];
    next.splice(to < 0 ? 0 : to, 0, item);
    return next;
  }
  function reorderAlbum(fromIdx: number, toIdx: number) { if (fromIdx!==toIdx) setData(d => ({ ...d, albums: arrayMove(d.albums, fromIdx, toIdx) })); }
  function reorderSong(albumId: string, fromIdx: number, toIdx: number) {
    if (fromIdx===toIdx) return;
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId); if (ai < 0) return d;
      const album = d.albums[ai];
      const nextAlbums = [...d.albums]; nextAlbums[ai] = { ...album, songs: arrayMove(album.songs, fromIdx, toIdx) };
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
  function updateAlbum(albumId: string, patch: Partial<Album>) {
    setData(d => ({ ...d, albums: d.albums.map(a => a.id===albumId ? { ...a, ...patch } : a) }));
  }
  async function uploadAlbumCover(albumId: string, file: File) {
    const dataUrl = await fileToDataURL(file); updateAlbum(albumId, { cover: dataUrl });
  }

  // selection & current
  const [selected, setSelected] = useState<{ albumId: string; songId: string } | null>(() => {
    const a0 = data.albums[0]; const s0 = a0?.songs[0]; return a0 && s0 ? { albumId: a0.id, songId: s0.id } : null;
  });
  const current = useMemo(() => {
    if (!selected) return null as { album: Album; song: Song } | null;
    const album = data.albums.find(a => a.id === selected.albumId); if (!album) return null;
    const song = album.songs.find(s => s.id === selected.songId); if (!song) return null;
    return { album, song };
  }, [data, selected]);

  // UI state
  const [dark, setDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [tab, setTab] = useState<'lyrics' | 'vocab' | 'flash' | 'grammar'>('lyrics');
  const [editMode, setEditMode] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    try { const savedTheme = localStorage.getItem('lyrics_theme'); const isDark = savedTheme === 'dark'; setDark(isDark); document.documentElement.classList.toggle('dark', isDark); } catch {}
    try { const side = localStorage.getItem('lyrics_sidebar'); if (side === 'closed') setSidebarVisible(false); } catch {}
  }, []);
  const toggleDark = () => {
    const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); try { localStorage.setItem('lyrics_theme', next ? 'dark' : 'light'); } catch {}
  };
  const toggleSidebar = () => {
    setSidebarVisible(v => { const next = !v; try { localStorage.setItem('lyrics_sidebar', next ? 'open' : 'closed'); } catch {} return next; });
  };

  // song CRUD
  function addAlbumImpl(title: string, releaseDate: string, cover?: string) {
    const album: Album = { id: uid(), title, releaseDate, cover: cover || "", songs: [] };
    setData(d => ({ ...d, albums: [...d.albums, album] }));
  }
  function addSongImpl(payload: { albumId: string; title: string; releaseDate?: string; kor: string; zh: string }) {
    const { albumId, title, releaseDate = '' , kor, zh } = payload;
    const lyrics: LyricLine[] = alignLyrics(kor, zh).map(l => ({ id: uid(), kor: l.kor, zh: l.zh }));
    const song: Song = { id: uid(), title, releaseDate, lyrics, vocab: [], grammar: [] };
    setData(d => ({ ...d, albums: d.albums.map(a => a.id===albumId ? { ...a, songs: [...a.songs, song] } : a) }));
    setSelected({ albumId, songId: song.id }); setTab('lyrics');
  }
  function updateSong(songId: string, patch: Partial<Song>) {
    setData(d => ({ ...d, albums: d.albums.map(a => ({ ...a, songs: a.songs.map(s => s.id===songId ? { ...s, ...patch } : s) })) }));
  }

  // import/export
  function exportJSON() {
    download(`day6-lyrics-${Date.now()}.json`, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2));
  }
  function importJSON(file: File) {
    const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); setData(parsed); } catch { alert('JSON 解析失敗'); } }; reader.readAsText(file);
  }
  function exportLyricsCSV(song: Song) {
    const rows = [["#","kor","zh"], ...song.lyrics.map((l,i)=>[String(i+1), l.kor, l.zh])]; download(`lyrics-${song.title}.csv`, toCSV(rows));
  }
  function exportVocabCSV(song: Song) {
    const rows = [["word","zh"], ...song.vocab.map(v=>[v.word, v.zh||""])]; download(`vocab-${song.title}.csv`, toCSV(rows));
  }
  function exportGrammarCSV(song: Song) {
    const rows = [["pattern","explain"], ...song.grammar.map(g=>[g.pattern, g.explain||""])]; download(`grammar-${song.title}.csv`, toCSV(rows));
  }

  // search
  const searchResults = useMemo(() => {
    const q = query.trim(); if (!q) return [] as { album: Album; song: Song; where: string; snippet: string }[];
    const out: { album: Album; song: Song; where: string; snippet: string }[] = [];
    for (const a of data.albums) {
      for (const s of a.songs) {
        if (s.title.toLowerCase().includes(q.toLowerCase())) out.push({ album: a, song: s, where: '歌名', snippet: s.title });
        for (const l of s.lyrics) { if (l.kor.includes(q) || l.zh.includes(q)) out.push({ album: a, song: s, where: '歌詞', snippet: (l.kor+" / "+l.zh).slice(0,80) }); }
        for (const v of s.vocab) { if ((v.word||'').includes(q) || (v.zh||'').includes(q)) out.push({ album: a, song: s, where: '單字', snippet: `${v.word} - ${v.zh||''}` }); }
        for (const g of s.grammar) { if (g.pattern.includes(q) || (g.explain||'').includes(q)) out.push({ album: a, song: s, where: '文法', snippet: `${g.pattern} - ${(g.explain||'').slice(0,60)}` }); }
      }
    }
    return out.slice(0, 100);
  }, [query, data]);

  // header menus
  const ImportExportMenu = (
    <>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={exportJSON}>匯出 JSON（全站）</button>
      {current && (
        <>
          <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>exportLyricsCSV(current.song)}>匯出歌詞 CSV（此歌）</button>
          <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>exportVocabCSV(current.song)}>匯出單字 CSV（此歌）</button>
          <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>exportGrammarCSV(current.song)}>匯出文法 CSV（此歌）</button>
        </>
      )}
      <label className="block w-full cursor-pointer px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10">匯入 JSON<input type="file" className="hidden" accept="application/json" onChange={e=>{ const f=e.target.files?.[0]; if (f) importJSON(f); }}/></label>
    </>
  );
  const NewMenu = (
    <>
      <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>setModal({ type: 'album' })}>新增專輯</button>
      {current && <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>setModal({ type: 'song', albumId: current.album.id })}>新增歌曲（此專輯）</button>}
    </>
  );

  // modal
  const [modal, setModal] = useState<{ type: null | 'album' | 'song'; albumId?: string }>({ type: null });
  const AddAlbumForm = (
    <AddAlbumModal
      open={modal.type==='album'}
      onClose={()=>setModal({ type: null })}
      onSubmit={(payload)=>{ addAlbumImpl(payload.title, payload.releaseDate, payload.cover); setModal({ type: null }); }}
    />
  );
  const AddSongForm = (
    <AddSongModal
      open={modal.type==='song'}
      onClose={()=>setModal({ type: null })}
      albums={data.albums}
      defaultAlbumId={modal.albumId}
      onSubmit={(p)=>{ addSongImpl(p); setModal({ type: null }); }}
    />
  );

  return (
    <div className="min-h-screen bg-amber-50/40 text-gray-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="mx-auto max-w-[1280px] px-4">
          <div className="flex flex-nowrap items-center gap-2 py-3">
            <button className="shrink-0 rounded-lg border px-2 py-1 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" title="切換側邊選單" onClick={() => {
              if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) toggleSidebar(); else setDrawerOpen(true);
            }}>{HAMBURGER} 選單</button>
            <div className="min-w-0 shrink-0 truncate whitespace-nowrap text-xl font-bold">DAY6 歌詞學韓文</div>
            <div className="relative ml-auto flex flex-nowrap items-center gap-2">
              <input placeholder="搜尋：歌名 / 歌詞 / 單字 / 文法" value={query} onChange={e=>setQuery(e.target.value)} className="w-60 max-w-[40vw] shrink-0 rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring dark:border-zinc-700 dark:bg-zinc-900 md:w-72" />
              {query && searchResults.length>0 && (
                <div className="absolute right-32 top-full z-[2000] mt-1 max-h-[50vh] w-[480px] overflow-auto rounded-lg border bg-white p-2 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  {searchResults.map((r,i)=>(
                    <button key={i} onClick={()=>{ setSelected({ albumId: r.album.id, songId: r.song.id }); setTab('lyrics'); setQuery(''); }} className="block w-full rounded-md px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10">
                      <div><span className="font-medium">[{r.where}]</span> {r.album.title} • {r.song.title}</div>
                      <div className="truncate text-xs text-zinc-500">{r.snippet}</div>
                    </button>
                  ))}
                </div>
              )}
              <ToolbarButton onClick={toggleDark}>{dark ? '深色' : '淺色'}</ToolbarButton>
              <DropMenu label="匯入 / 匯出" items={ImportExportMenu} />
              <DropMenu label="新增" items={NewMenu} />
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <div className="md:flex md:gap-4">
          {sidebarVisible && (
            <div className="hidden w-[280px] shrink-0 rounded-xl border bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/60 md:block">
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
              />
            </div>
          )}

          {/* Main */}
          <div className="min-w-0 flex-1 space-y-4">
            {current ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <SongTitleEditable
                      title={current.song.title}
                      onSave={(nextTitle)=>{
                        setData(d => {
                          const ai = d.albums.findIndex(a => a.id === current.album.id);
                          if (ai < 0) return d;
                          const si = d.albums[ai].songs.findIndex(s => s.id === current.song.id);
                          if (si < 0) return d;
                          const nextAlbums = [...d.albums];
                          const targetAlbum = nextAlbums[ai];
                          const nextSongs = [...targetAlbum.songs];
                          nextSongs[si] = { ...nextSongs[si], title: nextTitle };
                          nextAlbums[ai] = { ...targetAlbum, songs: nextSongs };
                          return { ...d, albums: nextAlbums };
                        });
                      }}
                    />
                    <div className="text-xs text-zinc-500">{current.album.title} • {current.song.releaseDate || current.album.releaseDate}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <TabButton active={tab==='lyrics'} onClick={()=>setTab('lyrics')}>中韓對照</TabButton>
                    <TabButton active={tab==='vocab'}  onClick={()=>setTab('vocab')}>單字表</TabButton>
                    <TabButton active={tab==='flash'}  onClick={()=>setTab('flash')}>單字卡</TabButton>
                    <TabButton active={tab==='grammar'} onClick={()=>setTab('grammar')}>文法</TabButton>
                  </div>
                </div>

                {tab==='lyrics'  && <LyricsPanel  song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} editMode={editMode} setEditMode={v=>setEditMode(v)} />}
                {tab==='vocab'   && <VocabPanel   song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
                {tab==='flash'   && <FlashcardPanel song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
                {tab==='grammar' && <GrammarPanel  song={current.song} onUpdate={(p)=>updateSong(current.song.id, p)} />}
              </>
            ) : (
              <div className="rounded-2xl border bg-white/70 p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">請在左側選擇或新增一首歌曲</div>
            )}
          </div>
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

/* ===================== Add Album / Song Modals ===================== */
function AddAlbumModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (payload: { title: string; releaseDate: string; cover?: string }) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [cover, setCover] = useState<string | undefined>(undefined);

  useEffect(()=>{ if (open) { setTitle(""); setDate(new Date().toISOString().slice(0,10)); setCover(undefined); } }, [open]);

  function onPickFile(file?: File) {
    if (!file) { setCover(undefined); return; }
    fileToDataURL(file).then(setCover);
  }

  return (
    <Modal open={open} onClose={onClose} title="新增專輯">
      <form
        onSubmit={(e)=>{ e.preventDefault(); if (!title.trim()) return; onSubmit({ title: title.trim(), releaseDate: date || new Date().toISOString().slice(0,10), cover }); }}
        className="space-y-3"
      >
        <div>
          <div className="mb-1 text-xs text-zinc-500">專輯名稱</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" placeholder="例如：The Book of Us"/>
        </div>
        <div>
          <div className="mb-1 text-xs text-zinc-500">發佈日期</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"/>
        </div>
        <div>
          <div className="mb-1 text-xs text-zinc-500">封面圖片（可選）</div>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">
              選擇圖片
              <input type="file" accept="image/*" className="hidden" onChange={e=>onPickFile(e.target.files?.[0])}/>
            </label>
            <div className="h-16 w-16 overflow-hidden rounded-lg border bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60">
              {cover ? <img src={cover} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">預覽</div>}
            </div>
            {cover && <button type="button" className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={()=>setCover(undefined)}>清除</button>}
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
            <select value={albumId} onChange={e=>setAlbumId(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              {albums.map(a => (<option key={a.id} value={a.id}>{a.title}（{a.releaseDate}）</option>))}
            </select>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">發佈日（可空）</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"/>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-zinc-500">歌名</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" placeholder="例如：Congratulations"/>
        </div>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">韓文歌詞（每行一句）</div>
            <textarea value={kor} onChange={e=>setKor(e.target.value)} className="h-40 w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"/>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">中文歌詞（每行一句）</div>
            <textarea value={zh} onChange={e=>setZh(e.target.value)} className="h-40 w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"/>
          </div>
        </div>
        <div className="flex justify-end gap-2"><ToolbarButton onClick={onClose}>取消</ToolbarButton><ToolbarButton type="submit">新增</ToolbarButton></div>
      </form>
    </Modal>
  );
}
