# On-device checklist — MapLibre Vienna pilot

Branch: `feat/maplibre-vienna-pilot`

What a person has to confirm on real hardware before this phase is done, because a unit test
cannot: gestures, legibility outdoors, and whether the map paints at all on a real device.
Items were added as each wave produced a rendered change, and again after branch review. The
task numbers in the section headings refer to the working plan the phase was built from, which
is not tracked in the repo.

**Reachability note — the gate is open.** Items here were gated on two things:
`SpotPhotoGalleryComponent` (task 4) becoming reachable through the spot popup in Task 9, and
Vienna's MapLibre map replacing the Google embed in Task 10. Both have landed — Vienna renders
through MapLibre as of commit `01797e6` — so every item below is now walkable in the running app.
Reachable is not verified: nothing here has been looked at in a browser yet, so every item stays
unchecked.

A script or screenshot never checks off an item here. An item asserting DOM structure, CSS
values, or exact text may be checked off tagged `(auto)` only with fresh structural browser
output in hand; feel, smoothness, alignment, contrast, and legibility always stay for a human.

## Spot data on the real map (Task 2)

- [ ] The 12 Vienna spots read as spread across the city rather than clustered in one district.
      Where: Vienna city page, MapLibre map  ·  How to get there: app root → city list → Vienna
- [ ] The 4 demolished spots read as visibly ghosted against the 8 active ones — distinguishable
      at a glance, without needing to open a popup.
      Where: Vienna city page, MapLibre map  ·  How to get there: app root → city list → Vienna
- [ ] Spot photos survive the `-q 72` / 1400px-long-edge re-encode on a real screen: no visible
      compression artefacts, correct orientation (nothing sideways or upside-down).
      Where: spot photo gallery  ·  How to get there: Vienna map → tap a spot pin → popup gallery

## Photo gallery rendering (Task 4)

- [ ] Photos fill the 4:3 gallery surface with `object-fit: cover` framing that crops sensibly —
      no letterboxing, no subject cropped out of frame.
      Where: spot photo gallery  ·  How to get there: Vienna map → tap a spot pin → popup gallery
- [ ] The prev/next arrow focus ring is clearly visible when tabbing to it — against the dark
      surface, at arm's length, not just in a zoomed screenshot.
      Where: spot photo gallery  ·  How to get there: tab into the gallery with a keyboard
- [ ] The arrow buttons are comfortably thumb-tappable on a phone. The stylesheet declares a
      44px minimum; confirm it lands that way in the popup's real layout and that neither arrow
      is clipped by the popup edge.
      Where: spot photo gallery, phone-width viewport
- [ ] Advancing between photos feels right — the tap/swipe registers on the first try and the
      photo change is not janky.
      Where: spot photo gallery, touch device
- [ ] No white or near-white flash while a photo loads on a real (slow) connection — the surface
      stays dark through the swap. Throttle the network to see it; it will not reproduce on a
      warm cache.
      Where: spot photo gallery  ·  How to get there: DevTools → Slow 3G → open a spot's gallery
- [ ] The photo counter stays legible over varied photos (bright sky, dark concrete) rather than
      disappearing into the image behind it.
      Where: spot photo gallery, bottom-right corner
- [ ] With `prefers-reduced-motion: reduce` enabled at the OS level, advancing photos carries no
      animation the setting should have suppressed.
      Where: spot photo gallery  ·  How to get there: enable Reduce Motion, then advance a photo

## Container / renderer split — no visible change intended (Task 5)

This task is a behavior-preserving refactor: the Google embed moved into its own component and
the container kept the state machine. The four items that follow are *regression* checks — the
correct outcome is "identical to before the refactor", on any of the 15 Google-embed cities. The
fifth, below the note, covers the one genuinely new surface the refactor added.

- [ ] The map still fades in over roughly 700ms once the renderer reports ready, with no white
      flash at any point in the reveal. The opacity animation moved from the iframe onto the
      `app-gmaps-embed` host element, so this is the item most likely to have drifted.
      Where: any non-Vienna city page  ·  How to get there: app root → city list → e.g. Berlin
- [ ] The embed still fills its container edge to edge, with no gap, no double scrollbar, and no
      overflow — the `.map-container iframe` sizing rules moved into `gmaps-embed.component.css`
      as `:host` + `iframe` rules.
      Where: any non-Vienna city page, checked at both desktop and phone width
- [ ] The loading overlay looks and times exactly as it did before, and switching cities in the
      dropdown re-shows it rather than leaving the previous map visible.
      Where: any city page  ·  How to get there: change the city in the dropdown, watch the swap
- [ ] The "SIGNAL LOST // MAP UNREACHABLE" failure surface and its RETRY button look unchanged,
      and RETRY still re-points the embed at a fresh URL.
      Where: any city page  ·  How to get there: DevTools → block the Google embed request, reload

**Gated on Task 10 until now, and that gate is open.** No renderer emitted `unsupported` until Task
10 landed MapLibre, so the item below had nothing to trigger it. Vienna renders through MapLibre as
of commit `01797e6`, so it is now walkable in the running app, and stays unchecked until a human has
looked at it.

- [ ] The new "NO RENDERER // THIS BROWSER HAS NO WEBGL" surface really appears when the renderer
      reports `unsupported`, and reads in the terminal palette — phosphor text, no white anywhere —
      rather than as an unstyled fallback.
      Where: Vienna city page  ·  How to get there: open Vienna on a browser or profile with WebGL
      disabled (e.g. `chrome://flags` → WebGL disabled), then reload

---

## Terminal basemap style (Task 6)

The style module was authored data until Task 8 rendered it and Task 10 turned Vienna on. Both have
landed — Vienna renders through MapLibre as of commit `01797e6` — so all four items are now walkable
in the running app, and all four stay unchecked until a human has looked at them. They remain human
items either way: a structural DOM read cannot see any of them.

- [ ] The basemap reads as a phosphor wireframe of Vienna: true-black ground, dim-green road
      hierarchy, buildings as outlines rather than filled blocks — at the zoom levels the pilot
      actually opens at, not just when zoomed far in.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna
- [ ] Street and place labels are legible and not colliding, and the `Noto Sans Regular`
      fontstack really loads from the OpenFreeMap glyph endpoint — no fallback boxes, no missing
      glyphs. **Open question to settle against the rendered map:** street names use MapLibre's
      default point placement, because the plan pinned the label layout properties without
      `symbol-placement: 'line'`. Decide on sight whether street names should instead follow the
      road line.
      Where: Vienna city page, at street-level zoom
- [ ] Road line widths interpolate sensibly across zoom — roads thin out as you zoom away
      instead of smearing into slabs, and thicken without going blocky as you zoom in.
      Where: Vienna city page  ·  How to get there: pinch/scroll through the full zoom range
- [ ] No white or near-white surface appears at any point while tiles are still loading, nor
      when a tile request fails (QC3 / the No-White Rule). The style source is verified free of
      white tokens, but the *rendered* gap between requested and painted tiles is not something
      the spec can see.
      Where: Vienna city page  ·  How to get there: DevTools → throttle to Slow 3G, then reload;
      then block `tiles.openfreemap.org` and reload again

---

## Real map factory registered (Task 7)

The karma suite can only assert that a `MAP_FACTORY` provider exists in `appConfig`. Whether that
provider actually *works* is a browser fact, and nothing injected it until Task 8 landed the
component and Task 10 turned Vienna on. Both have landed — Vienna renders through MapLibre as of
commit `01797e6` — so the item below is now walkable in the running app, and stays unchecked until a
human has looked at it.

- [ ] The registered factory really yields a working map in a browser: the lazy `maplibre-gl`
      import resolves at runtime (no chunk-load failure in the console) and a Map instance
      renders rather than the container falling through to its failure surface.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna, with DevTools
      console open — a failed dynamic import shows up there, not on the page

---

## The spot map itself (Task 8)

`SpotMapComponent`'s whole spec suite runs against an injected fake map, so none of what follows has
been seen in a browser. These items were recorded as unreachable while no template referenced
`app-spot-map`; **Task 10 turned Vienna on — the container's `@switch` renders `app-spot-map` as of
commit `01797e6` — so every item here is now walkable in the running app**, and every one stays
unchecked until a human has looked at it.

The gesture items are the pilot's whole reason for existing: the two-finger pinch-zoom bug is
what Phase 1 set out to fix, so items 1–3 are the ones to walk first once Vienna is live.

- [ ] One-finger drag pans the Vienna map and never scrolls the page underneath it, while the
      rest of the page keeps its native pinch-zoom (the `touch-action` scoping is the fix —
      confining it to the canvas host is what keeps page zoom available as an accessibility
      affordance).
      Where: Vienna city page  ·  How to get there: on a real touch device, drag inside the map,
      then pinch somewhere outside it
- [ ] A two-finger gesture on the map only zooms — it never rotates or tilts the view.
      Where: Vienna city page  ·  How to get there: two-finger pinch and twist inside the map
- [ ] A pan that reaches the map's edge does not chain into the browser's pull-to-refresh.
      Where: Vienna city page  ·  How to get there: drag downward from the top of the map
- [ ] The opening camera frames all Vienna spots with room to spare rather than a hardcoded
      centre, and stops short of zooming absurdly close on a tight cluster.
      Where: Vienna city page  ·  How to get there: load the page and watch the initial move
- [ ] With reduced motion enabled, that opening camera move is instant rather than animated
      (QC4).
      Where: Vienna city page  ·  How to get there: macOS System Settings → Accessibility →
      Display → Reduce motion, then reload
- [ ] The OSM / OpenMapTiles attribution is present and legible in the terminal palette,
      including the compact info toggle's icon — repainted, not hidden. It is a licence
      condition, so illegible counts as failed.
      Where: Vienna city page, map bottom corner  ·  How to get there: tap the compact info toggle
- [ ] Spot pins read as glowing phosphor dots, demolished ones visibly dimmer than active ones,
      and tapping near a pin is comfortable — the hit target is 22 px against a 6 px visible pin
      (QC8).
      Where: Vienna city page  ·  How to get there: tap slightly off-centre from several pins
- [ ] Nothing white or near-white appears while the map loads, while it fails, or while it is
      switched between cities (QC3). The switch case matters most: the component tears the old
      map down before building the new one, and that gap is exactly where a white flash would
      show.
      Where: Vienna city page  ·  How to get there: throttle to Slow 3G and reload; then switch
      city away from Vienna and back

---

## The spot popup and pin selection (Task 9)

`SpotPopupComponent` and the tap-to-select path in `SpotMapComponent` are covered by specs that
run against an injected fake map and a fake popup, so nothing below has been seen in a browser.
These items were recorded as unreachable while the container referenced no `app-spot-map` and the
production build tree-shook both new components out; **Task 10 turned Vienna on as of commit
`01797e6`, so every item here is now walkable in the running app**, and stays unchecked rather than
being marked N/A until a human has walked it.

- [ ] Tapping a pin opens the popup over the map with the photo gallery, the spot name and the
      directions link framed legibly — terminal surface, phosphor text, a `--color-line` border
      and the edge glow — with nothing white anywhere, MapLibre's own tip and close button
      included. Those three are built outside the component's DOM and MapLibre's global
      stylesheet paints them `#fff`, so they are the most likely place for white to survive.
      Where: Vienna city page, popup over the map  ·  How to get there: Vienna map → tap a spot pin
- [ ] The tapped pin picks up its amber selection ring, and tapping a second pin moves the ring
      there rather than leaving both lit. This rides on MapLibre promoting each spot's string
      `id` into the feature id for feature-state — something only a real map exercises, which no
      test can reach.
      Where: Vienna city page  ·  How to get there: tap one pin, then tap another
- [ ] The popup's close button is comfortably thumb-sized, shows a clearly visible phosphor focus
      ring when tabbed to, and closing the popup drops the selection ring from the pin.
      Where: Vienna city page, popup header  ·  How to get there: open a popup, tab to the close
      button, then close it
- [ ] The gallery's arrows advance the photo inside the popup, and a horizontal swipe on the photo
      does the same on a phone. The swipe is the part to watch: the popup sits inside the canvas
      host, which is `touch-action: none`, so the map could swallow the gesture.
      Where: Vienna city page, popup gallery, touch device
- [ ] `> DIRECTIONS` is keyboard-focusable with a visible ring, and tapping it on a phone really
      opens the device's maps app at the spot, with the spot's name as the destination label. The
      `geo:` URI only resolves on a real device — a desktop browser proves nothing here.
      Where: Vienna city page, popup footer  ·  How to get there: open a popup on a phone, tap
      `> DIRECTIONS`
- [ ] A map that loses single resources still paints and reveals, with no "SIGNAL LOST" flash on the
      way there: a failed glyph range or a handful of failed tiles is survivable, because the
      fatal/non-fatal discriminator reads what the error payload names rather than asking
      `map.isStyleLoaded()`.
      Where: Vienna city page  ·  How to get there: DevTools → block `tiles.openfreemap.org/fonts/*`,
      or a few tile requests, then reload
- [ ] A genuinely unreachable basemap — a source whose metadata never arrives — still shows
      "SIGNAL LOST // MAP UNREACHABLE" with its RETRY button, and the map never appears behind that
      chrome afterwards. This is the behaviour round 1 got wrong, so walk it first.
      Where: Vienna city page  ·  How to get there: DevTools → block
      `tiles.openfreemap.org/planet` (the TileJSON), then reload
- [ ] A pointer hovering a pin turns into a pointer cursor on a desktop browser — the affordance
      that tells a mouse user the pins are tappable at all.
      Where: Vienna city page, desktop browser  ·  How to get there: move the mouse over a pin

---

## Turn Vienna on (Task 10)

This is the task the rest of the branch was waiting on: `config.ts` sets Vienna's renderer to
`MapRendererEnum.MapLibre` and the container's `@switch` renders `app-spot-map`, as of commit
`01797e6`. It is what opens the gate on the Task 5 WebGL note and on the Task 6 through Task 9
sections above — all of those are now walkable, none of them verified. Nothing below has been seen
in a browser either: a headless spec cannot see a rendered map.

- [ ] Vienna really draws the MapLibre terminal-style basemap with its spot pins, fits the camera to
      the city's spots, and reveals with the existing ~700ms fade — on a phone and on a desktop
      browser.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna
- [ ] The other 15 cities still show their Google embed, and switching Vienna → another city → back
      re-arms the loading overlay each time, with no white flash in either direction.
      Where: any city page  ·  How to get there: Vienna → change the city in the dropdown → back
- [ ] The popup frame survives the stylesheet move out of the component into `src/styles.css`:
      surface background, `--color-line` border, edge glow, phosphor text, and a phosphor-dim close
      button that brightens on hover and shows a visible focus ring — with no white anywhere, the
      tip included, for every anchor direction the popup can take.
      Where: Vienna city page, popup over the map  ·  How to get there: tap pins near each map edge
      so the popup anchors above, below, left and right of the pin in turn
- [ ] On a popup anchored top-left, top-right, bottom-left or bottom-right, the corner nearest the
      tip renders square rather than 2px rounded — MapLibre's own rule won the cascade once the frame
      rules moved into the global stylesheet. Confirm it reads as intentional rather than clipped.
      Where: Vienna city page, popup corner nearest the tip  ·  How to get there: tap a pin near a
      map corner, so the popup takes a diagonal anchor
- [ ] `maplibre-gl` arrives as its own lazy request when the map route is opened, rather than in the
      initial page load. The chunk split is verified in the build output; that it really loads on
      demand in a browser is not.
      Where: Vienna city page  ·  How to get there: DevTools → Network → load app root, then open
      Vienna and watch for the maplibre chunk
- [ ] The OSM / OpenMapTiles attribution is actually present on the live Vienna map (Task 8's item
      covers whether it is *legible*; this one covers whether it is there at all). It is a licence
      condition, so missing counts as failed.
      Where: Vienna city page, map bottom corner  ·  How to get there: app root → city list → Vienna

---

## Map surface matches its documentation, and the No-White Rule holds with no exceptions (Task 11)

This task touched only `PRODUCT.md` and `DESIGN.md` (commit `016d6a7`) — no rendered code changed, so
nothing below is newly *reachable*, it's newly *described*. DESIGN.md's new "Map Surface (signature —
Vienna)" section was written from the style definition, the component templates and the stylesheets,
not from a running map, so it needs a human look on the actual screen. Most of what it describes — the
basemap wireframe, the road hierarchy, labels, road-width scaling, the pin glow, the amber selection
ring, the popup frame, the gallery's interactive behaviour, and the attribution control — is already
walked by the Task 4, 6, 8, 9 and 10 sections above; the items below are only the slices none of those
sections cover. The task also removed the No-White Rule's carve-out for map tiles, so the last item is
a fresh sweep now that the rule has no exception left.

- [ ] Water reads as a distinct near-black (`surface`) and parks/grass/wood as a slightly lighter
      near-black (`surface-raised`) — the two read apart from each other and from plain ground, not
      just the black-ground-vs-green-roads contrast Task 6's items already cover.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna, find a park or the
      riverbank
- [ ] An `unclassified` spot's pin reads exactly like an `active` spot's — same lit phosphor color,
      same bloom, no third or intermediate treatment — because the style only branches on
      `demolished`. (Task 8's pin item already covers the demolished-vs-active dimming and the hit
      target; Task 9's already covers the amber selection ring on top of whichever base color a
      tapped pin has.)
      Where: Vienna city page  ·  How to get there: tap around the map and compare an unclassified
      spot's pin against a clearly-active one
- [ ] A demolished spot's popup shows a `> DEMOLISHED` line under the spot name, in unlit
      phosphor-dim with no glow; a standing spot's popup has no such line. (Task 9's and Task 10's
      popup items already cover the frame, close button and tip — this is the one popup element
      neither has walked. Branch review moved this line off amber, so an amber `> DEMOLISHED` is now
      a failure, not a pass.)
      Where: Vienna city page, popup body  ·  How to get there: tap a demolished spot's pin, then
      compare against a standing spot's popup
- [ ] The photo gallery panel itself reads as dark terminal chrome rather than a bare image well: a
      `surface`-dark background and a phosphor-green hairline border frame the 4:3 photo, and — with
      more than one photo — the ‹ › nav buttons show their own phosphor-deep border at rest, not only
      when focused. (Task 4's gallery items already cover cropping, focus rings, tap size, load flash,
      the counter and reduced motion — this is the static panel/button chrome none of them checked.)
      Where: spot photo gallery  ·  How to get there: Vienna map → tap a spot pin → popup gallery
- [ ] Now that the No-White Rule has no map-tile carve-out, a fresh sweep turns up no white or
      near-white anywhere on the Vienna map: the MapLibre popup box and its tip, the attribution
      control (its background and the refilled info glyph), the loading overlay, and both failure
      overlays (`SIGNAL LOST // MAP UNREACHABLE` and `NO RENDERER // THIS BROWSER HAS NO WEBGL`).
      Where: Vienna city page  ·  How to get there: open a popup, throttle/block the network as in
      Tasks 6, 8 and 9's overlay items, and tap the attribution control's compact toggle along the way

## Branch review fixes (round 1)

Nine fixes landed after the whole-branch review, and between them they change what a walkthrough
has to look at. Two are load-bearing enough to do FIRST: before the worker fix, the map never
finished loading in either a built or a dev-served app, so every rendered item in every section
above was unreachable on a real device. Confirm the map paints at all, then walk the rest.

- [ ] The map actually finishes loading and paints tiles under `ng serve` on the phone — pins over a
      real basemap, no `> SIGNAL LOST // MAP UNREACHABLE` after the watchdog. Before this fix the
      worker module 404'd and this always failed.
      Where: Vienna city page  ·  How to get there: `npm start` in spotmap-website/, open the dev
      server's LAN address on the phone, let the map settle for 20 seconds
- [ ] The same holds for the production build served under its deploy path — the artifact users
      actually get, not just the dev server.
      Where: Vienna city page  ·  How to get there: `npm run build:pages`, serve
      `dist/spotmap-website/browser` under a `/spotmap-website/` prefix, open it on the phone
- [ ] Two fingers dragged straight up or down together never tilt the map — the ground stays flat,
      buildings and labels never skew into perspective. This is one asymmetric grip away from the
      pinch the user meant, so try it deliberately and sloppily.
      Where: Vienna city page  ·  How to get there: pinch-zoom normally first, then drag two fingers
      vertically without spreading them
- [ ] Two fingers twisted never rotate the map — north stays up — and one finger still pans while
      two fingers still pinch-zoom the map rather than the page.
      Where: Vienna city page  ·  How to get there: twist, then pan one-handed, then pinch
- [ ] With a hardware keyboard attached, arrow keys pan and `+`/`-` zoom, while `Shift`+arrow does
      nothing at all.
      Where: Vienna city page  ·  How to get there: pair a keyboard, focus the map canvas, try each
- [ ] Donaupark, the Prater, the Stadtpark and Schönbrunn read as a raised green-black against plain
      black ground — and the two blacks are still distinguishable outdoors in daylight, not just on a
      desk. Before this fix no park rendered at all.
      Where: Vienna city page  ·  How to get there: pan to Donaupark (a pilot spot), then the Prater
- [ ] The green does not read as busy or noisy at z14 in dense districts — the centre alone carries
      several hundred grass polygons.
      Where: Vienna city page  ·  How to get there: zoom to street level in the 1st district
- [ ] The four road tiers separate on a phone in sunlight: motorway and trunk brightest, down to
      service and track dimmest, with two of the four steps carried by opacity rather than hue.
      Where: Vienna city page  ·  How to get there: find a motorway, a main road and a side street in
      one screen, outdoors
- [ ] Footways, steps, cycleways, plazas and piers read as a dashed texture and tram/rail as dotted
      hairlines — there to navigate by, never mistaken for streets — at z14 through z16.
      Where: Vienna city page  ·  How to get there: zoom into a pedestrian zone and a tram corridor
- [ ] The casing under the major roads helps them read rather than muddying the wireframe at z12–z14.
      Where: Vienna city page  ·  How to get there: zoom out to city level
- [ ] On a browser profile with WebGL 2 disabled, `> NO RENDERER // THIS BROWSER HAS NO WEBGL`
      appears immediately with no RETRY — not a 15-second spinner followed by a retry that cannot
      work.
      Where: Vienna city page  ·  How to get there: disable WebGL 2 in the browser's flags, reload
- [ ] With the maplibre chunk blocked, `> SIGNAL LOST // MAP UNREACHABLE` and `> RETRY` appear
      promptly rather than only after the watchdog elapses.
      Where: Vienna city page  ·  How to get there: block the maplibre chunk in devtools, reload
- [ ] With the glyph endpoint blocked, the labels vanish but the map still paints — and the error is
      visible in the console rather than silently swallowed.
      Where: Vienna city page  ·  How to get there: block `tiles.openfreemap.org/fonts/*`, reload,
      watch the console
- [ ] A tapped demolished pin shows amber in exactly one role on screen — the selection ring — and
      the unlit `> DEMOLISHED` line is still legible in sunlight despite having no glow.
      Where: Vienna city page, popup body  ·  How to get there: tap one of the four demolished pins,
      outdoors
- [ ] `> DIRECTIONS` opens the device's maps app on BOTH iOS Safari and Android Chrome, landing on
      the right spot. The previous `geo:` link did nothing on iOS, so test iOS specifically.
      Where: spot popup  ·  How to get there: tap a pin, then `> DIRECTIONS`, on each platform
- [ ] With the system "Reduce Motion" setting on, the opening view cuts straight to the spots instead
      of easing into place over about half a second.
      Where: Vienna city page  ·  How to get there: enable Reduce Motion in system settings, reload
- [ ] The About page reads true: Vienna's map is the site's own, the other cities still run on the
      Google embed, and the voice still sounds like the rest of the page.
      Where: About page  ·  How to get there: `ⓘ About` from the nav
## Branch review fixes (round 2)

A second review round re-checked the first round's fixes and found more. These items cover what
changed as a result: the directions link no longer replaces the archive, tunnels of every class
came off the basemap while elevated transit went back on, and the no-renderer message was
rewritten for people who do not know what WebGL is.

- [ ] After the first deploy with these changes, the live Pages site loads its map with no
      `maplibre-gl-worker.mjs` 404 in the network log. The build guard proves the file is
      emitted next to the chunk that asks for it; only the deployed site proves it is delivered
      under the `/spotmap-website/` base path.
      Where: the deployed site  ·  How to get there: open the Pages URL on the phone with the
      network log recording
- [ ] The `> NO RENDERER // THIS BROWSER CANNOT DRAW THE MAP` line does not wrap badly on a
      narrow phone — it is 48 characters against the 31 of `> SIGNAL LOST // MAP UNREACHABLE`,
      so it is the longest phosphor message the failure surfaces carry.
      Where: Vienna city page  ·  How to get there: disable WebGL 2 in the browser's flags,
      reload, look at it in portrait on the narrowest phone available
- [ ] `> DIRECTIONS` leaves the archive standing: on an iPhone whose maps app is Apple Maps, and
      on an Android without Google Maps, the map, its open popup and the amber selection ring
      are all still there when you come back. On a phone that does have Google Maps, the app
      still opens. On iOS Safari specifically, check the new tab is not suppressed as a pop-up.
      Where: spot popup  ·  How to get there: tap a pin, then `> DIRECTIONS`, on each device
- [ ] Vienna's elevated U6 viaduct reads as dashed track along the Gürtel, and the U4 along the
      Wienfluss likewise — landmarks to navigate by rather than noise. Road tunnels now stop at
      the portal, so check the A23 and the Kaisermühlentunnel still read as a navigable network,
      and that no underpass a skater actually rolls through went missing with them.
      Where: Vienna city page  ·  How to get there: pan along the Gürtel at z13 and above, then
      out to the A23
- [ ] The About credits block reads right with three prompt lines where it had two — its rhythm
      against the neighbouring blocks is a look call the suite cannot make.
      Where: About page  ·  How to get there: `ⓘ About` from the nav, scroll to CREDITS
