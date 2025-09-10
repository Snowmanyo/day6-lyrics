import React, { useEffect, useMemo, useRef, useState } from "react";

// DAY6 Lyrics Study SPA (+ per-song audio & per-line timestamps)
// - ASCII-only punctuation in code (avoid fullwidth commas)
// - Features: album/song management, KR-ZH aligned lyrics, vocab & grammar editors,
//   search, JSON import/export, CSV export, localStorage persistence
// - New: song-level audio URL, per-line start/end timestamps, play/loop line, quick set from current audio time,
//        LRC-like bulk paste and export of timestamps
// - Safety: no non-null assertions; guard undefined
// - Seed: preload "The Day" (2015-09-07) with 6 empty songs (no lyrics)
// - Self-tests included (plus timecode parser/formatter tests)

// ===================== Types =====================

type LyricLine = { id: string; kor: string; zh: string; note?: string; start?: number; end?: number };

type VocabItem = {
  id: string;
  word: string;
  pos?: string;
  zh?: string;
  memo?: string;
  examples?: { kor: string; zh?: string }[];
};

type GrammarPoint = {
  id: string;
  pattern: string;
  explanation?: string;
  examples?: { kor: string; zh?: string }[];
  tags?: string[];
};

type Song = {
  id: string;
  title: string;
  romanized?: string;
  releaseDate?: string;
  audioUrl?: string; // new: per-song audio source
  lyrics: LyricLine[];
  vocab: VocabItem[];
  grammar: GrammarPoint[];
  notes?: string;
  tags?: string[];
};

type Album = { id: string; title: string; releaseDate: string; coverUrl?: string; songs: Song[] };

type AppData = { artist: string; albums: Album[]; updatedAt: string; version: string };

type TestResult = { name: string; passed: boolean; message: string };

// ===================== Utils =====================

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const isHangul = (s: string) => /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(s);

const KOREAN_STOP_PARTICLES = [
  "은", "는", "이", "가", "을", "를", "에", "에서", "에게", "한테", "께서", "에게서",
  "으로", "로", "와", "과", "도", "만", "까지", "부터", "처럼", "보다", "밖에", "마다", "씩"
];

function tokenizeKoreanUnique(text: string): string[] {
  const raw = text
    .replace(/\([^\)]*\)/g, " ")
    .split(/[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/)
    .filter(Boolean);
  const cleaned = raw.map(w => w.trim()).filter(w => w.length > 0 && isHangul(w));
  const simplified = cleaned.map(w => {
    for (const p of KOREAN_STOP_PARTICLES) {
      if (w.endsWith(p) && w.length > p.length + 1) return w.slice(0, -p.length);
    }
    return w;
  });
  return Array.from(new Set(simplified));
}

function tokenizeKoreanAll(text: string): string[] {
  return text
    .replace(/\([^\)]*\)/g, " ")
    .split(/[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/)
    .filter(Boolean)
    .map(w => w.trim())
    .filter(w => w.length > 0 && isHangul(w));
}

function alignLyrics(korRaw: string, zhRaw: string): LyricLine[] {
  const korLines = korRaw.split(/\r?\n/).map(s => s.trim());
  const zhLines = zhRaw.split(/\r?\n/).map(s => s.trim());
  const max = Math.max(korLines.length, zhLines.length, 1);
  const out: LyricLine[] = [];
  for (let i = 0; i < max; i++) {
    out.push({ id: uid(), kor: korLines[i] || "", zh: zhLines[i] || "" });
  }
  return out;
}

function toCSV(rows: string[][]): string {
  return rows
    .map(r => r.map(cell => '"' + String(cell ?? "").replace(/"/g, '""') + '"').join(","))
    .join("\n");
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Timecode helpers: supports mm:ss(.ms) or hh:mm:ss(.ms)
function parseTimecode(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const hh = m[1] ? parseInt(m[1], 10) : 0;
  const mm = parseInt(m[2], 10);
  const ss = parseInt(m[3], 10);
  const ms = m[4] ? parseInt(m[4].padEnd(3, '0').slice(0, 3), 10) : 0;
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function formatTimecode(sec?: number): string {
  if (sec == null || isNaN(sec)) return "";
  const total = Math.max(0, sec);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const base = `${hh > 0 ? String(hh).padStart(2, '0') + ':' : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return ms ? `${base}.${String(ms).padStart(3, '0')}` : base;
}

// Mini ko-zh dictionary for initial hints (can be expanded by user)
const BASIC_KO_ZH: Record<string, string> = {
  "사랑": "愛",
  "사랑하다": "愛(動詞)",
  "시간": "時間",
  "밤": "夜晚",
  "하늘": "天空",
  "별": "星",
  "별빛": "星光",
  "손": "手",
  "마음": "心、心情",
  "눈": "眼睛；雪",
  "길": "路",
  "노래": "歌",
  "꿈": "夢",
  "기다리다": "等待",
  "가다": "去",
  "오다": "來",
  "보다": "看",
  "잡다": "抓、牽",
  "너": "你",
  "나": "我",
  "우리": "我們"
};

// ===================== Seed data =====================

function buildTheDayAlbum(): Album {
  return {
    id: uid(),
    title: "The Day",
    releaseDate: "2015-09-07",
    songs: [
      { id: uid(), title: "Free하게 (Freely)", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [], notes: "請用『貼上歌詞/翻譯』加入內容。" },
      { id: uid(), title: "Congratulations", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [], notes: "請用『貼上歌詞/翻譯』加入內容。" },
      { id: uid(), title: "이상하게 계속 이래 (Out of My Mind)", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [], notes: "請用『貼上歌詞/翻譯』加入內容。" },
      { id: uid(), title: "버릇이 됐어 (Habits)", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [], notes: "請用『貼上歌詞/翻譯』加入內容。" },
      { id: uid(), title: "아마도 (Like That Sun)", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [], notes: "請用『貼上歌詞/翻譯』加入內容。" },
      { id: uid(), title: "Colors", releaseDate: "2015-09-07", lyrics: [], vocab: [], grammar: [], notes: "請用『貼上歌詞/翻譯』加入內容。" }
    ]
  };
}

const DEFAULT_DATA: AppData = {
  artist: "DAY6",
  updatedAt: new Date().toISOString(),
  version: "1.6.0",
  albums: [buildTheDayAlbum()]
};

// ===================== Self tests =====================

function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];
  try {
    const lines = alignLyrics("가\n나\n다", "甲\n乙");
    const ok = lines.length === 3 && lines[0].kor === "가" && lines[1].zh === "乙" && lines[2].zh === "";
    results.push({ name: "align basic", passed: ok, message: ok ? "ok" : "mismatch" });
  } catch (e) { results.push({ name: "align basic", passed: false, message: String(e) }); }

  try {
    const tokens = tokenizeKoreanUnique("밤하늘 별빛 아래");
    const ok = tokens.includes("밤하늘") && tokens.includes("별빛");
    results.push({ name: "unique tokens", passed: ok, message: ok ? "ok" : tokens.join(",") });
  } catch (e) { results.push({ name: "unique tokens", passed: false, message: String(e) }); }

  try {
    const csv = toCSV([["A,B", 'C"D']]);
    const ok = csv === '"A,B","C""D"';
    results.push({ name: "csv escape", passed: ok, message: ok ? "ok" : csv });
  } catch (e) { results.push({ name: "csv escape", passed: false, message: String(e) }); }

  try {
    const ok = isHangul("가") && !isHangul("A");
    results.push({ name: "isHangul", passed: ok, message: ok ? "ok" : "fail" });
  } catch (e) { results.push({ name: "isHangul", passed: false, message: String(e) }); }

  try {
    const lines = alignLyrics("가\n나", "甲\n乙\n丙");
    const ok = lines.length === 3 && lines[2].kor === "" && lines[2].zh === "丙";
    results.push({ name: "align zh longer", passed: ok, message: ok ? "ok" : "fail" });
  } catch (e) { results.push({ name: "align zh longer", passed: false, message: String(e) }); }

  try {
    const lines = alignLyrics("", "");
    const ok = lines.length === 1 && lines[0].kor === "" && lines[0].zh === "";
    results.push({ name: "align empty", passed: ok, message: ok ? "ok" : "fail" });
  } catch (e) { results.push({ name: "align empty", passed: false, message: String(e) }); }

  try {
    const csv = toCSV([["X"], ["Y"]]);
    const ok = csv.split("\n").length === 2;
    results.push({ name: "csv multi rows", passed: ok, message: ok ? "ok" : csv });
  } catch (e) { results.push({ name: "csv multi rows", passed: false, message: String(e) }); }

  // timecode tests
  try {
    const a = parseTimecode("01:23");
    const b = parseTimecode("1:02:03.250");
    const ok = Math.abs((a ?? 0) - 83) < 1e-6 && Math.abs((b ?? 0) - 3723.25) < 1e-6;
    results.push({ name: "timecode parse", passed: ok, message: ok ? "ok" : `${a}, ${b}` });
  } catch (e) { results.push({ name: "timecode parse", passed: false, message: String(e) }); }

  try {
    const s = formatTimecode(3723.25);
    results.push({ name: "timecode format", passed: s.startsWith("01:02:03"), message: s });
  } catch (e) { results.push({ name: "timecode format", passed: false, message: String(e) }); }

  return results;
}

// ===================== UI atoms =====================

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-full border px-2 py-0.5 text-xs">{children}</span>;
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div>{right}</div>
      </div>
      <div className="rounded-2xl border bg-white/60 p-4 shadow-sm">{children}</div>
    </div>
  );
}

function IconButton({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-1.5 text-sm active:scale-[0.99] ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-black/5"}`}
    >
      {label}
    </button>
  );
}

// ===================== App =====================

export default function App() {
  const [data, setData] = useState<AppData>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("day6_lyrics_app_data") : null;
    if (saved) { try { return JSON.parse(saved) as AppData; } catch { /* ignore */ } }
    return DEFAULT_DATA;
  });

  const [selected, setSelected] = useState<{ albumId: string; songId: string } | null>(() => {
    const a0 = data.albums[0];
    const s0 = a0?.songs[0];
    return a0 && s0 ? { albumId: a0.id, songId: s0.id } : null;
  });

  const [query, setQuery] = useState("");
  const [hideKor, setHideKor] = useState(false);
  const [hideZh, setHideZh] = useState(false);
  const [tests, setTests] = useState<TestResult[]>([]);

  // audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoopLine, setIsLoopLine] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  useEffect(() => {
    const newData = { ...data, updatedAt: new Date().toISOString() };
    if (typeof window !== "undefined") localStorage.setItem("day6_lyrics_app_data", JSON.stringify(newData));
  }, [data]);

  useEffect(() => { setTests(runSelfTests()); }, []);

  const albumsSorted = useMemo(() => [...data.albums].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)), [data.albums]);

  const current = useMemo(() => {
    if (!selected) return null as { album?: Album; song?: Song } | null;
    const album = data.albums.find(a => a.id === selected.albumId);
    const song = album?.songs.find(s => s.id === selected.songId);
    return song ? ({ album, song } as { album?: Album; song: Song }) : null;
  }, [data, selected]);

  // ---------- CRUD & tools ----------

  function addAlbum() {
    const title = prompt("專輯名稱"); if (!title) return;
    const releaseDate = prompt("發行日(YYYY-MM-DD)") || new Date().toISOString().slice(0, 10);
    const album: Album = { id: uid(), title, releaseDate, songs: [] };
    setData(d => ({ ...d, albums: [...d.albums, album] }));
  }

  function bulkAddAlbumWithTracks() {
    const title = prompt("專輯名稱"); if (!title) return;
    const releaseDate = prompt("專輯發行日(YYYY-MM-DD)") || new Date().toISOString().slice(0, 10);
    const raw = prompt("貼上曲目清單: 每行一首歌名") || "";
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const songs: Song[] = lines.map(name => ({ id: uid(), title: name, releaseDate, lyrics: [], vocab: [], grammar: [] }));
    const album: Album = { id: uid(), title, releaseDate, songs };
    setData(d => ({ ...d, albums: [...d.albums, album] }));
  }

  function addSong(albumId: string) {
    const title = prompt("歌曲名稱"); if (!title) return;
    const releaseDate = prompt("歌曲發行日(YYYY-MM-DD)") || "";
    const song: Song = { id: uid(), title, releaseDate, lyrics: [], vocab: [], grammar: [] };
    setData(d => ({ ...d, albums: d.albums.map(a => (a.id === albumId ? { ...a, songs: [...a.songs, song] } : a)) }));
  }

  function updateSong(songId: string, patch: Partial<Song>) {
    setData(d => ({
      ...d,
      albums: d.albums.map(a => ({ ...a, songs: a.songs.map(s => (s.id === songId ? { ...s, ...patch } : s)) }))
    }));
  }

  function importLyrics(albumId: string, songId: string) {
    const korRaw = prompt("貼上【韓文歌詞】逐行\n\n請確認你擁有合法使用權(個人學習用途)") || "";
    const zhRaw = prompt("貼上【繁中翻譯】逐行(可與韓文行數不同)") || "";
    const lines = alignLyrics(korRaw, zhRaw);
    setData(d => ({
      ...d,
      albums: d.albums.map(a => {
        if (a.id !== albumId) return a;
        return { ...a, songs: a.songs.map(s => (s.id === songId ? { ...s, lyrics: lines } : s)) };
      })
    }));
  }

  function removeLyricLine(song: Song, lineId: string) {
    updateSong(song.id, { lyrics: song.lyrics.filter(l => l.id !== lineId) });
  }

  function addLyricLine(song: Song, idx: number) {
    const newLine: LyricLine = { id: uid(), kor: "", zh: "" };
    const next = [...song.lyrics.slice(0, idx + 1), newLine, ...song.lyrics.slice(idx + 1)];
    updateSong(song.id, { lyrics: next });
  }

  function dedupeVocab(v: VocabItem[]): VocabItem[] {
    const map = new Map<string, VocabItem>();
    for (const it of v) { const key = (it.word || "").trim(); if (!map.has(key)) map.set(key, it); }
    return Array.from(map.values());
  }

  function autoExtractVocab(song: Song) {
    const words = tokenizeKoreanUnique(song.lyrics.map(l => l.kor).join("\n"));
    const newItems: VocabItem[] = words.map(w => ({ id: uid(), word: w, zh: BASIC_KO_ZH[w] || "" }));
    const merged = dedupeVocab([...(song.vocab || []), ...newItems]);
    updateSong(song.id, { vocab: merged });
  }

  function autoSuggestGrammar(song: Song) {
    const patterns: { key: string; desc: string; test: (s: string) => boolean }[] = [
      { key: "-네요", desc: "語氣詞: 驚訝/感嘆", test: s => /네요\b/.test(s) },
      { key: "-겠-", desc: "推測/意志", test: s => /겠/.test(s) },
      { key: "-았/었-", desc: "過去時", test: s => /(았|었)/.test(s) },
      { key: "-(으)니까", desc: "因為/所以", test: s => /(으)?니까/.test(s) },
      { key: "-거든요", desc: "補充理由/軟化語氣", test: s => /거든요/.test(s) },
      { key: "-지만", desc: "轉折", test: s => /지만/.test(s) },
      { key: "-는데", desc: "鋪陳/轉折", test: s => /는데/.test(s) },
      { key: "-고 싶다", desc: "想要", test: s => /고\s*싶/.test(s) },
      { key: "-(으)ㄹ게요", desc: "承諾/意志", test: s => /(ㄹ게요|을게요)/.test(s) },
      { key: "-(으)ㄹ까요", desc: "提議/猜測", test: s => /(ㄹ까요|을까요)/.test(s) }
    ];

    const found: GrammarPoint[] = [];
    for (const line of song.lyrics) {
      const s = line.kor;
      for (const p of patterns) {
        if (p.test(s) && !song.grammar.some(g => g.pattern === p.key)) {
          found.push({ id: uid(), pattern: p.key, explanation: p.desc, examples: [{ kor: s, zh: line.zh }] });
        }
      }
    }
    if (found.length === 0) { alert("目前偵測不到常見語尾/構式, 或請先貼上歌詞"); return; }
    updateSong(song.id, { grammar: [...song.grammar, ...found] });
  }

  function exportJSON() {
    const clean = { ...data, updatedAt: new Date().toISOString() };
    download(`day6-lyrics-${Date.now()}.json`, JSON.stringify(clean, null, 2));
  }

  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try { const parsed = JSON.parse(String(reader.result)); setData(parsed); }
      catch { alert("JSON 解析失敗, 請確認檔案格式"); }
    };
    reader.readAsText(file);
  }

  function exportCSVVocab(album?: Album, song?: Song) {
    const rows: string[][] = [["Album", "Song", "Word", "POS", "Chinese", "Memo"]];
    const scopeAlbums = album ? [album] : data.albums;
    scopeAlbums.forEach(a => {
      const scopeSongs = song ? [song] : a.songs;
      scopeSongs.forEach(s => {
        s.vocab.forEach(v => rows.push([a.title, s.title, v.word, v.pos || "", v.zh || "", v.memo || ""]));
      });
    });
    download(`vocab-${Date.now()}.csv`, toCSV(rows));
  }

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as { album: Album; song: Song; where: string; snippet: string }[];
    const results: { album: Album; song: Song; where: string; snippet: string }[] = [];
    for (const a of data.albums) {
      for (const s of a.songs) {
        if (s.title.toLowerCase().includes(q.toLowerCase())) results.push({ album: a, song: s, where: "歌名", snippet: s.title });
        for (const l of s.lyrics) {
          if (l.kor.includes(q) || l.zh.includes(q)) results.push({ album: a, song: s, where: "歌詞", snippet: `${l.kor} / ${l.zh}`.slice(0, 80) });
        }
        for (const v of s.vocab) {
          if ((v.word || "").includes(q) || (v.zh || "").includes(q)) results.push({ album: a, song: s, where: "詞彙", snippet: `${v.word} - ${v.zh || ""}` });
        }
        for (const g of s.grammar) {
          if ((g.pattern || "").includes(q) || (g.explanation || "").includes(q)) results.push({ album: a, song: s, where: "文法", snippet: `${g.pattern} - ${(g.explanation || "").slice(0, 60)}` });
        }
      }
    }
    return results.slice(0, 200);
  }, [query, data]);

  // audio helpers
  function playLine(line: LyricLine) {
    const a = audioRef.current; if (!a) return;
    const start = line.start ?? 0; const end = line.end && line.end > start ? line.end : undefined;
    a.currentTime = start;
    setActiveLineId(line.id);
    a.play();
    if (end != null) {
      const onTime = () => {
        if (a.currentTime >= end) {
          if (isLoopLine) {
            a.currentTime = start;
          } else {
            a.pause();
            a.removeEventListener('timeupdate', onTime);
          }
        }
      };
      a.addEventListener('timeupdate', onTime);
      const onEnded = () => a.removeEventListener('timeupdate', onTime);
      a.addEventListener('ended', onEnded, { once: true });
    }
  }

  function setStartFromNow(line: LyricLine) {
    const a = audioRef.current; if (!a) return;
    updateSong(current!.song!.id, { lyrics: current!.song!.lyrics.map(l => l.id === line.id ? { ...l, start: a.currentTime } : l) });
  }
  function setEndFromNow(line: LyricLine) {
    const a = audioRef.current; if (!a) return;
    updateSong(current!.song!.id, { lyrics: current!.song!.lyrics.map(l => l.id === line.id ? { ...l, end: a.currentTime } : l) });
  }

  function bulkPasteLRC(song: Song) {
    const raw = prompt("貼上時間戳, 格式: mm:ss(.ms) 歌詞\n例如: 01:23 첫줄\n支援: hh:mm:ss.ms 亦可; 只會寫入 start, 不改 zh");
    if (!raw) return;
    const lines = raw.split(/\r?\n/);
    const parsed: { t: number; text: string }[] = [];
    for (const ln of lines) {
      const m = ln.match(/^(\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?\s+(.*)$/);
      if (!m) continue;
      const t = parseTimecode(m[0].split(/\s+/)[0] || "");
      const text = ln.replace(/^(\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?\s+/, "");
      if (t != null) parsed.push({ t, text });
    }
    if (parsed.length === 0) { alert("未解析到有效時間戳"); return; }
    const next = [...song.lyrics];
    for (let i = 0; i < Math.min(parsed.length, next.length); i++) {
      next[i] = { ...next[i], start: parsed[i].t, kor: next[i].kor || parsed[i].text };
    }
    updateSong(song.id, { lyrics: next });
  }

  function exportTimestamps(song: Song) {
    const rows = song.lyrics.map((l, i) => [String(i + 1), formatTimecode(l.start), formatTimecode(l.end), l.kor, l.zh]);
    const csv = toCSV([["#", "start", "end", "kor", "zh"], ...rows]);
    download(`timestamps-${song.title}-${Date.now()}.csv`, csv);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="text-xl font-bold">DAY6 歌詞學韓文</div>
          <Badge>中韓對照</Badge>
          <Badge>詞彙</Badge>
          <Badge>文法</Badge>
          <Badge>音檔</Badge>
          <div className="ml-auto flex items-center gap-2">
            <input
              placeholder="搜尋: 歌名 / 歌詞 / 詞彙 / 文法"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-72 rounded-xl border px-3 py-1.5 outline-none focus:ring"
            />
            <IconButton label="匯出 JSON" onClick={() => { const clean = { ...data, updatedAt: new Date().toISOString() }; download(`day6-lyrics-${Date.now()}.json`, JSON.stringify(clean, null, 2)); }} />
            <label className="cursor-pointer rounded-xl border px-3 py-1.5 text-sm hover:bg-black/5">
              匯入 JSON
              <input type="file" accept="application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f); }} />
            </label>
            <IconButton label="大量新增曲目" onClick={bulkAddAlbumWithTracks} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-12 gap-6 px-4 py-6">
        <aside className="col-span-12 lg:col-span-3">
          <Section title="專輯(依發行日)" right={<IconButton label="新增專輯" onClick={addAlbum} />}>
            <div className="space-y-4">
              {albumsSorted.map(a => (
                <div key={a.id} className="rounded-xl border bg-white/70 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{a.title}</div>
                      <div className="text-xs text-gray-500">{a.releaseDate}</div>
                    </div>
                    <IconButton label="+新增歌曲" onClick={() => addSong(a.id)} />
                  </div>
                  <ul className="mt-2 space-y-1">
                    {a.songs
                      .sort((x, y) => (x.releaseDate || "").localeCompare(y.releaseDate || ""))
                      .map(s => (
                        <li key={s.id}>
                          <button
                            onClick={() => setSelected({ albumId: a.id, songId: s.id })}
                            className={`w-full rounded-lg px-2 py-1 text-left hover:bg-black/5 ${selected?.songId === s.id ? "bg-black/5 font-medium" : ""}`}
                          >
                            {s.title}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          {query && (
            <Section title={`搜尋結果(${searchResults.length})`}>
              <ul className="max-h-[40vh] space-y-2 overflow-auto pr-1">
                {searchResults.map((r, i) => (
                  <li key={i}>
                    <div className="text-sm"><span className="font-medium">[{r.where}]</span> {r.album.title} • {r.song.title}</div>
                    <div className="truncate text-xs text-gray-600">{r.snippet}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>

        <section className="col-span-12 lg:col-span-9">
          {!current?.song ? (
            <div className="text-gray-500">請從左側建立或選擇一首歌曲。</div>
          ) : (
            <div>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-bold">{current.song.title}</h1>
                  <div className="text-xs text-gray-500">{current.album?.title} • {current.song.releaseDate || current.album?.releaseDate}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    placeholder="貼上音檔 URL (mp3, m4a, etc.)"
                    value={current.song.audioUrl || ""}
                    onChange={e => updateSong(current.song.id, { audioUrl: e.target.value })}
                    className="w-72 rounded-xl border px-3 py-1.5 text-sm"
                  />
                  <IconButton label="貼上歌詞/翻譯" onClick={() => current.album && importLyrics(current.album.id, current.song.id)} disabled={!current.album} />
                  <IconButton label="自動擷取詞彙" onClick={() => autoExtractVocab(current.song)} />
                  <IconButton label="文法自動偵測" onClick={() => autoSuggestGrammar(current.song)} />
                  <IconButton label="匯出此歌詞彙CSV" onClick={() => current.album && exportCSVVocab(current.album, current.song)} disabled={!current.album} />
                  <IconButton label={isLoopLine ? "循環單句:開" : "循環單句:關"} onClick={() => setIsLoopLine(v => !v)} />
                  <IconButton label="貼上時間戳(LRC)" onClick={() => bulkPasteLRC(current.song)} />
                  <IconButton label="匯出時間戳CSV" onClick={() => exportTimestamps(current.song)} />
                </div>
              </div>

              <div className="mb-4 rounded-xl border bg-white/70 p-3">
                <audio ref={audioRef} src={current.song.audioUrl} controls className="w-full" preload="auto" />
              </div>

              <Section title="歌詞(中韓對照 + 時間戳)" right={
                <div className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={hideKor} onChange={e => setHideKor(e.target.checked)} /> 隱藏韓文</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={hideZh} onChange={e => setHideZh(e.target.checked)} /> 隱藏中文</label>
                </div>
              }>
                <div className="grid grid-cols-12 gap-3">
                  {current.song.lyrics.map((line, idx) => (
                    <div key={line.id} className={`col-span-12 grid grid-cols-12 items-start gap-2 border-b py-2 ${activeLineId === line.id ? 'bg-amber-50' : ''}`}>
                      <div className="col-span-3 flex items-center gap-1">
                        <input
                          placeholder="start 01:23.456"
                          value={formatTimecode(line.start)}
                          onChange={e => {
                            const v = parseTimecode(e.target.value);
                            const next = [...current.song.lyrics];
                            next[idx] = { ...line, start: v ?? undefined };
                            updateSong(current.song.id, { lyrics: next });
                          }}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                        <span>-</span>
                        <input
                          placeholder="end 01:25.000"
                          value={formatTimecode(line.end)}
                          onChange={e => {
                            const v = parseTimecode(e.target.value);
                            const next = [...current.song.lyrics];
                            next[idx] = { ...line, end: v ?? undefined };
                            updateSong(current.song.id, { lyrics: next });
                          }}
                          className="w-28 rounded-lg border px-2 py-1 text-sm"
                        />
                        <IconButton label="Set⟲" onClick={() => setStartFromNow(line)} />
                        <IconButton label="Set⟶" onClick={() => setEndFromNow(line)} />
                        <IconButton label="▶︎" onClick={() => playLine(line)} />
                      </div>
                      <div className="col-span-4 whitespace-pre-wrap leading-relaxed">
                        {hideKor ? (
                          <span className="text-gray-400">••••••</span>
                        ) : (
                          <textarea
                            value={line.kor}
                            onChange={e => { const next = [...current.song.lyrics]; next[idx] = { ...line, kor: e.target.value }; updateSong(current.song.id, { lyrics: next }); }}
                            className="w-full resize-y bg-transparent outline-none"
                            rows={Math.max(1, line.kor.split(/\n/).length)}
                          />
                        )}
                      </div>
                      <div className="col-span-4 whitespace-pre-wrap leading-relaxed">
                        {hideZh ? (
                          <span className="text-gray-400">──────</span>
                        ) : (
                          <textarea
                            value={line.zh}
                            onChange={e => { const next = [...current.song.lyrics]; next[idx] = { ...line, zh: e.target.value }; updateSong(current.song.id, { lyrics: next }); }}
                            className="w-full resize-y bg-transparent outline-none"
                            rows={Math.max(1, line.zh.split(/\n/).length)}
                          />
                        )}
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-2">
                        <IconButton label="+行" onClick={() => addLyricLine(current.song, idx)} />
                        <IconButton label="刪" onClick={() => removeLyricLine(current.song, line.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="詞彙表(可編輯)" right={<IconButton label="匯出此歌詞彙CSV" onClick={() => current.album && exportCSVVocab(current.album, current.song)} disabled={!current.album} />}>
                <VocabEditor song={current.song} onChange={next => updateSong(current.song.id, { vocab: next })} />
              </Section>

              <Section title="文法點(可新增例句)">
                <GrammarEditor song={current.song} onChange={next => updateSong(current.song.id, { grammar: next })} />
              </Section>

              <Section title="統計與自我測試(Self-tests)">
                <StatsAndStudy song={current.song} />
                <div className="mt-4 rounded-xl border bg-white/70 p-3">
                  <div className="mb-2 text-sm font-medium">內建測試結果</div>
                  <ul className="space-y-1 text-sm">
                    {tests.map((t, i) => (
                      <li key={i} className={t.passed ? "text-emerald-700" : "text-red-700"}>
                        {t.passed ? "✓" : "✗"} {t.name} - {t.message}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2"><IconButton label="重新執行測試" onClick={() => setTests(runSelfTests())} /></div>
                </div>
              </Section>
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-gray-500">
        <div className="border-t pt-4">© {new Date().getFullYear()} DAY6 Lyrics Study (Personal Use). 個人學習用途, 請尊重著作權。</div>
      </footer>
    </div>
  );
}

// ===================== Subcomponents =====================

function VocabEditor({ song, onChange }: { song: Song; onChange: (v: VocabItem[]) => void }) {
  const [filter, setFilter] = useState("");
  const list = useMemo(() => song.vocab.filter(v => {
    const q = filter.trim(); if (!q) return true;
    return (v.word || "").includes(q) || (v.zh || "").includes(q) || (v.pos || "").includes(q);
  }), [song.vocab, filter]);

  function add() { onChange([{ id: uid(), word: "", pos: "", zh: "" }, ...song.vocab]); }
  function update(id: string, patch: Partial<VocabItem>) { onChange(song.vocab.map(v => (v.id === id ? { ...v, ...patch } : v))); }
  function del(id: string) { onChange(song.vocab.filter(v => v.id !== id)); }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <IconButton label="+新增詞彙" onClick={add} />
        <input placeholder="過濾詞彙..." value={filter} onChange={e => setFilter(e.target.value)} className="rounded-xl border px-3 py-1.5 text-sm" />
      </div>
      <div className="max-h-[40vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b text-left">
              <th className="w-40 py-2 pr-2">韓文</th>
              <th className="w-24 py-2 pr-2">詞性</th>
              <th className="py-2 pr-2">中文</th>
              <th className="w-52 py-2 pr-2">備註</th>
              <th className="w-24 py-2 pr-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map(v => (
              <tr key={v.id} className="border-b align-top">
                <td className="py-2 pr-2"><input value={v.word} onChange={e => update(v.id, { word: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2"><input value={v.pos || ""} onChange={e => update(v.id, { pos: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2"><input value={v.zh || ""} onChange={e => update(v.id, { zh: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2"><input value={v.memo || ""} onChange={e => update(v.id, { memo: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                <td className="py-2 pr-2 text-right"><IconButton label="刪除" onClick={() => del(v.id)} /></td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-500">目前沒有符合過濾條件的詞彙。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrammarEditor({ song, onChange }: { song: Song; onChange: (v: GrammarPoint[]) => void }) {
  function add() { onChange([{ id: uid(), pattern: "", explanation: "", examples: [] }, ...song.grammar]); }
  function update(id: string, patch: Partial<GrammarPoint>) { onChange(song.grammar.map(g => (g.id === id ? { ...g, ...patch } : g))); }
  function del(id: string) { onChange(song.grammar.filter(g => g.id !== id)); }

  return (
    <div>
      <div className="mb-2"><IconButton label="+新增文法點" onClick={add} /></div>
      <div className="max-h-[40vh] space-y-3 overflow-auto pr-1">
        {song.grammar.map(g => (
          <div key={g.id} className="rounded-xl border p-3">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12 md:col-span-4">
                <div className="mb-1 text-xs text-gray-500">文法型態</div>
                <input value={g.pattern} onChange={e => update(g.id, { pattern: e.target.value })} className="w-full rounded-lg border px-2 py-1" placeholder="如: -았/었-, -(으)니까, -거든요" />
              </div>
              <div className="col-span-12 md:col-span-8">
                <div className="mb-1 text-xs text-gray-500">說明(繁中)</div>
                <textarea value={g.explanation || ""} onChange={e => update(g.id, { explanation: e.target.value })} className="min-h-[60px] w-full rounded-lg border px-2 py-1" />
              </div>
            </div>
            <div className="mt-2">
              <div className="mb-1 text-xs text-gray-500">例句</div>
              {(g.examples || []).map((ex, i) => (
                <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                  <input value={ex.kor} onChange={e => { const next = [...(g.examples || [])]; next[i] = { ...ex, kor: e.target.value }; update(g.id, { examples: next }); }} className="col-span-6 rounded-lg border px-2 py-1" placeholder="韓文" />
                  <input value={ex.zh || ""} onChange={e => { const next = [...(g.examples || [])]; next[i] = { ...ex, zh: e.target.value }; update(g.id, { examples: next }); }} className="col-span-6 rounded-lg border px-2 py-1" placeholder="中文" />
                </div>
              ))}
              <IconButton label="+新增例句" onClick={() => update(g.id, { examples: [...(g.examples || []), { kor: "", zh: "" }] })} />
              <span className="mx-2 text-gray-400">|</span>
              <IconButton label="刪除此文法點" onClick={() => del(g.id)} />
            </div>
          </div>
        ))}
        {song.grammar.length === 0 && <div className="py-6 text-center text-gray-500">尚未新增文法點。</div>}
      </div>
    </div>
  );
}

function StatsAndStudy({ song }: { song: Song }) {
  const [reveal, setReveal] = useState(false);
  const freq = useMemo(() => {
    const tokens = tokenizeKoreanAll(song.lyrics.map(l => l.kor).join("\n"));
    const map = new Map<string, number>();
    for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [song.lyrics]);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 md:col-span-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-medium">學習模式</div>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={reveal} onChange={e => setReveal(e.target.checked)} /> 顯示中文</label>
        </div>
        <div className="max-h-[300px] overflow-auto rounded-xl border bg-white/70 p-3">
          {song.lyrics.map(l => (
            <div key={l.id} className="grid grid-cols-12 gap-2 border-b py-1 last:border-none">
              <div className="col-span-6">{l.kor || <span className="text-gray-400">(韓文空白)</span>}</div>
              <div className="col-span-6">{reveal ? (l.zh || <span className="text-gray-400">(中文空白)</span>) : <span className="text-gray-300">────────</span>}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="col-span-12 md:col-span-6">
        <div className="mb-2 font-medium">詞頻 Top 20</div>
        <div className="rounded-xl border bg-white/70 p-3">
          {freq.length === 0 ? (
            <div className="text-sm text-gray-500">尚無資料。</div>
          ) : (
            <ol className="text-sm">
              {freq.map(([w, c]) => (
                <li key={w} className="flex items-center justify-between border-b py-1 last:border-none">
                  <span>{w}</span>
                  <span className="text-xs text-gray-500">{c}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
