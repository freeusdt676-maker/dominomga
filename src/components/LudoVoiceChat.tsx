import { useEffect, useRef, useState, useCallback } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Phone } from "lucide-react";

/**
 * Agora RTC Voice Chat — Production grade group voice for 2-4 players.
 * Channel = gameId. Each user joins with a numeric uid derived from user.id.
 * - HD voice (music_standard), AEC/ANS/AGC enabled
 * - Auto reconnect (Agora SDK handles it natively)
 * - Mute toggle, peer count, "TAFITA" indicator
 * - Low CPU/bandwidth profile (speech_standard)
 */

// Numeric uid (Agora needs 32-bit unsigned int) from uuid string
function uidFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // keep < 2^31 to avoid sign issues some servers complain about
  return h % 2_000_000_000;
}

// Mute Agora's noisy default logging in prod
try { AgoraRTC.setLogLevel(3); } catch {}

export default function LudoVoiceChat({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteUsersRef = useRef<Set<string | number>>(new Set());

  const cleanup = useCallback(async () => {
    try {
      if (micRef.current) {
        micRef.current.stop();
        micRef.current.close();
        micRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current.removeAllListeners();
        clientRef.current = null;
      }
    } catch (e) {
      console.warn("[agora] cleanup error", e);
    }
    remoteUsersRef.current.clear();
    setPeerCount(0);
    setConnected(false);
    setMuted(false);
  }, []);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  // Leave channel when game id changes or component unmounts
  useEffect(() => {
    return () => { if (on) cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const turnOn = async () => {
    if (!user || busy || on) return;
    setBusy(true);
    try {
      // 1. Fetch token from edge function
      const myUid = uidFromString(user.id);
      const { data, error } = await supabase.functions.invoke("agora-token", {
        body: { channelName: gameId, uid: myUid },
      });
      if (error || !data?.token || !data?.appId) {
        throw new Error(error?.message || data?.error || "Tsy nahazo token");
      }
      const { token, appId } = data as { token: string; appId: string };

      // 2. Create client
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (remoteUser: IAgoraRTCRemoteUser, mediaType) => {
        try {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === "audio") {
            remoteUser.audioTrack?.play();
            remoteUsersRef.current.add(remoteUser.uid);
            setPeerCount(remoteUsersRef.current.size);
            setConnected(true);
            try { navigator.vibrate?.(80); } catch {}
            toast.success("🎙️ Tafita — afaka miresaka ianareo");
          }
        } catch (e) {
          console.warn("[agora] subscribe failed", e);
        }
      });

      client.on("user-unpublished", (remoteUser) => {
        remoteUsersRef.current.delete(remoteUser.uid);
        setPeerCount(remoteUsersRef.current.size);
        if (remoteUsersRef.current.size === 0) setConnected(false);
      });

      client.on("user-left", (remoteUser) => {
        remoteUsersRef.current.delete(remoteUser.uid);
        setPeerCount(remoteUsersRef.current.size);
        if (remoteUsersRef.current.size === 0) setConnected(false);
      });

      client.on("connection-state-change", (cur, prev) => {
        console.log(`[agora] ${prev} -> ${cur}`);
        if (cur === "RECONNECTING") toast.info("Mamerina connexion…");
        if (cur === "DISCONNECTED" && prev !== "DISCONNECTING") {
          toast.error("Tapaka ny appel");
        }
      });

      // 3. Join channel
      await client.join(appId, gameId, token, myUid);

      // 4. Create local mic with HD voice + processing
      const mic = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "speech_standard",
        AEC: true,
        ANS: true,
        AGC: true,
      });
      micRef.current = mic;
      await client.publish([mic]);

      setOn(true);
      toast.success("Voice chat misokatra 🎙️");
    } catch (e: any) {
      console.error("[agora] turnOn failed", e);
      toast.error("Tsy afaka misokatra: " + (e?.message ?? e));
      await cleanup();
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    await cleanup();
    setOn(false);
  };

  const toggleMute = async () => {
    const m = micRef.current;
    if (!m) return;
    const next = !muted;
    await m.setMuted(next);
    setMuted(next);
  };

  return (
    <div className="flex items-center gap-1.5">
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

      <button
        type="button"
        onClick={() => (on ? turnOff() : turnOn())}
        disabled={busy}
        title={on ? "Tapaho ny appel" : "Antsoy ny mpilalao"}
        className={`relative h-10 px-3 rounded-full flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50`}
        style={{
          background: on
            ? (connected ? "rgba(16,185,129,0.95)" : "rgba(234,179,8,0.95)")
            : "rgba(255,255,255,0.12)",
          boxShadow: on
            ? "0 0 0 2px rgba(255,255,255,0.5), 0 0 18px rgba(16,185,129,0.7)"
            : "0 0 0 2px rgba(255,255,255,0.3)",
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
            <span className="text-[11px] font-bold text-white tracking-wide">APEL</span>
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