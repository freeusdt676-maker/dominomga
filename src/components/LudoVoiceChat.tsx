import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import voiceMic from "@/assets/voice-mic.png";
import { toast } from "sonner";

type Signal =
  | { kind: "hello"; from: string }
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

/**
 * Tiny WebRTC mesh per Ludo game.
 * Signaling = Supabase Realtime broadcast on channel `ludo-voice-{gameId}`.
 * - When ON: capture mic, dial every other player, attach remote audio elements.
 * - When OFF: tear down all PCs, mic stops, voice icon hides (replaced by a strike line).
 */
export default function LudoVoiceChat({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const cleanup = () => {
    pcsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    pcsRef.current.clear();
    audiosRef.current.forEach((a) => { try { a.pause(); a.srcObject = null; a.remove(); } catch {} });
    audiosRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) { try { supabase.removeChannel(channelRef.current); } catch {} channelRef.current = null; }
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
    }
    pc.onicecandidate = (e) => {
      if (e.candidate && user) send({ kind: "ice", from: user.id, to: peer, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      let audio = audiosRef.current.get(peer);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        (audio as any).playsInline = true;
        document.body.appendChild(audio);
        audiosRef.current.set(peer, audio);
      }
      audio.srcObject = e.streams[0];
    };
    return pc;
  };

  const dial = async (peer: string) => {
    if (!user) return;
    const pc = ensurePc(peer);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    send({ kind: "offer", from: user.id, to: peer, sdp: offer });
  };

  const turnOn = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      localStreamRef.current = stream;
      const ch = supabase.channel(`ludo-voice-${gameId}`, { config: { broadcast: { ack: false, self: false } } });
      channelRef.current = ch;
      ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const sig = payload as Signal;
        if (!user) return;
        if ("to" in sig && sig.to !== user.id) return;
        if (sig.from === user.id) return;
        if (sig.kind === "hello") {
          // Lower-id peer initiates to avoid glare
          if (user.id < sig.from) await dial(sig.from);
        } else if (sig.kind === "offer") {
          const pc = ensurePc(sig.from);
          await pc.setRemoteDescription(sig.sdp);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          send({ kind: "answer", from: user.id, to: sig.from, sdp: ans });
        } else if (sig.kind === "answer") {
          const pc = pcsRef.current.get(sig.from);
          if (pc) await pc.setRemoteDescription(sig.sdp);
        } else if (sig.kind === "ice") {
          const pc = pcsRef.current.get(sig.from);
          if (pc) { try { await pc.addIceCandidate(sig.candidate); } catch {} }
        }
      });
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
      });
      send({ kind: "hello", from: user.id });
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
        <img src={voiceMic} alt="Voice ON" className="w-10 h-10 drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />
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