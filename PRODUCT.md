# Product

## Register

product

## Users

Street skaters — the underground/DIY end of the culture, both **locals** who want the spots in their own city and **travelers** checking a new city before a session. Primary context is **a phone, outdoors, often mid-session** (bright sunlight, one hand, impatient). They value being **insiders**: seeing spots others don't. Not a mass audience — a niche, in-the-know crowd who'll appreciate a terminal/matrix in-joke but still need the map to load and answer "where do I skate?" fast.

## Product Purpose

A matrix/terminal-themed **compendium of skate spots across European cities** (Vienna, Graz, Prague, Barcelona, …). You pick a city and get its Google My Maps of spots.

Two jobs, in priority order:
1. **Primary (utility):** help a skater **find and go skate a spot** — new ones, or older/forgotten/lost ones worth resurfacing. Fast city-switching, fast map access, works on mobile outdoors.
2. **Secondary (identity & history):** be **a crucial piece of skate identity and a living archive**. Spots — including forgotten and demolished ones — are worth preserving; the site is a record with weight, not a disposable app.

Success = a skater discovers (or rediscovers) a spot here and actually goes and skates it — and the "compendium" keeps growing and staying current across cities.

## Brand Personality

A blend of three, held in tension on purpose:
- **Raw / DIY** — made by skaters, not a company. Anti-polish is the point.
- **Cryptic / insider** — the terminal/matrix texture is an in-group signal; it rewards the in-the-know and frames spots as knowledge you're being let in on.
- **Sarcastic / self-aware** — the voice jokes and doesn't take itself seriously (existing copy: "CAN SOMEONE BRING WAX?", "SKATEVIDEOS > INSTAGRAM"), **but leaves room for earnest respect/safety notes** ("RESPECT THE LOCALS", and e.g. "TAKE CARE OF PEDESTRIANS"). Careless in tone, careful about the culture.

Guiding metaphor: **time travel back to earlier days.** Everything the site controls should feel like an earlier computing era — typewriter, terminal, matrix, CRT glow. (The embedded Google My Maps is the one modern element we can't currently replace; treat it as the single deliberate anachronism the retro shell wraps around.)

## Anti-references

- **Corporate / Google-Maps polish** — clean neutral mainstream mapping UI.
- **Mainstream fitness / social apps** — Strava / Instagram / Komoot: rounded friendly cards, engagement feeds, gradients.
- **Over-gamified / cutesy** — badges, mascots, confetti, bubbly rounded everything. Too toy-like for an archive.
- **Generic dark-mode SaaS template** — "dark theme + one accent + card grid." Dark ≠ the matrix aesthetic; the difference is the retro-computing intent, not just low brightness.
- **Constraint:** the Google My Maps iframe stays for now (can't be removed) — don't design as if it will go away; design the retro shell *around* it.

## Design Principles

1. **Time travel, not dark mode.** Every surface we control should read as an earlier computing era (terminal/typewriter/matrix/CRT), not a modern dark theme. If a choice would look at home in a 2020s SaaS dark UI, it's wrong.
2. **The map is the point.** Brand serves utility. The aesthetic must never slow down a skater on a phone in sunlight trying to find a spot — legibility, speed, and city-switching win any tie against vibe.
3. **Insider, not exclusive.** The cryptic/hacker texture rewards the in-crowd, but the core path (open → pick city → see spots) stays obvious and fast for anyone.
4. **Sarcastic, but caring about the culture.** Jokes are the default voice; respect and safety (locals, pedestrians, spots) are the earnest exceptions that keep it from being just edgy.
5. **An archive with weight.** Treat spots — especially forgotten/lost ones — as worth preserving. The design should feel like a record that lasts, not a throwaway feed.

## Accessibility & Inclusion

- **Mobile-first** is the accessibility priority: one-handed use, outdoors, in bright sunlight. Watch that the green-on-black glow stays legible in daylight (glow must not smear text; keep effective contrast high) and that touch targets/city-switching are thumb-friendly.
- **Honor `prefers-reduced-motion`** for every heavy animation (typewriter intro, glitch text, matrix radar spinner) — currently there are **no** reduced-motion fallbacks; each needs a calm alternative (crossfade/instant, static end-state) that still shows content.
- **Pragmatic WCAG AA where feasible** — prioritize contrast and keyboard/screen-reader basics (the map iframe needs a title; decorative ASCII should be hidden from AT). Not chasing full formal AA compliance for a niche passion project, but no obvious exclusions.
