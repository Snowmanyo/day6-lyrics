import React, { useEffect, useMemo, useRef, useState } from "react";

// ================ ASCII-safe constants & helpers ================
const HAMBURGER = "\u2630"; // ☰ (unicode escape to avoid encoding issues)

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// align kor/zh by line count (shorter side padded with empty)
function alignLyrics(korRaw: string, zhRaw: string) {
  const kor = korRaw.split(/\r?\n/);
  const zh = zhRaw.split(/\r?\n/);
  const max = Math.max(kor.length, zh.length);
  const out: { kor: string; zh: string }[] = [];
  for (let i = 0; i < max; i++) out.push({ kor: kor[i] || "", zh: zh[i] || "" });
  return out;
}

// basic tokenization for Korean (for demo vocab extraction)
const isHangul = (s: string) => /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(s);
function tokenizeKorean(text: string) {
  return text
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/)
    .filter(Boolean)
    .filter(isHangul);
}

// ================ Sample Data (DAY6 – Congratulations) ================
const SAMPLE_KOR = `이제는 연락조차 받질 않아
너 대신 들리는 무미건조한 목소리
힘든 날들도 있는 건데
잠깐을 못 이겨
또 다른 대안을 찾아가

시간을 가지자
이 말을 난 있는 그대로
시간을 가지잔
뜻으로 받아들여 버렸어

Congratulations 넌 참 대단해
Congratulations 어쩜 그렇게
아무렇지 않아
하며 날 짓밟아
웃는 얼굴을 보니 다 잊었나 봐`;

const SAMPLE_ZH = `現在你連電話也不接
枯燥無味的聲音代替了你
人生本來就有艱難的日子
一下子沒有熬過
就又去找另一個人

我們各自冷靜一下
這句話我以為真的就是按字面
「只是冷靜一下」
地理解的

Congratulations 你真的了不起
Congratulations 你怎麼可以
毫無感覺地
這樣踐踏我
看著你的笑臉，看來你已經忘記我`;

const SAMPLE_VOCAB = [
  { word: "연락", zh: "聯絡" },
  { word: "목소리", zh: "聲音" },
  { word: "대단하다", zh: "了不起" },
  { word: "아무렇지 않다", zh: "毫不在乎" },
  { word: "웃는 얼굴", zh: "笑臉" },
];

const SAMPLE_GRAMMAR = [
  { pattern: "-잖아(요)", explain: "不是說/不是…嗎（提醒已知事實）" },
  { pattern: "-아/어 버리다", explain: "（不自覺地/徹底地）做完，帶有遺憾/可惜" },
  { pattern: "-(으)ㄴ/는 그대로", explain: "照著原樣、如實" },
];

// ================ Small UI atoms ================
function TabButton({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ` +
        (active ? "bg-black text-white dark:bg-white dark:text-black" : "border hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10")
      }
    >
      {children}
    </button>
  );
}

function ToolbarButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm hover:bg-black/5 active:scale-[0.99] dark:border-zinc-700 dark:hover:bg-white/10">{children}</button>
  );
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
        <div className="absolute right-0 z-[9999] mt-1 w-48 overflow-hidden rounded-lg border bg-white py-1 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900" style={{ transform: 'translateZ(0)' }}>
          {items}
        </div>
      )}
    </div>
  );
}

// ================ Desktop Sidebar / Mobile Drawer ================
function DesktopSidebar({ onAddAlbum, onAddSong }: { onAddAlbum: () => void; onAddSong: () => void }) {
  return (
    <div className="h-full overflow-hidden">
      <div className="flex items-center justify-between border-b p-3 dark:border-zinc-800">
        <div className="font-semibold">專輯 / 歌曲</div>
        <div className="flex gap-2">
          <button onClick={onAddAlbum} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">+ 專輯</button>
          <button onClick={onAddSong} className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">+ 歌曲</button>
        </div>
      </div>
      <div className="h-[calc(100%-49px)] overflow-auto p-2">
        <div className="mb-3 rounded-xl border p-2 dark:border-zinc-800">
          <div className="font-medium">The Day</div>
          <div className="text-xs text-zinc-500">2015-09-07</div>
          <ul className="mt-2 space-y-1">
            {['Freely','Congratulations','Out of My Mind'].map(s => (
              <li key={s}><button className="w-full rounded-lg px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10"><div className="truncate">{s}</div></button></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-[9000] md:hidden ${open ? '' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div className={`absolute left-0 top-0 h-full w-[300px] transform bg-white shadow-2xl transition-transform dark:bg-zinc-900 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b p-3 dark:border-zinc-800"><div className="font-semibold">專輯 / 歌曲</div><button className="rounded-lg border px-2 py-1 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={onClose}>關閉</button></div>
        <div className="h-[calc(100%-49px)] overflow-auto p-3">
          {['The Day'].map(a => (
            <div key={a} className="mb-3 rounded-xl border p-2 dark:border-zinc-800">
              <div className="font-medium">{a}</div>
              <div className="text-xs text-zinc-500">2015-09-07</div>
              <ul className="mt-2 space-y-1">{['Freely','Congratulations','Out of My Mind'].map(s => (<li key={s}><button className="w-full rounded-lg px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10"><div className="truncate">{s}</div></button></li>))}</ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================ Learning Panels ================
function LyricsPanel({ kor, zh, setKor, setZh, editMode, setEditMode }: { kor: string; zh: string; setKor: (s: string)=>void; setZh: (s: string)=>void; editMode: boolean; setEditMode: (v: boolean)=>void; }) {
  const aligned = useMemo(() => alignLyrics(kor, zh), [kor, zh]);
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
            <textarea value={kor} onChange={e=>setKor(e.target.value)} className="h-48 w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="mb-1 text-xs text-zinc-500">中文歌詞（每行一句）</div>
            <textarea value={zh} onChange={e=>setZh(e.target.value)} className="h-48 w-full rounded-lg border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium">對照預覽</div>
        <div className="max-h-[300px] overflow-auto rounded-xl border bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60">
          {aligned.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 border-b px-3 py-2 last:border-none">
              <div className="col-span-6 whitespace-pre-wrap">{l.kor || <span className="text-zinc-400">(空)</span>}</div>
              <div className="col-span-6 whitespace-pre-wrap">{l.zh || <span className="text-zinc-400">(空)</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VocabPanel({ kor }: { kor: string }) {
  const tokens = useMemo(() => tokenizeKorean(kor), [kor]);
  const top = useMemo(() => {
    const map = new Map<string, number>(); tokens.forEach(t => map.set(t, (map.get(t)||0)+1));
    return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20);
  }, [tokens]);
  return (
    <div className="rounded-2xl border bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-3 text-sm font-medium">單字表（含中文）</div>
      <div className="overflow-auto rounded-xl border dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-white/70 dark:bg-zinc-900/60">
            <tr className="border-b dark:border-zinc-800 text-left">
              <th className="w-1/2 px-3 py-2">韓文</th>
              <th className="w-1/2 px-3 py-2">中文</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_VOCAB.map(v => (
              <tr key={v.word} className="border-b dark:border-zinc-800">
                <td className="px-3 py-2">{v.word}</td>
                <td className="px-3 py-2">{v.zh}</td>
              </tr>
            ))}
            {SAMPLE_VOCAB.length === 0 && (
              <tr><td colSpan={2} className="px-3 py-4 text-center text-zinc-500">尚無單字</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 mb-2 text-sm font-medium">詞頻 Top 20（自動統計，僅供參考）</div>
      {top.length===0 ? <div className="text-sm text-zinc-500">尚無資料</div> : (
        <ol className="text-sm">{top.map(([w,c]) => (<li key={w} className="flex items-center justify-between border-b py-1 last:border-none">
          <span>{w}</span><span className="text-xs text-zinc-500">{c}</span>
        </li>))}</ol>
      )}
    </div>
  );
}

function GrammarPanel() {
  return (
    <div className="rounded-2xl border bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 text-sm font-medium">文法點（示例）</div>
      <ul className="space-y-2 text-sm">
        {SAMPLE_GRAMMAR.map(g => (
          <li key={g.pattern} className="rounded-lg border p-3 dark:border-zinc-800">
            <div className="font-medium">{g.pattern}</div>
            <div className="text-zinc-600 dark:text-zinc-300">{g.explain}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlashcardPanel({ vocab }: { vocab: { word: string; zh: string }[] }) {
  // Session queue based SRS-like flow (使用所有單字)
  const [queue, setQueue] = useState<number[]>(() => vocab.map((_, i) => i));
  const [meta, setMeta] = useState(() => vocab.map(() => ({ firstSeen: false } as { firstSeen: boolean })));
  const [reveal, setReveal] = useState(false);

  const total = vocab.length;
  const currentIdx = queue[0] ?? null;
  const current = currentIdx != null ? vocab[currentIdx] : null;
  const firstSeenCount = meta.filter(m => m.firstSeen).length;

  useEffect(() => { setReveal(false); }, [currentIdx]);

  function grade(level: 'again' | 'good' | 'easy') {
    if (currentIdx == null) return;
    setMeta(m => {
      const next = [...m];
      if (!next[currentIdx].firstSeen) next[currentIdx].firstSeen = true;
      return next;
    });
    setQueue(q => {
      const rest = q.slice(1);
      if (level === 'again') {
        // put back soon: after ~2 cards
        const insertAt = Math.min(2, rest.length);
        const next = [...rest.slice(0, insertAt), currentIdx, ...rest.slice(insertAt)];
        return next;
      } else if (level === 'good') {
        // put at end
        return [...rest, currentIdx];
      } else {
        // easy: remove from queue
        return rest;
      }
    });
  }

  if (total === 0) return <div className="rounded-2xl border bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 text-sm text-zinc-500">尚無單字</div>;
  if (current == null) return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-2 text-sm">本輪完成！</div>
      <ToolbarButton onClick={() => { setQueue(vocab.map((_, i) => i)); setMeta(vocab.map(() => ({ firstSeen: false }))); }}>重新開始</ToolbarButton>
    </div>
  );

  return (
    <div className="rounded-2xl border bg-white/70 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
      {/* 進度顯示：僅顯示「已看過/總數」，不隨重複而倒退 */}
      <div className="mb-2 text-xs text-zinc-500">單字卡　已看過：{firstSeenCount}/{total}</div>
      <div className="text-2xl font-bold">{current.word}</div>
      <div className="mt-2 text-lg text-zinc-600 dark:text-zinc-300">{reveal ? current.zh : '———'}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <ToolbarButton onClick={() => setReveal(r => !r)}>{reveal ? '隱藏' : '顯示解答'}</ToolbarButton>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button onClick={() => grade('again')} className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">不熟</button>
        <button onClick={() => grade('good')} className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">一般</button>
        <button onClick={() => grade('easy')} className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10">很熟</button>
      </div>
    </div>
  );
}

// ================ Tiny self-tests (for sanity) ================
function runSelfTests() {
  const tests: { name: string; passed: boolean; message?: string }[] = [];
  try { tests.push({ name: 'hamburger unicode', passed: HAMBURGER.charCodeAt(0) === 0x2630 }); } catch (e) { tests.push({ name: 'hamburger unicode', passed: false, message: String(e) }); }
  try { const a = alignLyrics('가\n나', '甲'); tests.push({ name: 'align length', passed: a.length === 2 && a[1].kor === '나' && a[1].zh === '' }); } catch (e) { tests.push({ name: 'align length', passed: false, message: String(e) }); }
  try { const t = tokenizeKorean('연락 목소리 ABC'); tests.push({ name: 'tokenize hangul only', passed: t.every(x => /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(x)) }); } catch (e) { tests.push({ name: 'tokenize hangul only', passed: false, message: String(e) }); }
  try { tests.push({ name: 'flash uses all vocab', passed: SAMPLE_VOCAB.length >= 5 }); } catch (e) { tests.push({ name: 'flash uses all vocab', passed: false, message: String(e) }); }
  return tests;
}

function DevTests() {
  const [open, setOpen] = useState(false);
  const results = useMemo(() => runSelfTests(), []);
  const ok = results.every(r => r.passed);
  return (
    <div className="rounded-2xl border bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <button className="rounded-lg border px-3 py-1 text-sm hover:bg-black/5 dark:border-zinc-700 dark:hover:bg-white/10" onClick={() => setOpen(o => !o)}>{open ? '隱藏' : '顯示'} 開發測試結果 {ok ? '✅' : '⚠️'}</button>
      {open && (
        <ul className="mt-2 space-y-1 text-sm">
          {results.map((t, i) => (
            <li key={i} className={t.passed ? 'text-emerald-600' : 'text-red-600'}>
              {t.passed ? '✓' : '✗'} {t.name}{t.message ? ` - ${t.message}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ================ Main Layout ================
export default function App() {
  const [dark, setDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile overlay
  const [sidebarVisible, setSidebarVisible] = useState(true); // desktop visible/hidden (remember)
  const [tab, setTab] = useState<'lyrics' | 'vocab' | 'flash' | 'grammar'>('lyrics'); // order: lyrics, vocab, flash, grammar
  const [editMode, setEditMode] = useState(true);

  // sample state
  const [title] = useState('DAY6 – Congratulations');
  const [kor, setKor] = useState<string>(SAMPLE_KOR);
  const [zh, setZh] = useState<string>(SAMPLE_ZH);

  // remember dark + sidebar
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('lyrics_theme');
      const isDark = savedTheme === 'dark';
      setDark(isDark); document.documentElement.classList.toggle('dark', isDark);
      const side = localStorage.getItem('lyrics_sidebar');
      if (side === 'closed') setSidebarVisible(false);
    } catch {}
  }, []);

  const toggleDark = () => {
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('lyrics_theme', next ? 'dark' : 'light'); } catch {}
  };

  const toggleSidebar = () => {
    setSidebarVisible(v => {
      const next = !v; try { localStorage.setItem('lyrics_sidebar', next ? 'open' : 'closed'); } catch {}
      return next;
    });
  };

  const aligned = useMemo(()=>alignLyrics(kor, zh), [kor, zh]);

  // export CSV demo (aligned rows)
  function exportCSV() {
    const rows = aligned.map((r,i)=>[String(i+1), r.kor, r.zh]);
    const csv = ["#","kor","zh"].join(',') + "\n" + rows.map(r=> r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join("\n");
    download(`lyrics-sample.csv`, csv);
  }

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

            <div className="ml-auto flex flex-nowrap items-center gap-2">
              <input placeholder="搜尋：歌名 / 歌詞 / 詞彙 / 文法" className="w-60 max-w-[40vw] shrink-0 rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring dark:border-zinc-700 dark:bg-zinc-900 md:w-72" />
              <ToolbarButton onClick={toggleDark}>{dark ? '深色' : '淺色'}</ToolbarButton>

              <DropMenu label="匯入 / 匯出" items={<>
                <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={exportCSV}>匯出歌詞 CSV（示例）</button>
                <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>download('vocab-sample.csv', 'word,zh\n연락,聯絡\n목소리,聲音')}>匯出單字 CSV（示例）</button>
                <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>download('grammar-sample.csv', 'pattern,explain\n-잖아(요),不是說…嗎')} >匯出文法 CSV（示例）</button>
                <label className="block w-full cursor-pointer px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10">匯入 CSV<input type="file" className="hidden" multiple /></label>
              </>} />

              <DropMenu label="新增" items={<>
                <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10">新增專輯</button>
                <button className="block w-full px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/10">新增歌曲</button>
              </>} />
            </div>
          </div>
        </div>
      </header>

      {/* Body: desktop sidebar (visible only when toggled on) + content always visible */}
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <div className="md:flex md:gap-4">
          {sidebarVisible && (
            <div className="hidden w-[280px] shrink-0 rounded-xl border bg-white/70 dark:border-zinc-800 dark:bg-zinc-900/60 md:block">
              <DesktopSidebar onAddAlbum={()=>{}} onAddSong={()=>{}} />
            </div>
          )}

          {/* Main content always shown */}
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-2xl font-bold">{title}</div>
                <div className="text-xs text-zinc-500">示例資料（無音檔）</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-2">
                  <TabButton active={tab==='lyrics'} onClick={()=>setTab('lyrics')}>中韓對照</TabButton>
                  <TabButton active={tab==='vocab'} onClick={()=>setTab('vocab')}>單字表</TabButton>
                  <TabButton active={tab==='flash'} onClick={()=>setTab('flash')}>單字卡</TabButton>
                  <TabButton active={tab==='grammar'} onClick={()=>setTab('grammar')}>文法</TabButton>
                </div>
              </div>
            </div>

            {tab==='lyrics' && <LyricsPanel kor={kor} zh={zh} setKor={setKor} setZh={setZh} editMode={editMode} setEditMode={v=>setEditMode(v)} />}
            {tab==='vocab' && <VocabPanel kor={kor} />}
            {tab==='flash' && <FlashcardPanel vocab={SAMPLE_VOCAB} />}
            {tab==='grammar' && <GrammarPanel />}

            <DevTests />
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <SideDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} />
    </div>
  );
}
