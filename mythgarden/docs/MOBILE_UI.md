# Phone and tablet interface

The touch interface keeps actions on the scene. There is no permanent or contextual action bar.

## Feature flag and fallback

- Enabled by default. In **Settings → Touch-friendly interface**, turn it off to restore the previous layout and direct item actions. This is a browser preference and takes effect immediately, including during a week. It does not change challenge settings, score multipliers, saves, or the clock.
- For a host-wide rollback, set **`MYTHGARDEN_TOUCH_UI_ENABLED=False`** in Render and redeploy/restart the service. Reload open game tabs. The server flag overrides browser preferences and disables the setting while off.
- The preference uses local storage key `mythgarden.touch-ui.v1`. If browser storage is unavailable, it still works for the current tab.
- The compact layout applies at widths up to 760px in portrait orientation. Larger screens share destination selection, readable action costs, accessible controls, character details, dialogue panels, and the expandable journal. Tablet widths 761–1180px retain the bag beside a wider landscape, with smaller overlays and a compact header.

## Interaction contract

1. Tap a bag item to select it. Its full name appears above the bag. This spends no time and makes no gameplay request.
2. Tap a highlighted destination: empty soil to plant seeds, the shop's sell target to sell, an empty chest slot to store, or a villager to give a gift.
3. Only a matching, currently offered server action can execute. Invalid destinations and unrelated actions cannot fall through into talking, buying, watering, or traveling.
4. Tap the selected item again, empty scenery, or Escape to cancel; tap another bag item to switch.
5. With nothing selected, existing scene actions work normally: buy shop stock, water/harvest a crop, retrieve a stored item, enter buildings, travel, gather, sleep, or talk. Drag-to-give remains available with a small movement threshold to distinguish a tap from a drag.
6. The existing request lock and state-version check remain authoritative. Selection clears when updated server state arrives. Request errors stay visible in a dismissible alert and the journal.

Character placement measures buildings, crops/stock, sell targets, travel/activity controls, the title and People button, then chooses non-overlapping positions. It rechecks after resizing, image/font loads and occupant changes. If no safe position fits, the character remains available through People. Appearance order is stable by character ID; existing schedules and stationary-mode rules still determine who is present. The marker presentation uses the existing portraits and can later accept replacement artwork.

The sell target sits above the shop's six stock slots, so it does not consume stock capacity. Destination highlights also respect full field/chest capacity.

Plot and chest positions are cosmetic browser preferences (`mythgarden.destination-slots.v1`). Migration **0081** adds nullable `ItemToken.growth_origin_id`; a growing plant keeps the same `placementId` even though the engine replaces its item token. Copies, including shop purchases, get distinct identities. No player data is reset, and old clients can ignore the additional serialized fields. Clearing browser storage resets visual placement, not game progress.

## Screen structure

- Compact portrait header: farmer/profile button, day and time, wallet, earned hearts, time boost, settings.
- Flexible scene with the original building, travel, activity, and crop overlays. Lighting remains on the artwork while controls retain readable surfaces.
- Villagers appear as portrait markers with nameplates inside the landscape. Up to two fit on phones and three on wider screens; **People** opens every current occupant, including anyone who does not fit. Talk and gifts use the same controls and server actions as before. **About** in dialogue opens a biography and known preferences.
- All six bag slots in one row, with the selected item's name above them.
- Latest event and **Log**, opening the full journal. Dialogue and detailed progress open in dismissible panels with keyboard focus handling.

The layout follows the visible viewport at normal zoom, includes safe-area padding, and preserves native pinch zoom. Long panels can scroll internally. The portrait play surface has a 520px minimum usable height; shorter windows/keyboard states can scroll rather than shrink controls beyond usability. Small landscape phone windows use the larger-screen layout with scrolling.

## Repeatable checks

```sh
npm run typecheck
npm run test:ui
npm run build:production
npm run test:release
```

The UI tests cover destination resolution, invalid taps, capacity, both seed catalogs, costs, unavailable local storage, and stable display positions. The backend release gate includes both crop variants and a growth-identity regression test. Browser testing must additionally check actual geometry, pointer/keyboard interactions, daily reloads, week rollover, and the feature-flag fallback; see the release testing report for measured results.

Before broad launch, verify on physical iPhone Safari, including browser toolbar changes, keyboard, larger text, and home-screen mode. A Chromium viewport check is not a physical touch-device check.
