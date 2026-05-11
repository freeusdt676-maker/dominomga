import { useEffect, useRef, useState } from "react";
import { Radio, Play, Pause, SkipForward, X, Pencil } from "lucide-react";

type Track = { title: string; artist: string; videoId: string };

const DEFAULT_TRACKS: Track[] = [
  { artist: "Erick Manana", title: "Tsy Ferana", videoId: "eVjt9vmluxg" },
  { artist: "Mahaleo", title: "Isekely (Live Olympia)", videoId: "7PMwW30uClY" },
  { artist: "Kayamba", title: "Hira gasy", videoId: "" },
  { artist: "Ejema", title: "Manahiragna", videoId: "" },
];

const STORAGE_KEY = "domino_radio_tracks_v1";

function loadTracks(): Track[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRACKS;
    const parsed = JSON.parse(raw) as Track[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TRACKS;
    return parsed;
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  }, [tracks]);

  const current = tracks[idx];
  const hasId = !!current?.videoId;

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
        title="Radio gasy"
        aria-label="Radio gasy"
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
        <div className="absolute right-2 top-14 z-30 w-64 rounded-xl border border-[#d4af37]/40 bg-[#0b1a10]/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[#ffe27a] text-sm font-bold flex items-center gap-1">
              <Radio className="w-4 h-4" /> Radio gasy
            </div>
            <button onClick={() => setOpen(false)} className="text-[#ffe27a]/70 hover:text-[#ffe27a]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1 mb-3 max-h-56 overflow-auto pr-1">
            {tracks.map((t, i) => (
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
            Kitiho ✏️ raha hanova rohy YouTube ny hira.
          </p>
        </div>
      )}
    </>
  );
}
