import { useEffect, useMemo, useRef, useState } from "react";
import { Radio, Play, Pause, SkipForward, X, Pencil, Search } from "lucide-react";

type Track = { title: string; artist: string; videoId: string };

// Lisitra hira gasy voafantina (Erick Manana, Mahaleo, Kayamba, Ejema, sns.)
const DEFAULT_TRACKS: Track[] = [
  { artist: "Erick Manana", title: "Tsy Ferana", videoId: "eVjt9vmluxg" },
  { artist: "Erick Manana", title: "Tantsaha", videoId: "" },
  { artist: "Erick Manana", title: "Mihira Mandrakizay", videoId: "" },
  { artist: "Erick Manana", title: "Renimalala", videoId: "" },
  { artist: "Erick Manana", title: "Ravorombazaha", videoId: "" },
  { artist: "Mahaleo", title: "Isekely (Live Olympia)", videoId: "7PMwW30uClY" },
  { artist: "Mahaleo", title: "Mitsiry", videoId: "" },
  { artist: "Mahaleo", title: "Tiako", videoId: "" },
  { artist: "Mahaleo", title: "Adiny Iray", videoId: "" },
  { artist: "Mahaleo", title: "Veloma e!", videoId: "" },
  { artist: "Mahaleo", title: "Ho avy", videoId: "" },
  { artist: "Mahaleo", title: "Lera Madiva", videoId: "" },
  { artist: "Kayamba", title: "Hira gasy", videoId: "" },
  { artist: "Kayamba", title: "Salegy Live", videoId: "" },
  { artist: "Kayamba", title: "Tsindrintsindry", videoId: "" },
  { artist: "Ejema", title: "Manahiragna", videoId: "" },
  { artist: "Ejema", title: "Tianao", videoId: "" },
  { artist: "Ejema", title: "Mandeha mody", videoId: "" },
  { artist: "Rossy", title: "Lera Mandalo", videoId: "" },
  { artist: "Rossy", title: "Mihinana", videoId: "" },
  { artist: "Poopy", title: "Tantely", videoId: "" },
  { artist: "Poopy", title: "Mama", videoId: "" },
  { artist: "Bodo", title: "Aza Manadino", videoId: "" },
  { artist: "Bodo", title: "Misy ny tia", videoId: "" },
  { artist: "Samoëla", title: "Mahay miteny", videoId: "" },
  { artist: "Samoëla", title: "Sambatra", videoId: "" },
  { artist: "Tarika Mily", title: "Mendrika", videoId: "" },
  { artist: "Tearano", title: "Anaro", videoId: "" },
  { artist: "Lego", title: "Mitiavà", videoId: "" },
  { artist: "Mage 4", title: "Mahasoa", videoId: "" },
  { artist: "Stéphanie", title: "Veloma", videoId: "" },
  { artist: "Tence Mena", title: "Vady be aiko", videoId: "" },
  { artist: "Wawa", title: "Tsy mety", videoId: "" },
  { artist: "Naka", title: "Salama", videoId: "" },
  { artist: "Bekoto", title: "Vetsovetso", videoId: "" },
  { artist: "Dama", title: "Tsiriry", videoId: "" },
  { artist: "Lôla", title: "Manina", videoId: "" },
  { artist: "Jaojoby", title: "Salegy Mafana", videoId: "" },
  { artist: "Jaojoby", title: "Malagasy", videoId: "" },
  { artist: "Tarika", title: "Mananjary", videoId: "" },
  { artist: "Hajazz", title: "Antso", videoId: "" },
  { artist: "Black Nadia", title: "Tsy mahafoy", videoId: "" },
  { artist: "Iraimbilanja", title: "Tsy ho hadinoiko", videoId: "" },
  { artist: "Lalatiana", title: "Mahatsiaro", videoId: "" },
  { artist: "Ny Ainga", title: "Tantely", videoId: "" },
];

const STORAGE_KEY = "domino_radio_tracks_v2";

function loadTracks(): Track[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRACKS;
    const parsed = JSON.parse(raw) as Track[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TRACKS;
    // Merge: keep saved videoIds, add any new default tracks
    const map = new Map(parsed.map((t) => [`${t.artist}|${t.title}`, t]));
    DEFAULT_TRACKS.forEach((t) => {
      const k = `${t.artist}|${t.title}`;
      if (!map.has(k)) map.set(k, t);
    });
    return Array.from(map.values());
  } catch {
    return DEFAULT_TRACKS;
  }
}

function extractId(input: string): string {
  const s = input.trim();
  if (!s) return "";
  const m = s.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return "";
}

export function RadioPlayer() {
  const [tracks, setTracks] = useState<Track[]>(() => loadTracks());
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  }, [tracks]);

  const current = tracks[idx];
  const hasId = !!current?.videoId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks.map((t, i) => ({ t, i }));
    return tracks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) =>
        t.artist.toLowerCase().includes(q) || t.title.toLowerCase().includes(q),
      );
  }, [tracks, query]);

  const post = (func: string, args: unknown[] = []) => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    w.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  };

  const toggle = () => {
    if (!hasId) return;
    if (playing) {
      post("pauseVideo");
      setPlaying(false);
    } else {
      post("playVideo");
      post("setVolume", [25]);
      setPlaying(true);
    }
  };

  const next = () => {
    const n = (idx + 1) % tracks.length;
    setIdx(n);
    setPlaying(true);
  };

  const editTrack = (i: number) => {
    const t = tracks[i];
    const url = window.prompt(
      `Apetaho ny rohy YouTube na ID an'ny "${t.artist} - ${t.title}":`,
      t.videoId,
    );
    if (url == null) return;
    const id = extractId(url);
    if (url && !id) {
      window.alert("Rohy YouTube tsy ekena. Ohatra: https://youtu.be/eVjt9vmluxg");
      return;
    }
    const next = [...tracks];
    next[i] = { ...t, videoId: id };
    setTracks(next);
  };

  const src = hasId
    ? `https://www.youtube.com/embed/${current.videoId}?enablejsapi=1&autoplay=${playing ? 1 : 0}&controls=0&modestbranding=1&playsinline=1&rel=0`
    : "about:blank";

  return (
    <>
      {/* Bokotra radio kely */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fab-circle absolute right-2 top-2 z-30"
        title="FM RADIO"
        aria-label="FM RADIO"
      >
        <Radio className={`w-5 h-5 ${playing ? "animate-pulse" : ""}`} />
      </button>

      {/* Iframe miafina */}
      <div className="absolute opacity-0 pointer-events-none" style={{ width: 1, height: 1, left: -9999 }}>
        <iframe
          ref={iframeRef}
          key={current?.videoId || "empty"}
          src={src}
          allow="autoplay; encrypted-media"
          title="radio"
        />
      </div>

      {open && (
        <div className="absolute right-2 top-14 z-30 w-72 rounded-2xl border-2 border-[#d4af37]/60 bg-gradient-to-b from-[#1a0f08] to-[#0b1a10] p-3 shadow-2xl backdrop-blur">
          {/* Endrika radio antitra: bandeau frequency + logo */}
          <div className="flex items-center justify-between mb-2 rounded-lg bg-black/40 border border-[#d4af37]/30 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#d4af37] to-[#8b6914] flex items-center justify-center shadow-inner border border-[#ffe27a]/40">
                <Radio className="w-5 h-5 text-[#1a0f08]" />
              </div>
              <div>
                <p className="text-[#ffe27a] text-[13px] font-extrabold leading-none tracking-wider">FM RADIO</p>
                <p className="text-[9px] text-[#ffe27a]/60 leading-none mt-0.5 font-mono">98.5 MHz · GASY</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#ffe27a]/70 hover:text-[#ffe27a]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Barre de recherche */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#ffe27a]/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Karohy hira na mpihira..."
              className="w-full pl-7 pr-2 py-1.5 rounded-md bg-black/40 border border-[#d4af37]/30 text-[11px] text-[#ffe27a] placeholder:text-[#ffe27a]/40 focus:outline-none focus:border-[#ffe27a]/60"
            />
          </div>

          <div className="space-y-1 mb-3 max-h-56 overflow-auto pr-1">
            {filtered.length === 0 && (
              <p className="text-[10px] text-white/50 text-center py-3">Tsy nahitana hira</p>
            )}
            {filtered.map(({ t, i }) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  i === idx ? "bg-[#d4af37]/20 text-[#ffe27a]" : "text-white/85 hover:bg-white/5"
                }`}
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    setIdx(i);
                    setPlaying(true);
                  }}
                  disabled={!t.videoId}
                  title={t.videoId ? "Henoy" : "Mbola tsy misy rohy"}
                >
                  <div className="font-semibold truncate">{t.artist}</div>
                  <div className="opacity-70 truncate">{t.title}{!t.videoId ? " — (tsy misy rohy)" : ""}</div>
                </button>
                <button
                  onClick={() => editTrack(i)}
                  className="text-[#ffe27a]/70 hover:text-[#ffe27a]"
                  title="Hanova rohy YouTube"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={toggle}
              disabled={!hasId}
              className="fab-circle !w-10 !h-10 disabled:opacity-40"
              title={playing ? "Ajanono" : "Henoy"}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={next} className="fab-circle !w-10 !h-10" title="Manaraka">
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-white/50 mt-2 text-center leading-snug">
            {tracks.length} hira gasy · Kitiho ✏️ hanampy rohy YouTube
          </p>
        </div>
      )}
    </>
  );
}
