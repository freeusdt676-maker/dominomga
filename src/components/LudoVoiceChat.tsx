import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import voiceMic from "@/assets/voice-mic.png";
import { toast } from "sonner";

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
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
  };

  useEffect(() => () => cleanup(), []);

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
  };

  return (
    <button
      type="button"
      onClick={() => (on ? turnOff() : turnOn())}
      disabled={busy}
      title={on ? "Vono ny voice chat" : "Avadiho ny voice chat"}
      className="relative w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition disabled:opacity-50"
      style={{
        background: on ? "transparent" : "rgba(255,255,255,0.06)",
        boxShadow: on ? "0 0 0 2px #2ecc71, 0 0 18px rgba(46,204,113,0.6)" : "0 0 0 2px rgba(255,255,255,0.25)",
      }}
    >
      {on ? (
        <>
          <img src={voiceMic} alt="Voice ON" className="w-10 h-10 drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />
          {peerCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-black/40">
              {peerCount}
            </span>
          )}
        </>
      ) : (
        <>
          <img src={voiceMic} alt="Voice OFF" className="w-10 h-10 opacity-30 grayscale" />
          {/* white strike-through line */}
          <span
            className="absolute"
            style={{
              left: 4, right: 4, top: "50%",
              height: 3, background: "#ffffff",
              transform: "translateY(-50%) rotate(-25deg)",
              borderRadius: 2, boxShadow: "0 0 6px rgba(0,0,0,0.5)",
            }}
          />
        </>
      )}
    </button>
  );
}