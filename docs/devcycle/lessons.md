# Lessons

## planning

- Plan bundle-budget headroom; split or lazy-load heavy UI first and raise an angular.json budget only if splitting is impossible and the user approves [novel:budget-raise-vs-split-preference] [novel:bundle-budget-not-planned]
- When a task removes or renames a selector or symbol, list every dependent spec in its Files block [novel:task-files-list-misses-dependent-spec]
- Re-verify counts, line numbers and command behavior from a spec, plan or audit against live code before acting [novel:stale-premise-carried-into-plan]

## execution

- Trace third-party and CI behavior in node_modules or a real run before trusting a hand-written fake or local green [novel:vendor-semantics-assumed-not-traced]
- Update README, DESIGN.md and nearby comments in the task that changes the behavior they describe [novel:docs-stale-after-behavior-change]
- Add a doc comment to every interface, enum, class, component and client you touch [novel:missing-doc-comments-on-touched-code]

## on-device

- Before an on-device walk, confirm the dev server and local stack respond and the checklist matches the UI [novel:on-device-prerequisites-unready]
