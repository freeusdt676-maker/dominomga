import { useEffect, useRef, useState } from "react";
import { Music2, Pause } from "lucide-react";
import trackAsset from "@/assets/domino-mga-musique.mp3.asset.json";

const TRACK_TITLE = "Domino mga musique";

export function RadioPlayer() {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(trackAsset.url);
    a.loop = true;
    a.volume = 0.4;
    a.preload = "none";
    audioRef.current = a;
    const onEnd = () => setPlaying(false);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="absolute left-1/2 -translate-x-1/2 bottom-1 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#d4af37]/70 bg-gradient-to-b from-[#1a0f08]/85 to-[#0b1a10]/85 shadow-[0_3px_10px_rgba(0,0,0,0.45)] backdrop-blur"
      title={playing ? "Ajanono ny hira" : "Henoy ny hira"}
      aria-label={TRACK_TITLE}
    >
      {playing ? (
        <Pause className="w-3.5 h-3.5 text-[#ffe27a]" />
      ) : (
        <Music2 className="w-3.5 h-3.5 text-[#ffe27a]" />
      )}
      <span className={`text-[10px] font-extrabold tracking-normal text-[#ffe27a] ${playing ? "animate-pulse" : ""}`}>
        {TRACK_TITLE}
      </span>
    </button>
  );
}
