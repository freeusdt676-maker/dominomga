import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtAr } from "@/lib/constants";
import { ArrowLeft, Loader2, Rocket, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Round = {
  id: string;
  round_no: number;
  status: "betting" | "running" | "crashed";
  server_seed_hash: string;
  betting_ends_at: string;
  started_at: string | null;
  crashed_at: string | null;
  next_at: string | null;
  crash_point: number | null;
  server_now: string;
};

type Bet = {
  id: string; round_id: string; amount: number; auto_cashout: number | null;
  cashout_multiplier: number | null; payout: number; status: string; created_at: string;
};

const GROWTH = 0.08;
const multAt = (elapsedSec: number) =>
  Math.max(1, Math.floor(Math.exp(GROWTH * Math.max(elapsedSec, 0)) * 100) / 100;

export default function CrashGame() {
  return null;
}
