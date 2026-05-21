import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Phone } from "lucide-react";

type Signal =
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

// Free public STUN + TURN — multi-provider mba hahatonga azy mandeha amin'ny
// network rehetra (mobile 4G, wifi entreprise, NAT symetrique, sns.)
const ICE: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
    // Metered Open Relay — endpoint vaovao (global.relay.metered.ca)
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443",
        "turns:global.relay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // ExpressTURN free fallback
    {
      urls: ["turn:relay1.expressturn.com:3478"],
      username: "ef9MM26U6OXAW1R3RU",
      credential: "MlV6V3vROK8mU0Y2",
    },
    // Fallback farany: openrelay (taloha) raha mbola mandeha
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
};

/**
 * WebRTC mesh voice chat per game (Ludo OR Domino).
 * Signaling: Supabase Realtime — Presence (peer discovery) + Broadcast (SDP/ICE).
 * - Deterministic dialer election: lower user.id always offers.
 * - Presence-based peer list = no race on "hello" packet ordering.
 * - Public TURN fallback so users behind symmetric NATs still connect.
 */
export default function LudoVoiceChat({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastIncomingToastRef = useRef<number>(0);

  const cleanup = () => {
    pcsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    pcsRef.current.clear();
    pendingIceRef.current.clear();
    audiosRef.current.forEach((a) => { try { a.pause(); a.srcObject = null; a.remove(); } catch {} });
    audiosRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) { try { supabase.removeChannel(channelRef.current); } catch {} channelRef.current = null; }
    setPeerCount(0);
    setConnected(false);
    setMuted(false);
  };

  useEffect(() => () => {
    cleanup();
    if (presenceChRef.current) { try { supabase.removeChannel(presenceChRef.current); } catch {} presenceChRef.current = null; }
  }, []);

  // Lightweight presence listener — runs even when voice is OFF,
  // so we can show "incoming call" hint when the opponent turns on their mic.
  useEffect(() => {
    if (!user || !gameId) return;
    const ch = supabase.channel(`voice-presence-${gameId}`, {
      config: { presence: { key: user.id } },
    });
    presenceChRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const others = Object.keys(state).filter((k) => k !== user.id).length;
      setOtherOnline(others > 0);
      if (others > 0 && !on) {
        const now = Date.now();
        if (now - lastIncomingToastRef.current > 15_000) {
          lastIncomingToastRef.current = now;
          toast.info("📞 Niantso anao ny mpilalao iray — tsindrio Apel hamaly", { duration: 6000 });
          try { navigator.vibrate?.([200, 100, 200]); } catch {}
        }
      }
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try { await ch.track({ on: false, ts: Date.now() }); } catch {}
      }
    });
    return () => {
      try { supabase.removeChannel(ch); } catch {}
      presenceChRef.current = null;
    };
  }, [user, gameId, on]);

  const send = (payload: Signal) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload });
  };

  const ensurePc = (peer: string): RTCPeerConnection => {
    let pc = pcsRef.current.get(peer);
    if (pc) return pc;
    pc = new RTCPeerConnection(ICE);
    pcsRef.current.set(peer, pc);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc!.addTrack(t, localStreamRef.current!));
    } else {
      // Tsy maintsy misy transceiver audio mba afaka mifanakalo SDP
      try { pc.addTransceiver("audio", { direction: "sendrecv" }); } catch {}
    }
    pc.onicecandidate = (e) => {
      if (e.candidate && user) send({ kind: "ice", from: user.id, to: peer, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      let audio = audiosRef.current.get(peer);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.muted = false;
        audio.volume = 1.0;
        (audio as any).playsInline = true;
        document.body.appendChild(audio);
        audiosRef.current.set(peer, audio);
      }
      audio.srcObject = e.streams[0];
      audio.play().catch((err) => {
        console.warn("[voice] autoplay blocked, retrying on next gesture", err);
        const retry = () => { audio!.play().catch(() => {}); document.removeEventListener("click", retry); document.removeEventListener("touchstart", retry); };
        document.addEventListener("click", retry, { once: true });
        document.addEventListener("touchstart", retry, { once: true });
      });
      setConnected(true);
      try { navigator.vibrate?.(80); } catch {}
      toast.success("🎙️ Tafita ny appel — afaka miresaka ianareo");
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc!.iceConnectionState;
      console.log(`[voice] ${peer.slice(0,6)} ICE: ${st}`);
      if (st === "failed") {
        try { pc!.restartIce(); } catch {}
      }
      if (st === "closed") {
        pcsRef.current.delete(peer);
        const a = audiosRef.current.get(peer);
        if (a) { try { a.pause(); a.srcObject = null; a.remove(); } catch {} audiosRef.current.delete(peer); }
      }
    };
    pc.onconnectionstatechange = () => {
      console.log(`[voice] ${peer.slice(0,6)} conn: ${pc!.connectionState}`);
    };
    return pc;
  };

  const dial = async (peer: string) => {
    if (!user) return;
    if (pcsRef.current.has(peer)) return; // already negotiating
    const pc = ensurePc(peer);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    send({ kind: "offer", from: user.id, to: peer, sdp: offer });
  };

  const turnOn = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      const ch = supabase.channel(`voice-${gameId}`, {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: user.id },
        },
      });
      channelRef.current = ch;

      ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const sig = payload as Signal;
        if (!user) return;
        if ("to" in sig && sig.to !== user.id) return;
        if (sig.from === user.id) return;
        try {
          if (sig.kind === "offer") {
            const pc = ensurePc(sig.from);
            await pc.setRemoteDescription(sig.sdp);
            // flush queued ICE
            const queued = pendingIceRef.current.get(sig.from) ?? [];
            for (const c of queued) { try { await pc.addIceCandidate(c); } catch {} }
            pendingIceRef.current.delete(sig.from);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            send({ kind: "answer", from: user.id, to: sig.from, sdp: ans });
          } else if (sig.kind === "answer") {
            const pc = pcsRef.current.get(sig.from);
            if (pc) {
              await pc.setRemoteDescription(sig.sdp);
              const queued = pendingIceRef.current.get(sig.from) ?? [];
              for (const c of queued) { try { await pc.addIceCandidate(c); } catch {} }
              pendingIceRef.current.delete(sig.from);
            }
          } else if (sig.kind === "ice") {
            const pc = pcsRef.current.get(sig.from);
            if (pc && pc.remoteDescription) {
              try { await pc.addIceCandidate(sig.candidate); } catch {}
            } else {
              const arr = pendingIceRef.current.get(sig.from) ?? [];
              arr.push(sig.candidate);
              pendingIceRef.current.set(sig.from, arr);
            }
          }
        } catch (err) {
          console.warn("[voice] signal handler error", err);
        }
      });

      // Presence-driven dialing — every time the peer set changes,
      // for each peer where my id < their id, dial them.
      ch.on("presence", { event: "sync" }, () => {
        if (!user) return;
        const state = ch.presenceState();
        const peers = Object.keys(state).filter((k) => k !== user.id);
        setPeerCount(peers.length);
        for (const p of peers) {
          if (user.id < p && !pcsRef.current.has(p)) {
            dial(p).catch(() => {});
          }
        }
      });

      await new Promise<void>((resolve, reject) => {
        ch.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            try { await ch.track({ online: true, ts: Date.now() }); } catch {}
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error(status));
          }
        });
      });
      setOn(true);
      toast.success("Voice chat misokatra 🎙️");
    } catch (e: any) {
      toast.error("Tsy afaka mampiasa micro: " + (e?.message ?? e));
      cleanup();
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    cleanup();
    setOn(false);
    // Re-announce as off via presence channel
    if (presenceChRef.current) {
      try { presenceChRef.current.track({ on: false, ts: Date.now() }); } catch {}
    }
  };

  const toggleMute = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Mute toggle — only visible when call is on */}
      {on && (
        <button
          type="button"
          onClick={toggleMute}
          title={muted ? "Avadiho ny micro" : "Vono ny micro"}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition"
          style={{
            background: muted ? "rgba(239,68,68,0.85)" : "rgba(16,185,129,0.85)",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.4)",
          }}
        >
          {muted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
        </button>
      )}

      {/* Main call button */}
      <button
        type="button"
        onClick={() => (on ? turnOff() : turnOn())}
        disabled={busy}
        title={on ? "Tapaho ny appel" : "Antsoy ny mpilalao"}
        className={`relative h-10 px-3 rounded-full flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50 ${
          on ? "" : otherOnline ? "animate-pulse" : ""
        }`}
        style={{
          background: on
            ? (connected ? "rgba(16,185,129,0.95)" : "rgba(234,179,8,0.95)")
            : (otherOnline ? "rgba(239,68,68,0.95)" : "rgba(255,255,255,0.1)"),
          boxShadow: on
            ? "0 0 0 2px rgba(255,255,255,0.5), 0 0 18px rgba(16,185,129,0.7)"
            : (otherOnline ? "0 0 0 2px #fff, 0 0 18px rgba(239,68,68,0.9)" : "0 0 0 2px rgba(255,255,255,0.3)"),
        }}
      >
        {on ? (
          <>
            <PhoneOff className="w-4 h-4 text-white" />
            <span className="text-[11px] font-bold text-white tracking-wide">
              {connected ? "TAFITA" : "Miandry…"}
            </span>
          </>
        ) : (
          <>
            <Phone className="w-4 h-4 text-white" />
            <span className="text-[11px] font-bold text-white tracking-wide">
              {otherOnline ? "MAMALY" : "APEL"}
            </span>
          </>
        )}
        {peerCount > 0 && on && (
          <span className="absolute -top-1 -right-1 bg-white text-emerald-700 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-emerald-700">
            {peerCount}
          </span>
        )}
      </button>
    </div>
  );
}