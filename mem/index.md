# Project Memory

## Core
Domino is LOCKED — do not modify game logic, timers, UI, or parameters unless the user explicitly requests a Domino change in a prompt. No "automatic improvements" or refactors that touch Domino code.
Ludo and Wallet are also stable — only touch when explicitly requested.
TURN_TIMEOUT_SEC=10 (Ludo), Domino timer=20s, Lobby waiting expiry=2min. Do not change without explicit prompt.

## Memories
- [Domino lock](mem://constraints/domino-locked) — Files frozen unless user prompts a Domino change