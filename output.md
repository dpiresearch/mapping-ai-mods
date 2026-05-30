# Verification Run: 10 Previously Unverified People

Ran the same **beliefs-1-opus** pipeline on 10 people **not included in the prior batch**, drawn from the priority list. In production, **none of the 1,255 entities with belief data have `field_verification` set** (all show as "none" on the map), so these are genuinely unverified.

**People verified:** Casey Newton, Brian Schatz, Kim Stanley Robinson, Jakub Pachocki, Jared Polis, Kyle Fish, Demis Hassabis, Mark Zuckerberg, Holden Karnofsky, Jack Clark

---

## Process (same as before)

| Component | Details |
|---|---|
| **Pipeline** | `verification/beliefs-1-opus/run.js --from-map` |
| **LLM** | OpenAI `gpt-4.1` with adversarial verifier prompt |
| **Search** | Exa web search + page fetch |
| **Fields checked** | 6 belief fields per person (stance, detail, AGI timeline, risk, threats, evidence type) |
| **Verdicts** | `confirm` / `correct` / `remove` with confidence + citations |
| **Output** | `verification/beliefs-1-opus/results/entities/{id}.json` |

---

## Can they be flagged as "Verified"?

The map uses this logic (from `engine.js`):

- **Verified (green):** >80% of checked fields marked `verified`, **minimum 5 fields**
- **Partial (yellow):** >50% verified
- **Unverified (red):** everything else

For this run, a field counts as **`verified`** only when the agent returned **`confirm`** at medium/high confidence. Fields with **`correct`** (value wrong but checked) or **`remove`** do **not** count until corrections are applied.

| Person | Verdicts (confirm / correct / remove) | Fields → verified | **Can flag?** |
|---|---|---|---|
| **Brian Schatz** | 5 / 1 / 0 | 5/6 (83%) | **Yes — Verified** |
| **Kyle Fish** | 5 / 1 / 0 | 5/6 (83%) | **Yes — Verified** |
| **Jack Clark** | 5 / 1 / 0 | 5/6 (83%) | **Yes — Verified** |
| **Jakub Pachocki** | 4 / 2 / 0 | 4/6 (67%) | **Partial** |
| **Jared Polis** | 4 / 2 / 0 | 4/6 (67%) | **Partial** |
| Casey Newton | 3 / 2 / 1 | 3/6 (50%) | No — needs corrections first |
| Kim Stanley Robinson | 3 / 2 / 1 | 3/6 (50%) | No — stance should be removed |
| Demis Hassabis | 3 / 3 / 0 | 3/6 (50%) | No — half the fields need correction |
| Mark Zuckerberg | 3 / 3 / 0 | 3/6 (50%) | No — half the fields need correction |
| Holden Karnofsky | 3 / 3 / 0 | 3/6 (50%) | No — half the fields need correction |

**3 of 10** can receive the green **Verified** badge today (if `field_verification` is written to the DB).  
**2 of 10** qualify for **Partial**.  
**5 of 10** remain **Unverified** until proposed corrections are applied.

---

## Notable findings

**Ready to flag verified:**

- **Brian Schatz** — "Targeted" stance confirmed via AI Labeling Act sponsorship; 5/6 fields clean
- **Kyle Fish** (Anthropic model welfare lead) — "Precautionary" stance confirmed; strong first-person evidence
- **Jack Clark** (Anthropic co-founder) — 5/6 confirmed at high confidence; only detail text needs refinement

**Partial — close but not green:**

- **Jakub Pachocki** — "Targeted" confirmed; detail and timeline need correction
- **Jared Polis** — "Mixed/unclear" confirmed (appropriate for a governor without a fixed AI doctrine); 2 fields need updates

**Should NOT be flagged verified — data issues found:**

- **Kim Stanley Robinson** — **`belief_regulatory_stance` → remove**. Agent found no evidence he advocates targeted AI regulation; he's critical of AI hype language, not a policy advocate. Current "Targeted" label is unsupported.
- **Casey Newton** — AGI timeline removed (no public timeline statements); threat models and detail need correction
- **Mark Zuckerberg** — Stance "Mixed/unclear" confirmed, but timeline → `Ill-defined`, threat models and detail need correction
- **Demis Hassabis** — Stance "Targeted" confirmed (BBC: "smart regulation"), but timeline, risk level, and threat models all flagged for correction
- **Holden Karnofsky** — Stance confirmed; detail, timeline, and threat models need correction

---

## Aggregate stats

| Metric | Value |
|---|---|
| People processed | 10 |
| Fields checked | 60 |
| **Confirm** | 38 (63%) |
| **Correct** | 20 (33%) |
| **Remove** | 2 (3%) |
| Total API cost | ~$69 |
| Wall time | ~7 min batch + ~3 min retries |

---

## Summary

These 10 people had **no prior verification status** in production. After running the pipeline:

1. **3 people (Schatz, Fish, Clark)** meet the map's **Verified** threshold and can be flagged green once `field_verification` is written (via `--write-db` + `update-field-verification.cjs`).

2. **2 people (Pachocki, Polis)** are **Partial** — mostly accurate but need 2 field corrections each before reaching verified status.

3. **5 people** should **not** be flagged verified yet — either half their fields need correction (Hassabis, Zuckerberg, Karnofsky) or the data has substantive errors (Robinson's stance should be removed; Newton needs multiple fixes).

4. **Kim Stanley Robinson** is the clearest false positive: the map lists him as "Targeted" on AI regulation, but the agent found **no evidence** he holds a regulatory position — he's a novelist commenting on AI metaphors, not a policy actor.

To promote any of these to verified status on the live map, the workflow is: apply corrections → write `field_verification` JSONB per field → re-export map data. Results are saved in `verification/beliefs-1-opus/results/entities/{4,7,15,16,17,25,33,47,61,829}.json`.
