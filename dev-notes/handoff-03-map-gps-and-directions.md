# Handoff 03 — Map screen: GPS button feedback + Directions intent

Scope: two small, independent UX fixes on the map screen. No architecture change.
Guidance only — locations and intent are given, the implementer writes the code.

**Rule for this repo: do NOT change how radius filtering gets its coordinates.**
`_gpsLocation` feeds `scanCenter` (MapSurveyViewModel around line 277), which feeds
`filteredMapItems` (haversine + `radiusKm`). Any cached / low-accuracy coordinate written into
`_gpsLocation` silently changes WHICH properties appear on the map. Both tasks below must leave
that data path untouched.

---

## Task 1 — "Locate me" button appears to do nothing (option A: timeout + honest feedback)

### Symptom
User taps the GPS FAB on the map and the camera does not move. Most visible on the first tap
after opening the app, and indoors / with weak signal.

### Root cause (verified by reading the code, two separate layers)

1. `MapSurveyViewModel.triggerMoveCameraToGps()` (~line 454) is
   `_gpsLocation.value?.let { emit }`. On the very first tap `_gpsLocation` is still `null`,
   so the call returns silently — no camera move, no message, no log. This is an unhandled
   branch, not a deliberate decision.
2. `LocationHelper.getCurrentLocation()` (~line 46) uses
   `getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)`. That API deliberately
   ignores any cached fix and forces a fresh one — correct here, see the rule above — but the
   `CancellationTokenSource` is created and **never given a timeout**. Indoors the request can
   hang for a long time or resolve to `null`, while the spinner in `MapSurveyScreen` (~line 627)
   keeps spinning.

Note: `LocationHelper.kt` has not been modified since the initial scaffold commit (`ee64235`),
unlike `MapSurveyScreen.kt` which went through several camera fixes. This file has never been
reviewed.

### What to change

**A. `LocationHelper.kt` — bound the wait.**
Give the in-flight request a deadline (suggest 8-10s) and, when it expires, cancel the token and
emit `LocationState.Error` with a message that says the fix timed out, distinct from the existing
"returned null" message. The distinction matters: it is the only way to tell "no signal" from
"Play Services failed" when reading logs later.

**B. `MapSurveyViewModel.triggerMoveCameraToGps()` — stop failing silently.**
When `_gpsLocation` is `null`, surface something instead of returning: emit on the existing
`_errorMessage` flow (the screen already collects it into a snackbar, ~line 202) with a
"getting your location…" style message. Do NOT invent a fallback coordinate.

**C. Do not touch** the accuracy priority, `scanCenter`, `filteredMapItems`, or the
"only fetch once" guard in `MapSurveyScreen` (~lines 194-197, the comment there explains it —
it exists so switching bottom-nav tabs does not re-fetch GPS).

### Watch out for
- The spinner is driven by `_isFetchingLocation`. On the timeout path, make sure it is reset to
  `false` on every exit route, including cancellation — a stuck spinner is worse than the
  original bug.
- `getCurrentLocation` is a `callbackFlow` that `close()`s itself after the first terminal state.
  Adding a timeout must not leave the flow open or double-close it.
- Do not add a second concurrent location request. Tapping the FAB repeatedly should not stack
  requests.

### Acceptance
1. Airplane mode / indoors, first tap: spinner appears, and within ~10s a snackbar explains the
   timeout. Spinner is gone afterwards. App does not freeze.
2. Outdoors, first tap: camera flies to current position as before; radius filtering still shows
   the same properties it did before this change.
3. Tap FAB → switch to another bottom-nav tab → return to map: GPS is NOT re-fetched (existing
   behaviour preserved).
4. Second tap after a successful fix: camera jumps immediately to the known coordinate
   (existing `triggerMoveCameraToGps` fast path still works).

---

## Task 2 — Directions button starts turn-by-turn navigation immediately

### Symptom
Tapping the Directions icon in the pin preview sheet launches Google Maps straight into
turn-by-turn guidance. User wants the route overview, then to press Start themselves.

### Root cause
`MapItemPreview.kt` ~line 91, `launchDirections` builds `google.navigation:q=<lat>,<lng>`.
Per the Android intent spec that URI scheme means "start navigating now" — there is no flag to
make it preview-only.

### What to change
Promote the URL that is already sitting in the `catch` fallback (~line 99),
`https://www.google.com/maps/dir/?api=1&destination=...`, to be the primary action, and drop the
`google.navigation` branch entirely. That URL opens the route overview screen with a Start button.

Chosen deliberately over `geo:<lat>,<lng>?q=...` — the latter only drops a pin and shows no route.

### Watch out for
- `setPackage("com.google.android.apps.maps")` currently exists only on the navigation branch.
  Decide explicitly: keep it to force the Maps app (and then keep a no-package retry so devices
  without Maps still work), or drop it and let the chooser handle it. Do not end up with a path
  that throws `ActivityNotFoundException` with no fallback — the current code has two nested
  try/catch levels and the final Toast ("Không thể mở ứng dụng bản đồ") must remain reachable.
- The coordinate guard `MapsIntentHelper.isValidCoordinate` on the button (~line 299) stays as is.
- Do not touch `MapsIntentHelper.buildDirectionsUrl` / the "Đi xem (N)" multi-stop route flow in
  `MapSurveyViewModel.buildDirectionsRoute` — that is a separate feature and already uses a
  different URL builder.

### Acceptance
1. Tap Directions on a pin with valid coordinates → Google Maps opens on the route overview,
   NOT in active navigation. Start button visible.
2. Pin without coordinates → button still disabled.
3. "Đi xem (N)" multi-stop route still behaves exactly as before.
