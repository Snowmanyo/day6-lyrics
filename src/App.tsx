import React, { useEffect, useMemo, useState } from "react";

// ===================== Types =====================
export type LyricLine = { id: string; kor: string; zh: string };
export type VocabItem = { id: string; word: string; pos?: string; zh?: string; memo?: string };
export type GrammarItem = { id: string; pattern: string; explanation?: string; examples?: { kor: string; zh?: string }[] };
export type Song = { id: string; title: string; releaseDate?: string; lyrics: LyricLine[]; vocab: VocabItem[]; grammar: GrammarItem[] };
export type Album = { id: string; title: string; releaseDate: string; songs: Song[] };

// ===================== Utils =====================
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function alignLyrics(korRaw: string, zhRaw: string): LyricLine[] {
  const korLines = (korRaw || "").split(/\r?\n/).map(s => s.trim());
  const zhLines = (zhRaw || "").split(/\r?\n/).map(s => s.trim());
  const max = Math.max(korLines.length, zhLines.length, 1);
  return Array.from({ length: max }, (_, i) => ({ id: uid(), kor: korLines[i] || "", zh: zhLines[i] || "" }));
}

const isHangul = (s: string) => /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(s);
const KOREAN_STOP_PARTICLES = ["은","는","이","가","을","를","에","에서","에게","한테","께서","에게서","으로","로","와","과","도","만","까지","부터","처럼","보다","밖에","마다","씩"];
function tokenizeKoreanUnique(text: string): string[] {
  const raw = text.replace(/\([^\)]*\)/g, " ").split(/[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/).filter(Boolean);
  const cleaned = raw.map(w => w.trim()).filter(w => w.length > 0 && isHangul(w));
  const simplified = cleaned.map(w => {
    for (const p of KOREAN_STOP_PARTICLES) { if (w.endsWith(p) && w.length > p.length + 1) return w.slice(0, -p.length); }
    return w;
  });
  return Array.from(new Set(simplified));
}

function toCSV(rows: string[][]): string { return rows.map(r => r.map(x => '"' + (x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n'); }
function downloadCSV(rows: string[][], name: string) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
function parseCSV(text: string): string[][] {
  // very small CSV parser: supports quotes and commas
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[][] = [];
  for (const line of lines) {
    if (line === '') { out.push(['']); continue; }
    const row: string[] = [];
    let i = 0; let cur = ''; let inQ = false;
    while (i < line.length) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i += 2; }
          else { inQ = false; i++; }
        } else { cur += ch; i++; }
      } else {
        if (ch === '"') { inQ = true; i++; }
        else if (ch === ',') { row.push(cur); cur = ''; i++; }
        else { cur += ch; i++; }
      }
    }
    row.push(cur);
    out.push(row);
  }
  return out;
}

// ===================== UI atoms =====================
const IconButton = ({ label, onClick, disabled, title }: { label: string; onClick?: () => void; disabled?: boolean; title?: string }) => (
  <button title={title} onClick={disabled ? undefined : onClick} disabled={disabled} className={`rounded-xl border px-3 py-1.5 text-sm active:scale-[0.99] ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>{label}</button>
);

const Section = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="mb-6">
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div>{right}</div>
    </div>
    <div className="rounded-2xl border bg-white/60 p-4 shadow-sm dark:bg-zinc-900/60 dark:border-zinc-700">{children}</div>
  </div>
);

// ===================== Main App =====================
export default function LyricsApp() {
  // theme
  const [dark, setDark] = useState<boolean>(() => (typeof window !== 'undefined' ? localStorage.getItem('lyrics_theme') === 'dark' : false));
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('lyrics_theme', dark ? 'dark' : 'light'); }, [dark]);

  // data
  const [albums, setAlbums] = useState<Album[]>(() => { const saved = localStorage.getItem('lyrics_data'); return saved ? JSON.parse(saved) : []; });
  useEffect(() => { localStorage.setItem('lyrics_data', JSON.stringify(albums)); }, [albums]);

  // ui state
  const [showCreate, setShowCreate] = useState(false);
  const [korBulk, setKorBulk] = useState('');
  const [zhBulk, setZhBulk] = useState('');
  const [selected, setSelected] = useState<{ albumId: string; songId: string } | null>(null);
  const [editModeBySong, setEditModeBySong] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');

  // selection memo
  const current = useMemo(() => {
    if (!selected) return null as { album: Album; song: Song } | null;
    const album = albums.find(a => a.id === selected.albumId);
    if (!album) return null;
    const song = album.songs.find(s => s.id === selected.songId);
    if (!song) return null;
    return { album, song };
  }, [albums, selected]);

  // ===== Create =====
  const addAlbum = (title: string, date: string) => {
    setAlbums([...albums, { id: uid(), title: title.trim(), releaseDate: date || new Date().toISOString().slice(0,10), songs: [] }]);
    setShowCreate(false);
  };
  const addSong = (albumId: string, title: string, kor: string, zh: string) => {
    const lyrics = alignLyrics(kor, zh);
    const song: Song = { id: uid(), title: title.trim(), lyrics, vocab: [], grammar: [] };
    setAlbums(albums.map(a => a.id === albumId ? { ...a, songs: [...a.songs, song] } : a));
    setShowCreate(false); setKorBulk(''); setZhBulk(''); setSelected({ albumId, songId: song.id });
  };

  // ===== Update helpers =====
  const updateSong = (songId: string, patch: Partial<Song>) => {
    setAlbums(albums.map(a => ({ ...a, songs: a.songs.map(s => s.id === songId ? { ...s, ...patch } : s) })));
  };
  const setLine = (song: Song, idx: number, patch: Partial<LyricLine>) => {
    const next = [...song.lyrics];
    next[idx] = { ...next[idx], ...patch };
    updateSong(song.id, { lyrics: next });
  };
  const addLineBelow = (song: Song, idx: number) => {
    const next = [...song.lyrics.slice(0, idx + 1), { id: uid(), kor: '', zh: '' }, ...song.lyrics.slice(idx + 1)];
    updateSong(song.id, { lyrics: next });
  };
  const deleteLine = (song: Song, id: string) => { updateSong(song.id, { lyrics: song.lyrics.filter(l => l.id !== id) }); };

  // ===== Search =====
  const searchResults = useMemo(() => {
    const q = query.trim(); if (!q) return [] as { album: Album; song: Song; where: string; snippet: string }[];
    const res: { album: Album; song: Song; where: string; snippet: string }[] = [];
    for (const a of albums) {
      for (const s of a.songs) {
        if (s.title.toLowerCase().includes(q.toLowerCase())) res.push({ album: a, song: s, where: '歌名', snippet: s.title });
        for (const l of s.lyrics) {
          if (l.kor.includes(q) || l.zh.includes(q)) res.push({ album: a, song: s, where: '歌詞', snippet: `${l.kor} / ${l.zh}`.slice(0, 80) });
        }
        for (const v of s.vocab) {
          if ((v.word || '').includes(q) || (v.zh || '').includes(q) || (v.pos || '').includes(q)) res.push({ album: a, song: s, where: '詞彙', snippet: `${v.word} - ${v.zh || ''}` });
        }
        for (const g of s.grammar) {
          if ((g.pattern || '').includes(q) || (g.explanation || '').includes(q)) res.push({ album: a, song: s, where: '文法', snippet: `${g.pattern} - ${(g.explanation || '').slice(0,60)}` });
        }
      }
    }
    return res.slice(0, 200);
  }, [query, albums]);

  // ===== Vocab =====
  const dedupeVocab = (list: VocabItem[]) => { const map = new Map<string, VocabItem>(); for (const v of list) { const k = (v.word || '').trim(); if (!map.has(k)) map.set(k, v); } return Array.from(map.values()); };
  const extractVocabAll = (song: Song, onlyNew: boolean) => {
    const words = tokenizeKoreanUnique(song.lyrics.map(l => l.kor).join('\n'));
    const existing = new Set((song.vocab || []).map(v => (v.word || '').trim()));
    const newItems: VocabItem[] = [];
    for (const w of words) { const t = w.trim(); if (!t) continue; if (onlyNew && existing.has(t)) continue; newItems.push({ id: uid(), word: t }); }
    const merged = onlyNew ? [...song.vocab, ...newItems] : dedupeVocab([...(song.vocab || []), ...newItems]);
    updateSong(song.id, { vocab: merged });
  };

  // ===== Grammar =====
  const autoSuggestGrammar = (song: Song) => {
    const patterns: { key: string; desc: string; test: (s: string) => boolean }[] = [
      { key: '-네요', desc: '語氣詞: 驚訝/感嘆', test: s => /네요\b/.test(s) },
      { key: '-겠-', desc: '推測/意志', test: s => /겠/.test(s) },
      { key: '-았/었-', desc: '過去時', test: s => /(았|었)/.test(s) },
      { key: '-(으)니까', desc: '因為/所以', test: s => /(으)?니까/.test(s) },
      { key: '-거든요', desc: '補充理由/軟化語氣', test: s => /거든요/.test(s) },
      { key: '-지만', desc: '轉折', test: s => /지만/.test(s) },
      { key: '-는데', desc: '鋪陳/轉折', test: s => /는데/.test(s) },
      { key: '-고 싶다', desc: '想要', test: s => /고\s*싶/.test(s) },
      { key: '-(으)ㄹ게요', desc: '承諾/意志', test: s => /(ㄹ게요|을게요)/.test(s) },
      { key: '-(으)ㄹ까요', desc: '提議/猜測', test: s => /(ㄹ까요|을까요)/.test(s) }
    ];
    const found: GrammarItem[] = [];
    for (const line of song.lyrics) {
      const s = line.kor;
      for (const p of patterns) {
        if (p.test(s) && !song.grammar.some(g => g.pattern === p.key)) {
          found.push({ id: uid(), pattern: p.key, explanation: p.desc, examples: [{ kor: s, zh: line.zh }] });
        }
      }
    }
    if (found.length === 0) return; updateSong(song.id, { grammar: [...song.grammar, ...found] });
  };

  // ===== Export (CSV) =====
  const exportAllVocabCSV = () => {
    const rows: string[][] = [["Album","Song","Word","POS","Chinese","Memo"]];
    albums.forEach(a => a.songs.forEach(s => s.vocab.forEach(v => rows.push([a.title, s.title, v.word, v.pos || '', v.zh || '', v.memo || '']))));
    downloadCSV(rows, 'vocab_all.csv');
  };
  const exportAllGrammarCSV = () => {
    const rows: string[][] = [["Album","Song","Pattern","Explanation","ExampleKor","ExampleZh"]];
    albums.forEach(a => a.songs.forEach(s => {
      if ((s.grammar || []).length === 0) rows.push([a.title, s.title, '', '', '', '']);
      (s.grammar || []).forEach(g => { (g.examples && g.examples.length > 0 ? g.examples : [{ kor: '', zh: '' }]).forEach(ex => rows.push([a.title, s.title, g.pattern, g.explanation || '', ex.kor, ex.zh || ''])); });
    }));
    downloadCSV(rows, 'grammar_all.csv');
  };
  const exportAllLyricsCSV = () => {
    const rows: string[][] = [["Album","Song","Index","Kor","Zh"]];
    albums.forEach(a => a.songs.forEach(s => s.lyrics.forEach((l, i) => rows.push([a.title, s.title, String(i+1), l.kor, l.zh]))));
    downloadCSV(rows, 'lyrics_all.csv');
  };

  // ===== Import (CSV bundle) =====
  function importBundleCSV(files: FileList) {
    const map: Record<string, string> = {};
    const needed = new Set(['albums.csv','songs.csv','lyrics.csv']); // vocab.csv, grammar.csv optional
    const readers: Promise<void>[] = [];
    Array.from(files).forEach(f => {
      readers.push(new Promise(res => { const r = new FileReader(); r.onload = () => { map[f.name.toLowerCase()] = String(r.result || ''); res(); }; r.readAsText(f); }));
    });
    Promise.all(readers).then(() => {
      for (const n of needed) if (!map[n]) { alert(`缺少 ${n}`); return; }
      // parse
      const A = parseCSV(map['albums.csv']).slice(1); // id,title,releaseDate
      const S = parseCSV(map['songs.csv']).slice(1); // id,albumId,title,releaseDate
      const L = parseCSV(map['lyrics.csv']).slice(1); // songId,index,kor,zh
      const V = map['vocab.csv'] ? parseCSV(map['vocab.csv']).slice(1) : []; // songId,word,pos,zh,memo
      const G = map['grammar.csv'] ? parseCSV(map['grammar.csv']).slice(1) : []; // songId,pattern,explanation,exampleKor,exampleZh
      // build
      const albumMap = new Map<string, Album>();
      A.forEach(r => { const [id,title,date] = r; if (!id) return; albumMap.set(id, { id, title, releaseDate: date || '', songs: [] }); });
      const songMap = new Map<string, Song>();
      S.forEach(r => { const [id,albumId,title,date] = r; if (!id) return; const song: Song = { id, title, releaseDate: date || '', lyrics: [], vocab: [], grammar: [] }; songMap.set(id, song); const a = albumMap.get(albumId); if (a) a.songs.push(song); });
      L.forEach(r => { const [songId, idx, kor, zh] = r; const s = songMap.get(songId); if (s) s.lyrics.push({ id: uid(), kor: kor || '', zh: zh || '' }); });
      V.forEach(r => { const [songId, word, pos, zh, memo] = r; const s = songMap.get(songId); if (s && word) s.vocab.push({ id: uid(), word, pos, zh, memo }); });
      G.forEach(r => { const [songId, pattern, explanation, ek, ez] = r; const s = songMap.get(songId); if (s && pattern) { const ex = (ek || ez) ? [{ kor: ek || '', zh: ez || '' }] : []; s.grammar.push({ id: uid(), pattern, explanation, examples: ex }); } });
      const list = Array.from(albumMap.values());
      setAlbums(list);
      alert('CSV 匯入完成');
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white p-4 text-gray-900 dark:from-zinc-900 dark:to-zinc-950 dark:text-zinc-100">
      {/* Top bar */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="text-xl font-bold">DAY6 歌詞學韓文</div>
          <span className="rounded-full border px-2 py-0.5 text-xs">中韓對照</span>
          <span className="rounded-full border px-2 py-0.5 text-xs">詞彙</span>
          <span className="rounded-full border px-2 py-0.5 text-xs">文法</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="搜尋: 歌名 / 歌詞 / 詞彙 / 文法" value={query} onChange={e => setQuery(e.target.value)} className="w-72 rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring dark:bg-zinc-900 dark:border-zinc-700" />
          <IconButton label={dark ? '🌙 深色' : '☀️ 淺色'} onClick={() => setDark(d => !d)} title="切換深淺色" />
          <IconButton label="匯出 全站歌詞CSV" onClick={exportAllLyricsCSV} />
          <IconButton label="匯出 全站詞彙CSV" onClick={exportAllVocabCSV} />
          <IconButton label="匯出 全站文法CSV" onClick={exportAllGrammarCSV} />
          <label className="cursor-pointer rounded-xl border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
            匯入 CSV（多檔）
            <input type="file" accept=".csv" className="hidden" multiple onChange={e => { const fs = e.target.files; if (fs && fs.length) importBundleCSV(fs); }} />
          </label>
          <IconButton label="＋新增" onClick={() => setShowCreate(true)} />
        </div>
      </div>

      {/* Search results */}
      {query && (
        <Section title={`搜尋結果 (${searchResults.length})`}>
          <ul className="max-h-[40vh] space-y-2 overflow-auto pr-1">
            {searchResults.map((r, i) => (
              <li key={i}>
                <button onClick={() => setSelected({ albumId: r.album.id, songId: r.song.id })} className="w-full text-left">
                  <div className="text-sm"><span className="font-medium">[{r.where}]</span> {r.album.title} • {r.song.title}</div>
                  <div className="truncate text-xs text-gray-600 dark:text-zinc-400">{r.snippet}</div>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Albums & Songs */}
      {albums.map(a => (
        <Section key={a.id} title={`${a.title} (${a.releaseDate})`} right={<IconButton label="＋新增歌曲" onClick={() => setShowCreate(true)} /> }>
          {a.songs.map(s => (
            <div key={s.id} className="mb-3 rounded-xl border p-3 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="cursor-pointer font-semibold" onClick={() => setSelected({ albumId: a.id, songId: s.id })}>{s.title}</div>
                <div className="flex flex-wrap gap-2">
                  <IconButton label={editModeBySong[s.id] ? '編輯關' : '編輯開'} onClick={() => setEditModeBySong(m => ({ ...m, [s.id]: !m[s.id] }))} />
                  <IconButton label="擷取詞彙(去重合併)" onClick={() => extractVocabAll(s, false)} />
                  <IconButton label="只加入新詞" onClick={() => extractVocabAll(s, true)} />
                  <IconButton label="文法自動偵測" onClick={() => autoSuggestGrammar(s)} />
                </div>
              </div>

              {selected?.songId === s.id && (
                <div className="mt-3">
                  <div className="mb-2 text-sm text-gray-600 dark:text-zinc-400">歌詞（中韓對照；一行一段）</div>
                  {s.lyrics.map((l, idx) => (
                    <div key={l.id} className="mb-2 grid grid-cols-2 gap-2 text-sm">
                      <textarea value={l.kor} onChange={e => setLine(s, idx, { kor: e.target.value })} className="min-h-[36px] rounded-lg border p-2 dark:bg-zinc-900 dark:border-zinc-700" readOnly={!editModeBySong[s.id]} placeholder="韓文" />
                      <textarea value={l.zh} onChange={e => setLine(s, idx, { zh: e.target.value })} className="min-h-[36px] rounded-lg border p-2 dark:bg-zinc-900 dark:border-zinc-700" readOnly={!editModeBySong[s.id]} placeholder="中文" />
                      {editModeBySong[s.id] && (
                        <div className="col-span-2 flex justify-end gap-2">
                          <IconButton label="於下方新增一行" onClick={() => addLineBelow(s, idx)} />
                          <IconButton label="刪除此行" onClick={() => deleteLine(s, l.id)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selected?.songId === s.id && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Section title="詞彙表（可編輯）" right={
                    <IconButton label="CSV 匯出本曲" onClick={() => { const rows: string[][] = [["Word","POS","Chinese","Memo"]]; s.vocab.forEach(v => rows.push([v.word, v.pos || '', v.zh || '', v.memo || ''])); downloadCSV(rows, `vocab_${s.title}.csv`); }} />
                  }>
                    <VocabEditor song={s} onChange={list => updateSong(s.id, { vocab: list })} />
                  </Section>
                  <Section title="詞彙練習">
                    <PracticeVocab vocab={s.vocab} />
                  </Section>
                </div>
              )}

              {selected?.songId === s.id && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Section title="文法點（可新增例句）">
                    <GrammarEditor song={s} onChange={list => updateSong(s.id, { grammar: list })} />
                  </Section>
                  <Section title="文法測驗">
                    <QuizGrammar grammar={s.grammar} />
                  </Section>
                </div>
              )}
            </div>
          ))}
        </Section>
      ))}

      {showCreate && (
        <CreateMenu
          albums={albums}
          onClose={() => setShowCreate(false)}
          onCreateAlbum={(title, date) => addAlbum(title, date)}
          onCreateSong={(albumId, title, kor, zh) => addSong(albumId, title, kor, zh)}
          korBulk={korBulk}
          zhBulk={zhBulk}
          setKorBulk={setKorBulk}
          setZhBulk={setZhBulk}
        />
      )}
    </div>
  );
}

// ===================== Subcomponents =====================
function VocabEditor({ song, onChange }: { song: Song; onChange: (v: VocabItem[]) => void }) {
  const [filter, setFilter] = useState('');
  const list = useMemo(() => song.vocab.filter(v => { const q = filter.trim(); if (!q) return true; return (v.word || '').includes(q) || (v.zh || '').includes(q) || (v.pos || '').includes(q); }), [song.vocab, filter]);
  const add = () => onChange([{ id: uid(), word: '', pos: '', zh: '', memo: '' }, ...song.vocab]);
  const update = (id: string, patch: Partial<VocabItem>) => onChange(song.vocab.map(v => v.id === id ? { ...v, ...patch } : v));
  const del = (id: string) => onChange(song.vocab.filter(v => v.id !== id));
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <IconButton label="+ 新增詞彙" onClick={add} />
        <input placeholder="過濾詞彙..." value={filter} onChange={e => setFilter(e.target.value)} className="rounded border px-3 py-1 text-sm dark:bg-zinc-900 dark:border-zinc-700" />
      </div>
      <div className="max-h-[40vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-zinc-900">
            <tr className="border-b text-left dark:border-zinc-700">
              <th className="w-40 py-2 pr-2">韓文</th>
              <th className="w-24 py-2 pr-2">詞性</th>
              <th className="py-2 pr-2">中文</th>
              <th className="w-52 py-2 pr-2">備註</th>
              <th className="w-24 py-2 pr-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map(v => (
              <tr key={v.id} className="border-b align-top dark:border-zinc-700">
                <td className="py-2 pr-2"><input value={v.word} onChange={e => update(v.id, { word: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2"><input value={v.pos || ''} onChange={e => update(v.id, { pos: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2"><input value={v.zh || ''} onChange={e => update(v.id, { zh: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2"><input value={v.memo || ''} onChange={e => update(v.id, { memo: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2 text-right"><IconButton label="刪除" onClick={() => del(v.id)} /></td>
              </tr>
            ))}
            {list.length === 0 && (<tr><td colSpan={5} className="py-6 text-center text-gray-500">目前沒有符合過濾條件的詞彙。</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrammarEditor({ song, onChange }: { song: Song; onChange: (v: GrammarItem[]) => void }) {
  const add = () => onChange([{ id: uid(), pattern: '', explanation: '', examples: [] }, ...song.grammar]);
  const update = (id: string, patch: Partial<GrammarItem>) => onChange(song.grammar.map(g => g.id === id ? { ...g, ...patch } : g));
  const del = (id: string) => onChange(song.grammar.filter(g => g.id !== id));
  return (
    <div className="space-y-3">
      <div><IconButton label="+ 新增文法點" onClick={add} /></div>
      {song.grammar.map(g => (
        <div key={g.id} className="rounded-xl border p-3 dark:border-zinc-700">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-4">
              <div className="mb-1 text-xs text-gray-500">文法型態</div>
              <input value={g.pattern} onChange={e => update(g.id, { pattern: e.target.value })} className="w-full rounded-lg border px-2 py-1 dark:bg-zinc-900 dark:border-zinc-700" placeholder="如: -았/었-, -(으)니까, -거든요" />
            </div>
            <div className="col-span-12 md:col-span-8">
              <div className="mb-1 text-xs text-gray-500">說明 (繁中)</div>
              <textarea value={g.explanation || ''} onChange={e => update(g.id, { explanation: e.target.value })} className="min-h-[60px] w-full rounded-lg border px-2 py-1 dark:bg-zinc-900 dark:border-zinc-700" />
            </div>
          </div>
          <div className="mt-2">
            <div className="mb-1 text-xs text-gray-500">例句</div>
            {(g.examples || []).map((ex, i) => (
              <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                <input value={ex.kor} onChange={e => { const next = [...(g.examples || [])]; next[i] = { ...ex, kor: e.target.value }; update(g.id, { examples: next }); }} className="col-span-6 rounded-lg border px-2 py-1 dark:bg-zinc-900 dark:border-zinc-700" placeholder="韓文" />
                <input value={ex.zh || ''} onChange={e => { const next = [...(g.examples || [])]; next[i] = { ...ex, zh: e.target.value }; update(g.id, { examples: next }); }} className="col-span-6 rounded-lg border px-2 py-1 dark:bg-zinc-900 dark:border-zinc-700" placeholder="中文" />
              </div>
            ))}
            <IconButton label="+ 新增例句" onClick={() => update(g.id, { examples: [...(g.examples || []), { kor: '', zh: '' }] })} />
            <span className="mx-2 text-gray-400">|</span>
            <IconButton label="刪除此文法點" onClick={() => del(g.id)} />
          </div>
        </div>
      ))}
      {song.grammar.length === 0 && <div className="py-6 text-center text-gray-500">尚未新增文法點。</div>}
    </div>
  );
}

function PracticeVocab({ vocab }: { vocab: VocabItem[] }) {
  const items = vocab.filter(v => (v.word || '').trim());
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  useEffect(() => { setReveal(false); }, [idx]);
  if (items.length === 0) return <div className="text-sm text-gray-500">尚無詞彙可練習。</div>;
  const it = items[Math.min(idx, items.length - 1)];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-sm text-gray-500">進度 {Math.min(idx + 1, items.length)} / {items.length}</div>
      <div className="w-full rounded-xl border bg-white p-6 text-center shadow-sm dark:bg-zinc-900 dark:border-zinc-700">
        <div className="text-2xl font-bold">{it.word}</div>
        <div className="mt-2 text-gray-500">{it.pos || ''}</div>
        <div className="mt-4 text-lg">{reveal ? (it.zh || <span className="text-gray-400">(尚未填寫中文)</span>) : <span className="text-gray-300">────────</span>}</div>
      </div>
      <div className="flex gap-2">
        <IconButton label={reveal ? '隱藏中文' : '顯示中文'} onClick={() => setReveal(v => !v)} />
        <IconButton label="上一個" onClick={() => setIdx(i => Math.max(0, i - 1))} />
        <IconButton label="下一個" onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))} />
      </div>
    </div>
  );
}

function QuizGrammar({ grammar }: { grammar: GrammarItem[] }) {
  const pool = grammar.filter(g => (g.pattern || '').trim());
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => { setAnswer(''); setFeedback(null); }, [idx]);
  if (pool.length === 0) return <div className="text-sm text-gray-500">尚無文法可測驗。</div>;
  const g = pool[Math.min(idx, pool.length - 1)];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900 dark:border-zinc-700">
        <div className="text-sm text-gray-500">題目 {Math.min(idx + 1, pool.length)} / {pool.length}</div>
        <div className="mt-1 text-lg">請輸入此文法的中文說明：<span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900">{g.pattern}</span></div>
        <input value={answer} onChange={e => setAnswer(e.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700" placeholder="例如：過去時 / 轉折 / 想要..." />
        {feedback && <div className={`mt-2 text-sm ${feedback.startsWith('✓') ? 'text-emerald-700' : 'text-red-700'}`}>{feedback}</div>}
        <div className="mt-3 flex gap-2">
          <IconButton label="檢查答案" onClick={() => { const norm = (s: string) => s.trim().toLowerCase(); const ok = norm(answer) && g.explanation && norm(g.explanation).includes(norm(answer)); setFeedback(ok ? '✓ 正確/合理' : `✗ 參考解：${g.explanation || '(未填寫)'}`); }} />
          <IconButton label="下一題" onClick={() => setIdx(i => Math.min(pool.length - 1, i + 1))} />
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4 dark:bg-zinc-900 dark:border-zinc-700">
        <div className="text-sm text-gray-500">例句</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-zinc-300">
          {(g.examples || []).map((ex, i) => (<li key={i}>{ex.kor} {ex.zh ? `— ${ex.zh}` : ''}</li>))}
          {(g.examples || []).length === 0 && <li className="text-gray-400">(尚未新增例句)</li>}
        </ul>
      </div>
    </div>
  );
}

// ========= Create Menu ========= //
function CreateMenu({ albums, onClose, onCreateAlbum, onCreateSong, korBulk, zhBulk, setKorBulk, setZhBulk }:{ albums: Album[]; onClose: () => void; onCreateAlbum: (title: string, date: string) => void; onCreateSong: (albumId: string, title: string, kor: string, zh: string) => void; korBulk: string; zhBulk: string; setKorBulk: (v: string) => void; setZhBulk: (v: string) => void; }) {
  const [tab, setTab] = useState<'album' | 'song'>('album');
  const [albumId, setAlbumId] = useState<string>('');
  const [songTitle, setSongTitle] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [albumDate, setAlbumDate] = useState(new Date().toISOString().slice(0,10));
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl rounded-2xl border bg-white p-4 shadow-xl dark:bg-zinc-900 dark:border-zinc-700">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button className={`rounded px-3 py-1 text-sm ${tab==='album'?'bg-black text-white dark:bg-white dark:text-black':'border dark:border-zinc-700'}`} onClick={() => setTab('album')}>新增專輯</button>
            <button className={`rounded px-3 py-1 text-sm ${tab==='song'?'bg-black text-white dark:bg-white dark:text-black':'border dark:border-zinc-700'}`} onClick={() => setTab('song')}>新增歌曲</button>
          </div>
          <button className="rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={onClose}>關閉</button>
        </div>
        {tab === 'album' ? (
          <div className="grid gap-3">
            <div>
              <div className="mb-1 text-xs text-gray-500">專輯名稱</div>
              <input value={albumTitle} onChange={e => setAlbumTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700" placeholder="例如：The Book of Us" />
            </div>
            <div>
              <div className="mb-1 text-xs text-gray-500">發行日期</div>
              <input type="date" value={albumDate} onChange={e => setAlbumDate(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700" />
            </div>
            <div className="flex justify-end gap-2">
              <IconButton label="新增" onClick={() => { if (!albumTitle.trim()) return alert('請輸入專輯名稱'); onCreateAlbum(albumTitle, albumDate); }} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <div className="mb-1 text-xs text-gray-500">選擇專輯</div>
              <select value={albumId} onChange={e => setAlbumId(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700">
                <option value="">請選擇</option>
                {albums.map(a => <option key={a.id} value={a.id}>{a.title}（{a.releaseDate}）</option>)}
              </select>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="mb-1 text-xs text-gray-500">歌曲名稱</div>
              <input value={songTitle} onChange={e => setSongTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700" placeholder="例如：Congratulations" />
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="mb-1 text-xs text-gray-500">韓文歌詞（每行一段）</div>
              <textarea value={korBulk} onChange={e => setKorBulk(e.target.value)} className="h-48 w-full rounded-lg border p-2 dark:bg-zinc-900 dark:border-zinc-700" placeholder={`첫 줄\n둘째 줄\n셋째 줄`} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="mb-1 text-xs text-gray-500">中文翻譯（每行一段，可與韓文行數不同）</div>
              <textarea value={zhBulk} onChange={e => setZhBulk(e.target.value)} className="h-48 w-full rounded-lg border p-2 dark:bg-zinc-900 dark:border-zinc-700" placeholder={`第一段\n第二段\n第三段`} />
            </div>
            <div className="col-span-12 flex justify-end gap-2">
              <IconButton label="新增歌曲" onClick={() => { if (!albumId) return alert('請先選擇專輯'); if (!songTitle.trim()) return alert('請輸入歌曲名稱'); onCreateSong(albumId, songTitle, korBulk, zhBulk); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
