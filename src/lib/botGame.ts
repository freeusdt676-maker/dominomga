import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BotKind = "billiard" | "ludo" | "poker";
export type BotDifficulty = "easy" | "medium" | "hard";

export async function botStartStake(kind: BotKind, difficulty: BotDifficulty, stake: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("bot_start_stake", {
    _kind: kind, _difficulty: difficulty, _stake: stake,
  });
  if (error) { toast.error(error.message); return null; }
  const id = (data as any)?.id as string | undefined;
  return id ?? null;
}

export async function botSettle(gameId: string, won: boolean): Promise<number> {
  const { data, error } = await supabase.rpc("bot_settle", { _game_id: gameId, _won: won });
  if (error) { toast.error(error.message); return 0; }
  return Number((data as any)?.payout ?? 0);
}
