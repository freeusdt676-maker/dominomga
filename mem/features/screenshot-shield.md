---
name: Screenshot shield
description: ScreenShield component wraps the app — blur on blur/hidden tab, PrintScreen blocked, right-click/copy disabled
type: feature
---
`src/components/ScreenShield.tsx` wraps all routes in `src/App.tsx`.
- Blur + overlay "🔒 Voarara ny fijerena" when window loses focus or tab hidden.
- Blocks PrintScreen (clears clipboard), Ctrl/Cmd+P/S/U, right-click, copy.
- Web limitation: OS-level screenshots can't be fully blocked — this is deterrent-level only. Don't promise 100%.
