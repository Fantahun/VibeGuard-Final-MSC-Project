# VibeGuard Defense Demo Summary

This is a short, slide-ready recap of the live demo sequence and outcomes.

## Demo Highlights

- Enrichment visibility: system + enriched prompts printed by default.
- WARN + human review: policy WARN triggered, approval required.
- REGENERATE loop: automatic retry after rejection, then ACCEPT.
- SAST validation: security enrichment shown, no findings in this run.
- Metrics summary: pipeline outcomes aggregated for evidence.

## Session Snapshots

- WARN demo session ID: 0636041a-edaf-48bf-b084-c685613e9d93
- REGENERATE demo session ID: 24823b10-20c4-48db-b037-fea5b3c74feb
- SAST demo session ID: 25c04b50-aa88-4661-afdf-145df369b138

## Metrics (VibeGuard)

- Sessions: 20
- Avg vulnerability density (per 1000 LOC): 0
- Avg critical findings: 0
- Avg duration (ms): 105821
- Approval rate (%): 55

## Evidence Locations

- Full session traces: [logs/provenance.jsonl](logs/provenance.jsonl)
- Metrics log: [logs/metrics.jsonl](logs/metrics.jsonl)
- Demo checklist: [docs/defense_demo_checklist.md](docs/defense_demo_checklist.md)
