REVOKE EXECUTE ON FUNCTION public.log_domino_round() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_petanque_round() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ludo_result() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rl_payout(numeric, integer, boolean) FROM anon, authenticated;