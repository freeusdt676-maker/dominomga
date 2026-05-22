## Ludo + Profiles + Admin Refactor — Plan

This is a large, multi-area refactor. I'll split it into clear deliverables and ship them in sequence. Before I start coding, please confirm the plan so we agree on scope.

### Part 1 — Ludo gameplay logic (`src/pages/LudoGame.tsx`, `src/lib/ludoEngine.ts`, RPC `ludo_update_state`)
- Auto-release a pawn when dice = 6 **and** the player has zero pawns on the board (no manual click).
- When dice = 6 and the player already has active pawns → wait for manual selection (existing behavior, verified).
- Bonus turn after a capture (already partly present — ensure it always fires).
- Bonus turn when a pawn reaches Home (pos 57).
- Consecutive 6 rules: 1st & 2nd 6 → bonus turn; 3rd consecutive 6 → invalidate the roll, no movement, immediate turn pass.

### Part 2 — Turn timer & forfeit
- Strict **20 s** countdown per turn (UI + auto-skip logic on the active client, with `turn_started_at` already in DB).
- Track consecutive skips per seat in a new column `skips_by_seat jsonb` on `ludo_games`.
- After **3 consecutive skips** for one seat in a 2-player game, the opponent wins automatically (`ludo_settle`). For 3P/4P, the seat is marked eliminated and remaining players continue; last remaining wins.
- Disconnect = same path (driven by timer skips).

### Part 3 — Server-side dice (anti-cheat)
- New SECURITY DEFINER RPC `ludo_roll_dice(_game_id)` that:
  - Verifies caller is the seat whose turn it is.
  - Generates a cryptographically random 1–6 server-side.
  - Updates `last_dice`, `dice_rolled=true`, increments `consecutive_sixes`, and applies the 3-sixes penalty server-side (rotates seat, resets counters).
  - Auto-releases a pawn if dice=6 & no active pawns (server-side mutation of `pawns`).
- Frontend stops generating dice locally; calls the RPC.

### Part 4 — Profile display & multiplayer privacy
- **Home screen**: add a "Mon profil" card showing Name, Phone, Account ID (`player_number`), masked Password (••••••), masked PIN (••••), and Selfie/Avatar — with show/hide eye toggles for password & PIN.
- **In-game opponent display** (Ludo, Domino, Pétanque): only `mvola_name` + `avatar_url`. Audit existing components and strip any phone/PIN/password fields shown to opponents.

### Part 5 — Profile edit + admin validation workflow
- New button on Home: **"Remplir les informations"** → opens `/profile/edit`.
- Form fields: Name, Phone, Password, PIN, Selfie.
- **Selfie capture only**: use `<input type="file" accept="image/*" capture="user">` (forces camera on mobile; on desktop falls back to webcam via `getUserMedia`). No gallery picker UI exposed.
- New table `public.profile_change_requests` (status: pending/approved/rejected) storing proposed changes + new selfie URL, with RLS (user inserts/sees own; admin sees all).
- Submit button: **"Envoyer ADMINISTRATIF"** → inserts a pending request, does **not** mutate `profiles`.
- Admin dashboard:
  - New section "Validation profils" with side-by-side current vs proposed view.
  - **Approve** → RPC `admin_approve_profile_change` updates `profiles` + auth password (via edge function for password) + notifies user via `chat_messages`.
  - **Reject** → marks request rejected + notifies user.
  - **Large red dot badge** on the Admin menu entry when pending requests > 0.

### Database changes (single migration)
1. `ALTER TABLE ludo_games ADD COLUMN skips_by_seat jsonb DEFAULT '{}'::jsonb;`
2. New table `profile_change_requests` (user_id, status, proposed_mvola_name, proposed_phone, proposed_password, proposed_pin, proposed_selfie_url, admin_note, processed_by, processed_at, timestamps) + RLS + index.
3. New RPC `ludo_roll_dice(_game_id uuid)` (server-side dice + 3-sixes handling + auto-release).
4. New RPC `ludo_skip_turn(_game_id uuid)` (timer expiry; updates skips_by_seat; auto-forfeit when threshold hit; calls `ludo_settle` for last remaining).
5. New RPC `admin_approve_profile_change(_req_id uuid)` / `admin_reject_profile_change(_req_id uuid, _reason text)`.
6. Storage bucket `selfies` (private, with RLS for user upload + admin read) — reuse existing if present.

### Edge function
- `admin-update-password` (verify_jwt = true; admin-only) — uses service role to update `auth.users` password when an approved change request includes a new password.

### Files to create/edit
- Migration (new).
- `supabase/functions/admin-update-password/index.ts` (new).
- `src/pages/LudoGame.tsx` — switch dice to RPC, add 20s timer UI, auto-skip, auto-release on 6.
- `src/lib/ludoEngine.ts` — small helpers if needed.
- `src/pages/Home.tsx` — profile card + "Remplir les informations" button.
- `src/pages/ProfileEdit.tsx` (new).
- `src/pages/Admin.tsx` — pending profile section + red badge.
- `src/components/PendingProfileApprovals.tsx` (new).
- Privacy audit pass on Ludo/Domino/Pétanque in-game UIs.

### Out of scope (will confirm later if needed)
- I will not change Domino/Pétanque turn/dice logic — only their opponent-privacy display.
- Voice chat untouched.

---

**Please reply "OK" (or with edits) and I'll execute this in one go.** Given the size, expect a single big change set with one migration + one edge function + several React file updates.
