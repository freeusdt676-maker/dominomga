---
name: Screenshot shield
description: ScreenShield blocks screenshots only — printing, copying and right-click stay allowed
type: feature
---
`src/components/ScreenShield.tsx` wraps all routes in `src/App.tsx`.
- Blur + overlay "🔒 Voarara ny capture" when window loses focus / tab hidden.
- Blocks PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5; clears clipboard on those.
- ALLOWED on purpose: imprimer (Ctrl+P), copier (Ctrl+C), right-click. Print events suppress the blur.
- Web limitation: OS-level screenshots can't be fully blocked — deterrent-level only.
