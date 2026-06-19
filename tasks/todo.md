# UI Refactor: Modern Layout + Horizontal Sprout

## Goal

Replace the floating-window / Windows-dialog aesthetic with a full-viewport modern layout where the chat panel sits to the left and the Sprout animation anchors to the right.

## Constraints

- No new npm dependencies — all styling stays in the existing CSS files
- Offline-safe: system fonts only (`var(--sc-font)` stack already defined)
- The Sprout sprite is a fixed 186px-wide PNG; it cannot be resized without regenerating assets
- Backend / context / streaming code is untouched — this is purely a frontend layout and styling task
- Vitest frontend tests must still pass after the refactor

## Approach

The Win95 CSS library was already removed; what remains is the _window-chrome metaphor_ — a floating 450×650 dialog with a title bar, Chats/⚙/× buttons, and a close button. The fix has two parts:

1. **Layout:** Change `App.tsx:SproutLayout` from `flexDirection: "column"` (bubble above sprite) to `flexDirection: "row"` (chat left, Sprout right). Remove the fixed 450×650 pixel box and let the chat panel fill the viewport height.

2. **Chrome:** Strip the title-bar look from `BubbleWindow.tsx`. Replace the header row (title + Chats/⚙/×) with a minimal top bar — settings gear and Chats button, no window title, no × close button. Convert the page background from `transparent` (Electron legacy) to opaque.

Considered and rejected: keeping the bubble as a modal overlay that toggles — this conflicts with the "Sprout always to the right" requirement and would require a separate trigger.

## Steps

- [x] 1. **Set opaque page background** — In `App.css`, replace `background: transparent` on `:root`, `html`, and `body` with `background: var(--sc-bg)` (navy `#0d1926`). — Verified by: dev server shows a solid dark page instead of a transparent/white flash.

- [x] 2. **Refactor `SproutLayout` to a horizontal row** — In `App.tsx`, change the inner container from `flexDirection: "column"` to `flexDirection: "row"`, `alignItems: "stretch"`, `width: "100vw"`, `height: "100vh"`. Remove the hardcoded `width: "450px" height: "650px"` wrapper around `<Bubble />` — let it fill the available space via `flex: 1`. Keep the Sprout container at its natural 186px width with `alignSelf: "flex-end"` so it sits at the bottom-right. Remove the `isChatWindowOpen` guard — the chat panel is always rendered. — Verified by: page shows chat on the left and sprite on the right at all viewport sizes.

- [x] 3. **Simplify `Sprout.tsx` click behavior** — With the chat always visible, `toggleChat` no longer needs to show/hide the panel. Change `onClick` to call `setIsChatWindowOpen(true)` only (no toggle), or repurpose the click to focus the text input (via a context callback). Remove the `isChatWindowOpen` read from `useChat` if it is no longer needed. The `position: absolute` drag/click overlay inside `<Sprout>` can stay as-is — it is relative to the sprite container, which is unchanged. — Verified by: clicking the sprite does not break anything; text input receives focus (or no-op is acceptable as a stub).

- [x] 4. **Strip window chrome from `BubbleWindow.tsx`** — Remove the `.chat-panel-header` div (title + controls) entirely. Move the Chats and Settings buttons to a compact icon bar that sits inside the `chat-panel-body` area at the top, or repurpose the existing `BubbleWindowBottomBar`. The `btn-close` (×) button and the `.chat-panel-title` element are deleted. Keep `chat-panel--active` class for the blue-accent pulse. — Verified by: no title bar visible; Chats and Settings are still reachable.

- [x] 5. **Update `.chat-panel` sizing in `SproutTheme.css`** — Remove any width/height assumptions (the component now fills `flex: 1`). Adjust `.chat-panel-header` — if a replacement minimal bar is used, add its styles here. Rename the class to something non-window-ish only if the rename doesn't break other class references. — Verified by: `npm run lint` passes; no visual overflow or scroll bleed.

- [x] 6. **Verify tests pass** — Run `python3 -m pytest -q` and `npm run test` and confirm no regressions. — Verified by: both suites exit 0.

## Risks / unknowns

- **Chat-always-visible vs. toggle:** Steps 2 and 3 remove the show/hide toggle. If the user wants to keep the ability to collapse the chat (e.g., to see just Sprout), a collapse control needs to be added back — this is out of scope here but noted. Confirm with user before executing step 2.

- **Sprout sprite at right edge on small viewports:** The sprite is 186px fixed. On a 375px-wide phone screen the chat would only get ~190px — likely too narrow. For now the layout targets desktop/tablet LAN-access usage (Pi 5 use case). Add a `min-width: 320px` on the chat column as a safety floor.

- **`isChatWindowOpen` state is read in other contexts:** `ChatContext` exposes `isChatWindowOpen` and it's read in `Sprout.tsx`. Grep for all call sites before deleting the toggle to avoid silent breakage.

  ```
  grep -r "isChatWindowOpen\|setIsChatWindowOpen" src/
  ```

- **`WindowContext.tsx`** manages resize state but is currently a no-op in web mode. It should not need changes, but confirm it does not assume a fixed panel size.

## Out of scope (explicitly)

- Backend changes of any kind
- Adding a new character or animation assets
- Changing the color palette (`--sc-*` variables stay as-is)
- Responsive/mobile breakpoints beyond the min-width safety floor
- Accessibility audit (ARIA roles, keyboard nav)
