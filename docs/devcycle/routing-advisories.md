# Routing advisories

### chore

No cell in this class holds the 5 dispatches a comparator needs, so every row below reports `no-comparator`.

| Model | Dispatches | Rework-free accepts | Cost / accepted task | Ratio vs. cheapest | Verdict |
| --- | --- | --- | --- | --- | --- |
| `claude-opus-5-5` | 1 | 1 | $0.57 | — | no-comparator |
| `claude-sonnet-5` | 3 | 3 | $0.42 | — | no-comparator |
| `claude-sonnet-5-5` | 2 | 2 | $0.32 | — | no-comparator |

### docs

Compared against `claude-sonnet-5-5` — the class's cheapest cell of at least 5 dispatches, by measured mean cost per dispatch.

| Model | Dispatches | Rework-free accepts | Cost / accepted task | Ratio vs. cheapest | Verdict |
| --- | --- | --- | --- | --- | --- |
| `claude-opus-5-5` ‡ | 1 | 1 | $1.14 | 4.91x [4.41x, 5.91x] · 0 of 20000 draws discarded | premium-not-justified |
| `claude-sonnet-5-5` | 5 | 5 | $0.23 | — | baseline |

‡ below the comparator floor of 5 dispatches: reported and compared, never the baseline.

### feature

Compared against `claude-sonnet-5-5` — the class's cheapest cell of at least 5 dispatches, by measured mean cost per dispatch.

| Model | Dispatches | Rework-free accepts | Cost / accepted task | Ratio vs. cheapest | Verdict |
| --- | --- | --- | --- | --- | --- |
| `claude-opus-5` | 9 | 6 | $8.43 | 8.92x [3.97x, 25.03x] · 0 of 20000 draws discarded | premium-not-justified |
| `claude-opus-5-5` | 88 | 61 | $2.48 | 2.64x [1.83x, 3.84x] · 0 of 20000 draws discarded | premium-not-justified |
| `claude-sonnet-5` ‡ | 3 | 3 | $1.55 | 1.64x [0.69x, 3.25x] · 0 of 20000 draws discarded | unresolved |
| `claude-sonnet-5-5` | 54 | 39 | $0.94 | — | baseline |

‡ below the comparator floor of 5 dispatches: reported and compared, never the baseline.

### refactor

Compared against `claude-sonnet-5-5` — the class's cheapest cell of at least 5 dispatches, by measured mean cost per dispatch.

| Model | Dispatches | Rework-free accepts | Cost / accepted task | Ratio vs. cheapest | Verdict |
| --- | --- | --- | --- | --- | --- |
| `claude-opus-5-5` | 12 | 11 | $2.09 | 3.07x [1.27x, 6.01x] · 30 of 20000 draws discarded | premium-not-justified |
| `claude-sonnet-5-5` | 6 | 4 | $0.66 | — | baseline |

### Corpus and exclusions

Implementer transcripts found: 250 · joined to a run: 250 · with a task number: 198 · with a known requestKind: 250 · with a round-1 verdict: 184.
Task numbers: 177 from the dispatch record's agentId, 21 from the sidecar description.
Measured spend across joined dispatches: $418.09, of which 0 dispatch(es) could not be priced.

- session absent from the run journal — 0
- unparseable task attribution — 52
- unknown requestKind — 0
- missing transcript — 0
- no priced turns — 0
- unpriceable turn model — 0
- multi-model subagent — 0
- no round-1 verdict — 14

### Confounds this advisory does not correct

- **Task selection.** The `auto` predicates in `references/model-routing.md` § Model tiers chose each
  dispatch's model from task complexity, so pricier cells hold systematically harder and larger
  tasks. The measured ratio is not a causal efficiency claim about the models.
- **Multiplicity.** One comparison per cell against its class's cheapest, with the comparator
  chosen by cost after the data was seen. Each interval is per comparison, not family-wise.
- **Same-tier cells.** Two models that price identically differ here only in acceptance and
  token use. That comparison is reported, not suppressed.
- **Window.** The corpus is whatever the journal and transcripts hold, not a controlled trial;
  a cell's composition shifts as the repo's work shifts.

Nothing reads this advisory. Routing changes only when a human sets a `*Model` knob via
`claude plugin install --config`.
