// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";

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
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const saveKey = "day6-lyrics-appdata-v3";

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
  const out: LyricLine[] = [];
  for (let i = 0; i < max; i++) out.push({ id: uid(), kor: (kor[i] || "").trim(), zh: (zh[i] || "").trim() });
  // 收尾去掉完全空白行
  let last = out.length - 1;
  while (last >= 0 && out[last].kor === "" && out[last].zh === "") last--;
  return out.slice(0, last + 1);
}

function toTSV(rows: (string | number | null | undefined)[][]) {
  return rows.map(r => r.map(c => String(c ?? "")).join("\t")).join("\n");
}

/** 極簡 CSV 解析器（支援引號轉義） */
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
  // 去尾端全空白列
  while (rows.length && rows[rows.length - 1].every(c => c.trim() === "")) rows.pop();
  return rows;
}

function parseTable(text: string): string[][] {
  // 若包含 \t 視為 TSV，其餘走 CSV
  return text.includes("\t") ? text.split(/\r?\n/).map(r => r.split("\t")) : parseCSV(text);
}

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

function arrayMove<T>(arr: T[], from: number, to: number) {
  const next = [...arr];
  const item = next.splice(from, 1)[0];
  next.splice(to < 0 ? 0 : to, 0, item);
  return next;
}

/* ===================== Seed ===================== */
const SEED: AppData = {
  artist: "DAY6",
  version: "3.3.0",
  updatedAt: new Date().toISOString(),
  albums: [
    {
      id: uid(),
      title: "The Day",
      releaseDate: "2015-09-07",
      cover: "",
      songs: [
        { id: uid(), title: "Congratulations", releaseDate: "2015-09-07", lyricist: "", composer: "", lyrics: [], vocab: [], grammar: [] },
        { id: uid(), title: "Freely", releaseDate: "2015-09-07", lyricist: "", composer: "", lyrics: [], vocab: [], grammar: [] },
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
function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-[9600] w-[min(760px,92vw)] rounded-2xl border bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between"><div className="text-lg font-semibold">{title}</div><ToolbarButton onClick={onClose}>關閉</ToolbarButton></div>
        {children}
      </div>
    </div>
  );
}

/* ===================== Sidebar（含排序/刪歌/編輯專輯） ===================== */
function DesktopSidebar({
  data, selected, onSelect,
  sortMode, onToggleSort,
  editingAlbumId, onToggleAlbumEdit,
  onUpdateAlbum, onUploadAlbumCover,
  onReorderAlbum, onReorderSong, onDeleteSong,
  onDeleteAlbum,
  collapsed, onToggleCollapse,
  onOpenAddAlbum, onOpenAddSong,
  onOpenImportSingle
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
  onOpenAddAlbum: () => void; onOpenAddSong: (albumId: string) => void;
  onOpenImportSingle: () => void;
}) {
  return (
    <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-r p-3 md:block">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">專輯 / 歌曲</div>
        <div className="flex gap-2">
          <ToolbarButton onClick={onOpenImportSingle}>單檔匯入</ToolbarButton>
          <ToolbarButton onClick={onOpenAddAlbum}>+ 專輯</ToolbarButton>
          <button
            onClick={()=>{ if (editingAlbumId) onToggleAlbumEdit(null); onToggleSort(); }}
            className={`rounded-lg border px-2 py-1 text-xs hover:bg-black/5 ${sortMode ? 'bg-black/5' : ''}`}
            title="切換排序模式（上下移動）"
          >
            {sortMode ? '完成' : '排序'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {data.albums.map((a, albumIdx) => {
          const editing = editingAlbumId === a.id;
          const atTop = albumIdx === 0;
          const atBottom = albumIdx === data.albums.length - 1;
          const isCollapsed = !!collapsed[a.id];

          return (
            <div key={a.id} className="overflow-hidden rounded-xl border bg-white/70 p-2">
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
                      <div className="flex gap-1">
                        <button
                          onClick={()=>onOpenAddSong(a.id)}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5"
                          title="新增歌曲"
                        >+ 歌曲</button>
                        <button
                          onClick={()=>onToggleAlbumEdit(a.id)}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5"
                          title="編輯專輯"
                        >✎</button>
                      </div>
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
                          ) : (
                            <button
                              onClick={(e)=>{ e.stopPropagation(); if (confirm(`刪除歌曲「${s.title}」？`)) onDeleteSong(a.id, s.id); }}
                              className="shrink-0 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-black/5"
                              title="刪除此歌曲"
                            >×</button>
                          )}
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
    </aside>
  );
}

/* ===================== Main ===================== */
export default function App() {
  const [data, setData] = useState<AppData>(() => {
    const raw = localStorage.getItem(saveKey);
    if (raw) {
      try { return JSON.parse(raw) as AppData; } catch {}
    }
    return SEED;
  });
  const [selected, setSelected] = useState<{ albumId: string; songId: string } | null>(() => {
    const a = data.albums[0]; const s = a?.songs[0];
    return a && s ? { albumId: a.id, songId: s.id } : null;
  });

  useEffect(() => {
    localStorage.setItem(saveKey, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  }, [data]);

  const current = useMemo(() => {
    if (!selected) return null;
    const album = data.albums.find(a => a.id === selected.albumId);
    const song = album?.songs.find(s => s.id === selected.songId);
    if (!album || !song) return null;
    return { album, song };
  }, [data, selected]);

  // Sidebar UI states
  const [sortMode, setSortMode] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Modals
  const [modal, setModal] = useState<{ type: null | 'album' | 'song' | 'import-single'; albumId?: string }>({ type: null });

  /* ===== Mutations ===== */
  function addAlbum(title = "New Album") {
    setData(d => {
      const album: Album = { id: uid(), title, releaseDate: today(), cover: "", songs: [] };
      return { ...d, albums: [album, ...d.albums] };
    });
  }
  function updateAlbum(albumId: string, patch: Partial<Album>) {
    setData(d => {
      const i = d.albums.findIndex(a => a.id === albumId);
      if (i < 0) return d;
      const next = [...d.albums];
      next[i] = { ...next[i], ...patch };
      return { ...d, albums: next };
    });
  }
  function deleteAlbum(albumId: string) {
    setData(d => {
      const next = d.albums.filter(a => a.id !== albumId);
      // 若刪的是目前選取的，清空選取
      if (selected?.albumId === albumId) setSelected(null);
      return { ...d, albums: next };
    });
  }
  function addSong(albumId: string, payload: { title: string; releaseDate?: string; lyricist?: string; composer?: string; lyrics?: LyricLine[]; }) {
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId);
      if (ai < 0) return d;
      const album = d.albums[ai];
      const newSong: Song = {
        id: uid(),
        title: payload.title,
        releaseDate: payload.releaseDate || album.releaseDate || today(),
        lyricist: payload.lyricist || "",
        composer: payload.composer || "",
        lyrics: payload.lyrics || [],
        vocab: [],
        grammar: []
      };
      const nextAlbums = [...d.albums];
      nextAlbums[ai] = { ...album, songs: [newSong, ...album.songs] };
      return { ...d, albums: nextAlbums };
    });
  }
  function updateSong(albumId: string, songId: string, patch: Partial<Song>) {
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId);
      if (ai < 0) return d;
      const si = d.albums[ai].songs.findIndex(s => s.id === songId);
      if (si < 0) return d;
      const next = [...d.albums];
      const album = next[ai];
      const songs = [...album.songs];
      songs[si] = { ...songs[si], ...patch };
      next[ai] = { ...album, songs };
      return { ...d, albums: next };
    });
  }
  function deleteSong(albumId: string, songId: string) {
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId);
      if (ai < 0) return d;
      const album = d.albums[ai];
      const songs = album.songs.filter(s => s.id !== songId);
      const next = [...d.albums];
      next[ai] = { ...album, songs };
      return { ...d, albums: next };
    });
    if (selected?.albumId === albumId && selected?.songId === songId) setSelected(null);
  }
  function reorderAlbum(from: number, to: number) {
    setData(d => ({ ...d, albums: arrayMove(d.albums, from, to) }));
  }
  function reorderSong(albumId: string, from: number, to: number) {
    setData(d => {
      const ai = d.albums.findIndex(a => a.id === albumId);
      if (ai < 0) return d;
      const album = d.albums[ai];
      const nextAlbums = [...d.albums];
      nextAlbums[ai] = { ...album, songs: arrayMove(album.songs, from, to) };
      return { ...d, albums: nextAlbums };
    });
  }
  async function uploadAlbumCover(albumId: string, file: File) {
    const url = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result||"")); fr.readAsDataURL(file); });
    updateAlbum(albumId, { cover: url });
  }

  /* ===== 匯出 ===== */
  function exportTSV() {
    const rows: (string|number)[][] = [
      ["album","song","lyricist","composer","release","lyrics_kor","lyrics_zh","vocab(word|zh)","grammar(pattern||explain||example)"]
    ];
    for (const a of data.albums) {
      for (const s of a.songs) {
        const kor = s.lyrics.map(l => l.kor).join("\n");
        const zh  = s.lyrics.map(l => l.zh ).join("\n");
        const vocab = s.vocab.map(v => (v.zh ? `${v.word}|${v.zh}` : v.word)).join("\n");
        const grammar = s.grammar.map(g => [g.pattern, g.explain ?? "", g.example ?? ""].join("||")).join("\n");
        rows.push([a.title, s.title, s.lyricist ?? "", s.composer ?? "", s.releaseDate ?? "", kor, zh, vocab, grammar]);
      }
    }
    download(`day6_lyrics_${today()}.tsv`, toTSV(rows));
  }

  /* ===== 單檔匯入 ===== */
  function openImportSingle() {
    setModal({ type: 'import-single' });
  }
  function normalizeTableHeaders(head: string[]) {
    return head.map(normalizeHeader);
  }
  function ingestSingleFile(table: string[][]) {
    if (!table.length) return;
    const H = normalizeTableHeaders(table[0].map(stripCell));
    const idxAlbum   = idxOfAny(H, ["album","專輯"]);
    const idxSong    = idxOfAny(H, ["song","歌名","歌曲"]);
    if (idxAlbum < 0 || idxSong < 0) { alert("缺少必要欄位：專輯、歌名"); return; }

    const idxLyricist = idxOfAny(H, ["lyricist","作詞"]);
    const idxComposer = idxOfAny(H, ["composer","作曲"]);
    const idxRelDate  = idxOfAny(H, ["release","releasedate","發行日","日期"]);
    const idxKor      = idxOfAny(H, ["lyricskor","lyrics_kor","歌詞韓","歌詞(kor)","歌詞（韓）","韓文歌詞"]);
    const idxZh       = idxOfAny(H, ["lyricszh","lyrics_zh","歌詞中","歌詞(zh)","歌詞（中）","中文歌詞"]);
    const idxVocab    = idxOfAny(H, ["vocab","單字"]);
    const idxGrammar  = idxOfAny(H, ["grammar","文法"]);

    // 逐行合併
    const rows = table.slice(1);
    setData(d => {
      let next = { ...d };
      for (const raw of rows) {
        const cells = raw.map(stripCell);
        const albumTitle = cells[idxAlbum] || "";
        const songTitle  = cells[idxSong]  || "";
        if (!albumTitle || !songTitle) continue;

        let ai = next.albums.findIndex(a => a.title === albumTitle);
        if (ai < 0) {
          next.albums = [{ id: uid(), title: albumTitle, releaseDate: today(), cover: "", songs: [] }, ...next.albums];
          ai = 0;
        }
        const album = next.albums[ai];

        let si = album.songs.findIndex(s => s.title === songTitle);
        const patch: Partial<Song> = {};
        if (idxLyricist >= 0) patch.lyricist = cells[idxLyricist];
        if (idxComposer >= 0) patch.composer = cells[idxComposer];
        if (idxRelDate  >= 0) patch.releaseDate = cells[idxRelDate];

        // 歌詞（可選）
        const korText = idxKor >= 0 ? cells[idxKor] : "";
        const zhText  = idxZh  >= 0 ? cells[idxZh]  : "";
        if (korText || zhText) {
          patch.lyrics = alignLyrics(korText, zhText);
        }

        // 單字（可選）：一行一筆，可用「|、:、\t」分隔詞與譯
        if (idxVocab >= 0 && cells[idxVocab]) {
          const lines = cells[idxVocab].split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          patch.vocab = lines.map(line => {
            const m = line.split(/\t+|:+|\|+/);
            return { id: uid(), word: (m[0]||"").trim(), zh: (m[1]||"").trim() || undefined };
          });
        }

        // 文法（可選）：一行一筆，用「pattern||explain||example」
        if (idxGrammar >= 0 && cells[idxGrammar]) {
          const lines = cells[idxGrammar].split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          patch.grammar = lines.map(line => {
            const m = line.split(/\|\|/);
            return { id: uid(), pattern: (m[0]||"").trim(), explain: (m[1]||"").trim() || undefined, example: (m[2]||"").trim() || undefined };
          });
        }

        const nextAlbums = [...next.albums];
        if (si < 0) {
          const newSong: Song = {
            id: uid(),
            title: songTitle,
            releaseDate: patch.releaseDate || album.releaseDate || today(),
            lyricist: patch.lyricist || "",
            composer: patch.composer || "",
            lyrics: patch.lyrics || [],
            vocab: patch.vocab || [],
            grammar: patch.grammar || []
          };
          nextAlbums[ai] = { ...album, songs: [newSong, ...album.songs] };
        } else {
          const songs = [...album.songs];
          songs[si] = { ...songs[si], ...patch };
          nextAlbums[ai] = { ...album, songs };
        }
        next = { ...next, albums: nextAlbums };
      }
      return next;
    });
  }

  /* ===================== UI ===================== */
  return (
    <div className="flex h-screen w-screen flex-col">
      {/* Topbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="text-lg font-semibold">DAY6 Lyrics</div>
          <div className="text-xs text-zinc-500">v{data.version}</div>
        </div>
        <div className="flex items-center gap-2">
          <ToolbarButton onClick={exportTSV}>匯出 TSV</ToolbarButton>
          <a className="rounded-xl border px-3 py-1.5 text-sm hover:bg-black/5" href="javascript:void(0)" onClick={()=>alert('使用說明：\n1) 側欄可排序、刪歌、編輯專輯\n2) 進入歌曲頁後，歌名下方可直接編輯「作詞/作曲」\n3) 單檔匯入：按左側「單檔匯入」，上傳 CSV/TSV（欄位含 album、song 必填；其餘選填）')}>說明</a>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <DesktopSidebar
          data={data}
          selected={selected}
          onSelect={(aid, sid)=>setSelected({ albumId: aid, songId: sid })}
          sortMode={sortMode}
          onToggleSort={()=>setSortMode(s=>!s)}
          editingAlbumId={editingAlbumId}
          onToggleAlbumEdit={setEditingAlbumId}
          onUpdateAlbum={updateAlbum}
          onUploadAlbumCover={uploadAlbumCover}
          onReorderAlbum={reorderAlbum}
          onReorderSong={reorderSong}
          onDeleteSong={deleteSong}
          onDeleteAlbum={deleteAlbum}
          collapsed={collapsed}
          onToggleCollapse={(aid)=>setCollapsed(c=>({ ...c, [aid]: !c[aid] }))}
          onOpenAddAlbum={()=>setModal({ type: 'album' })}
          onOpenAddSong={(aid)=>setModal({ type: 'song', albumId: aid })}
          onOpenImportSingle={openImportSingle}
        />

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-4">
          {!current ? (
            <div className="text-zinc-500">請從左側選擇一首歌曲，或新增專輯/歌曲。</div>
          ) : (
            <SongView
              album={current.album}
              song={current.song}
              onRename={(title)=>updateSong(current.album.id, current.song.id, { title })}
              onUpdateMeta={(patch)=>updateSong(current.album.id, current.song.id, patch)}
              onUpdateLyrics={(lyrics)=>updateSong(current.album.id, current.song.id, { lyrics })}
              onUpdateVocab={(v)=>updateSong(current.album.id, current.song.id, { vocab: v })}
              onUpdateGrammar={(g)=>updateSong(current.album.id, current.song.id, { grammar: g })}
            />
          )}
        </main>
      </div>

      {/* ===== Modals ===== */}
      {modal.type === 'album' && (
        <Modal open title="新增專輯" onClose={()=>setModal({ type: null })}>
          <AddAlbumForm onSubmit={(title, date)=>{ addAlbum(title || "New Album"); if (title || date) setData(d=>{
            const ai = d.albums.findIndex(a=>a.title===title);
            if (ai>=0) { const next=[...d.albums]; next[ai]={...next[ai], releaseDate: date||today()}; return { ...d, albums: next }; }
            return d;
          }); setModal({ type: null }); }} />
        </Modal>
      )}

      {modal.type === 'song' && (
        <Modal open title="新增歌曲" onClose={()=>setModal({ type: null })}>
          <AddSongForm
            onSubmit={(payload)=>{ addSong(modal.albumId!, payload); setModal({ type: null }); }}
            defaultRelease={data.albums.find(a=>a.id===modal.albumId!)?.releaseDate || today()}
          />
        </Modal>
      )}

      {modal.type === 'import-single' && (
        <Modal open title="單檔匯入（CSV/TSV）" onClose={()=>setModal({ type: null })}>
          <SingleImport onTableReady={(table)=>{ ingestSingleFile(table); setModal({ type: null }); }} />
          <div className="mt-4 rounded-lg border bg-white/70 p-3 text-sm text-zinc-600">
            <div className="font-medium">欄位說明</div>
            <ul className="list-disc pl-5">
              <li><b>必填</b>：album/專輯、song/歌名</li>
              <li>選填：lyricist/作詞、composer/作曲、release/日期、lyrics_kor/歌詞韓、lyrics_zh/歌詞中、vocab/單字、grammar/文法</li>
              <li>vocab：每行一筆，可用 <code>|</code>、<code>:</code> 或 <code>Tab</code> 分隔（例：<code>안녕|你好</code>）</li>
              <li>grammar：每行一筆，格式 <code>pattern||explain||example</code></li>
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ===================== Song View（含作詞/作曲欄位） ===================== */
function SongView({ album, song, onRename, onUpdateMeta, onUpdateLyrics, onUpdateVocab, onUpdateGrammar }:{
  album: Album; song: Song;
  onRename: (title: string)=>void;
  onUpdateMeta: (patch: Partial<Song>)=>void;
  onUpdateLyrics: (ly: LyricLine[])=>void;
  onUpdateVocab: (v: VocabItem[])=>void;
  onUpdateGrammar: (g: GrammarPoint[])=>void;
}) {
  const [tab, setTab] = useState<"lyrics"|"vocab"|"grammar">("lyrics");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(song.title);
  useEffect(()=>{ setTitleVal(song.title); }, [song.title]);

  const [lyrKor, setLyrKor] = useState(song.lyrics.map(l=>l.kor).join("\n"));
  const [lyrZh, setLyrZh]   = useState(song.lyrics.map(l=>l.zh ).join("\n"));
  useEffect(()=>{ setLyrKor(song.lyrics.map(l=>l.kor).join("\n")); setLyrZh(song.lyrics.map(l=>l.zh).join("\n")); }, [song.id]);

  return (
    <div className="space-y-4">
      {/* 標題 + 作詞/作曲 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {!editingTitle ? (
            <div className="flex items-center gap-2">
              <div className="truncate text-2xl font-bold">{song.title}</div>
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>setEditingTitle(true)} title="編輯歌名">✎</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input value={titleVal} onChange={e=>setTitleVal(e.target.value)} className="rounded-md border px-2 py-1 text-2xl font-bold" autoFocus />
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ onRename(titleVal.trim() || song.title); setEditingTitle(false); }}>儲存</button>
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>{ setTitleVal(song.title); setEditingTitle(false); }}>取消</button>
            </div>
          )}
          <div className="text-xs text-zinc-500">{album.title} • {song.releaseDate || album.releaseDate}</div>
        </div>
        <div className="flex gap-2">
          <TabButton active={tab==="lyrics"} onClick={()=>setTab("lyrics")}>歌詞</TabButton>
          <TabButton active={tab==="vocab"} onClick={()=>setTab("vocab")}>單字</TabButton>
          <TabButton active={tab==="grammar"} onClick={()=>setTab("grammar")}>文法</TabButton>
        </div>
      </div>

      {/* 新增：作詞／作曲欄位（可編輯） */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-zinc-500">作詞 Lyricist</div>
          <input
            value={song.lyricist ?? ""}
            onChange={e=>onUpdateMeta({ lyricist: e.target.value })}
            placeholder="可輸入多位（以、分隔）"
            className="mt-1 w-full rounded-md border px-2 py-1"
          />
        </div>
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-zinc-500">作曲 Composer</div>
          <input
            value={song.composer ?? ""}
            onChange={e=>onUpdateMeta({ composer: e.target.value })}
            placeholder="可輸入多位（以、分隔）"
            className="mt-1 w-full rounded-md border px-2 py-1"
          />
        </div>
      </div>

      {/* Tabs */}
      {tab === "lyrics" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">歌詞（韓）</div>
            <textarea value={lyrKor} onChange={e=>setLyrKor(e.target.value)} rows={16} className="w-full rounded-xl border p-2 font-mono text-sm" />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">歌詞（中）</div>
            <textarea value={lyrZh} onChange={e=>setLyrZh(e.target.value)} rows={16} className="w-full rounded-xl border p-2 font-mono text-sm" />
          </div>
          <div className="md:col-span-2">
            <ToolbarButton onClick={()=>onUpdateLyrics(alignLyrics(lyrKor, lyrZh))}>套用到歌詞</ToolbarButton>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-zinc-500">提示：左右欄長度不同也可，自動對齊不足行。</div>
          </div>
        </div>
      )}

      {tab === "vocab" && (
        <VocabEditor data={song.vocab} onChange={onUpdateVocab} />
      )}

      {tab === "grammar" && (
        <GrammarEditor data={song.grammar} onChange={onUpdateGrammar} />
      )}
    </div>
  );
}

/* ===================== Editors ===================== */
function VocabEditor({ data, onChange }: { data: VocabItem[]; onChange: (v: VocabItem[])=>void }) {
  const [rows, setRows] = useState<VocabItem[]>(data);
  useEffect(()=>setRows(data), [data]);
  function addRow() { setRows(r => [...r, { id: uid(), word: "", zh: "" }]); }
  function save() { onChange(rows.map(r => ({ ...r, word: r.word.trim(), zh: r.zh?.trim() }))); }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">單字表</div>
        <div className="flex gap-2">
          <ToolbarButton onClick={addRow}>+ 一行</ToolbarButton>
          <ToolbarButton onClick={save}>儲存</ToolbarButton>
        </div>
      </div>
      <table className="w-full table-fixed rounded-xl border">
        <thead><tr className="bg-black/5"><th className="p-2 text-left">詞</th><th className="p-2 text-left">譯</th><th className="w-16 p-2"></th></tr></thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={r.id} className="border-t">
              <td className="p-2"><input value={r.word} onChange={e=>setRows(x=>x.map((y,yi)=>yi===i?{...y, word:e.target.value}:y))} className="w-full rounded-md border px-2 py-1" /></td>
              <td className="p-2"><input value={r.zh??""} onChange={e=>setRows(x=>x.map((y,yi)=>yi===i?{...y, zh:e.target.value}:y))} className="w-full rounded-md border px-2 py-1" /></td>
              <td className="p-2 text-right"><button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>setRows(x=>x.filter((_,yi)=>yi!==i))}>刪除</button></td>
            </tr>
          ))}
          {rows.length===0 && <tr><td className="p-2 text-sm text-zinc-500" colSpan={3}>（尚無資料）</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function GrammarEditor({ data, onChange }: { data: GrammarPoint[]; onChange: (v: GrammarPoint[])=>void }) {
  const [rows, setRows] = useState<GrammarPoint[]>(data);
  useEffect(()=>setRows(data), [data]);
  function addRow() { setRows(r => [...r, { id: uid(), pattern: "", explain: "", example: "" }]); }
  function save() { onChange(rows.map(r => ({ ...r, pattern: r.pattern.trim(), explain: r.explain?.trim(), example: r.example?.trim() }))); }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">文法</div>
        <div className="flex gap-2">
          <ToolbarButton onClick={addRow}>+ 一行</ToolbarButton>
          <ToolbarButton onClick={save}>儲存</ToolbarButton>
        </div>
      </div>
      <table className="w-full table-fixed rounded-xl border">
        <thead><tr className="bg-black/5"><th className="p-2 text-left">Pattern</th><th className="p-2 text-left">Explain</th><th className="p-2 text-left">Example</th><th className="w-16 p-2"></th></tr></thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={r.id} className="border-t">
              <td className="p-2"><input value={r.pattern} onChange={e=>setRows(x=>x.map((y,yi)=>yi===i?{...y, pattern:e.target.value}:y))} className="w-full rounded-md border px-2 py-1" /></td>
              <td className="p-2"><input value={r.explain??""} onChange={e=>setRows(x=>x.map((y,yi)=>yi===i?{...y, explain:e.target.value}:y))} className="w-full rounded-md border px-2 py-1" /></td>
              <td className="p-2"><input value={r.example??""} onChange={e=>setRows(x=>x.map((y,yi)=>yi===i?{...y, example:e.target.value}:y))} className="w-full rounded-md border px-2 py-1" /></td>
              <td className="p-2 text-right"><button className="rounded-md border px-2 py-1 text-xs hover:bg-black/5" onClick={()=>setRows(x=>x.filter((_,yi)=>yi!==i))}>刪除</button></td>
            </tr>
          ))}
          {rows.length===0 && <tr><td className="p-2 text-sm text-zinc-500" colSpan={4}>（尚無資料）</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ===================== Forms ===================== */
function AddAlbumForm({ onSubmit }: { onSubmit: (title: string, date?: string)=>void }) {
  const [title, setTitle] = useState("");
  const [date, setDate]   = useState(today());
  return (
    <form className="space-y-3" onSubmit={e=>{ e.preventDefault(); onSubmit(title.trim(), date); }}>
      <div>
        <div className="text-sm">專輯名稱（必填）</div>
        <input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1" required />
      </div>
      <div>
        <div className="text-sm">發行日</div>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1" />
      </div>
      <div className="flex justify-end gap-2">
        <ToolbarButton type="submit">新增</ToolbarButton>
      </div>
    </form>
  );
}

function AddSongForm({ onSubmit, defaultRelease }: { onSubmit: (payload: { title: string; releaseDate?: string; lyricist?: string; composer?: string; lyrics?: LyricLine[] })=>void; defaultRelease: string }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultRelease || today());
  const [lyricist, setLyricist] = useState("");
  const [composer, setComposer] = useState("");
  const [kor, setKor] = useState("");
  const [zh, setZh] = useState("");
  return (
    <form className="space-y-3" onSubmit={e=>{ e.preventDefault(); onSubmit({ title: title.trim(), releaseDate: date, lyricist: lyricist.trim(), composer: composer.trim(), lyrics: alignLyrics(kor, zh) }); }}>
      <div>
        <div className="text-sm">歌名（必填）</div>
        <input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-sm">作詞（選填）</div>
          <input value={lyricist} onChange={e=>setLyricist(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1" placeholder="多位可用、分隔" />
        </div>
        <div>
          <div className="text-sm">作曲（選填）</div>
          <input value={composer} onChange={e=>setComposer(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1" placeholder="多位可用、分隔" />
        </div>
      </div>
      <div>
        <div className="text-sm">發行日（選填）</div>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-sm">歌詞（韓）選填</div>
          <textarea value={kor} onChange={e=>setKor(e.target.value)} rows={8} className="mt-1 w-full rounded-md border p-2 font-mono text-sm" />
        </div>
        <div>
          <div className="text-sm">歌詞（中）選填</div>
          <textarea value={zh} onChange={e=>setZh(e.target.value)} rows={8} className="mt-1 w-full rounded-md border p-2 font-mono text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <ToolbarButton type="submit">新增歌曲</ToolbarButton>
      </div>
    </form>
  );
}

/* ===================== 單檔匯入 UI ===================== */
function SingleImport({ onTableReady }: { onTableReady: (table: string[][])=>void }) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");

  function handleFile(file: File) {
    setFileName(file.name);
    const fr = new FileReader();
    fr.onload = () => setText(String(fr.result || ""));
    fr.readAsText(file); // 自動偵測 UTF-8/UTF-16
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5">
          選擇檔案
          <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>
        <div className="text-sm text-zinc-600">{fileName || "未選擇檔案"}</div>
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={10} className="w-full rounded-xl border p-2 font-mono text-sm" placeholder="或直接貼上 CSV/TSV 文字…" />
      <div className="flex justify-end">
        <ToolbarButton onClick={()=>{ if (!text.trim()) { alert("沒有內容"); return; } const table = parseTable(text); if (!table.length) { alert("解析失敗/內容為空"); return; } onTableReady(table); }}>匯入</ToolbarButton>
      </div>
    </div>
  );
}
