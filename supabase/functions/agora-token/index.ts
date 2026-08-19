import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { RtcTokenBuilder, RtcRole } from 'npm:agora-token@2.0.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userData?.user;
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    const { channelName, uid } = await req.json();
    if (!channelName || typeof channelName !== 'string') return json({ error: 'channelName required' }, 400);

    // channelName is a game id — the caller must be a participant of that game.
    const gameId = channelName.trim();
    if (!/^[0-9a-fA-F-]{20,40}$/.test(gameId)) return json({ error: 'forbidden' }, 403);

    const checks = await Promise.all([
      supabase.from('games').select('player1_id,player2_id,player3_id').eq('id', gameId).maybeSingle(),
      supabase.from('ludo_games').select('player1_id,player2_id,player3_id,player4_id').eq('id', gameId).maybeSingle(),
      supabase.from('petanque_games').select('player1_id,player2_id').eq('id', gameId).maybeSingle(),
    ]);
    const isMember = checks.some(({ data }) =>
      data ? Object.values(data as Record<string, unknown>).includes(user.id) : false,
    );
    if (!isMember) return json({ error: 'forbidden' }, 403);

    const appId = Deno.env.get('AGORA_APP_ID');
    const appCert = Deno.env.get('AGORA_APP_CERTIFICATE');
    if (!appId || !appCert) return json({ error: 'agora_not_configured' }, 500);

    const numericUid = typeof uid === 'number' ? uid : 0;
    const privilegeExpireTs = Math.floor(Date.now() / 1000) + 3600 * 6;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCert, gameId, numericUid, RtcRole.PUBLISHER, privilegeExpireTs, privilegeExpireTs,
    );
    return json({ token, appId, uid: numericUid, channelName: gameId, expiresAt: privilegeExpireTs });
  } catch (e) {
    console.error('agora-token error', e);
    return json({ error: 'internal_error' }, 500);
  }
});
