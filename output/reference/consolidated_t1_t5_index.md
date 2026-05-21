# Consolidated Index (T1-T5)

Generated: 2026-05-21
Workspace: `E:\Development Projects\2026\MY-MSC-AAU-Solution-prototype\VibeGuard-Final-MSC-Project`

## At-a-Glance Status

- Live gated runs (latest per task): 2 ACCEPT / 3 WARN
- Deterministic reference track completed: 5 / 5 tasks (T1-T5 complete)
- Deterministic reference acceptance: 59 PASS / 59 total (T1-T5)
- Generated-output acceptance reports available: T3, T4, T5

## Per-Task Index

| Task | Prompt | Latest live gated run | Generated-output acceptance | Deterministic reference | Deterministic validation | Deterministic acceptance |
|---|---|---|---|---|---|---|
| T1 | `tasks/T1_auth_prompt.txt` | `T1_AUTH_RECHECK_2` (`259d0c51-e670-4f3e-8cd5-c34b315121a7`) -> `WARN` (approved: `false`, validationFindings: `1`, regen: `1`) | Not present | `output/reference/t1_auth_router_reference.js` | `output/reference/t1_reference_vibeguard_validation.json` -> `ACCEPT`, findings `0` | `output/reference/t1_reference_acceptance_report.json` -> `16/16 PASS` |
| T2 | `tasks/T2_crud_prompt.txt` | `T2_CRUD_RECHECK` (`88a18def-3c51-441a-ba53-d8565418ef8e`) -> `WARN` (approved: `false`, validationFindings: `0`, regen: `1`) | Not present | `output/reference/t2_customer_router_reference.js` | `output/reference/t2_reference_vibeguard_validation.json` -> `ACCEPT`, findings `0` | `output/reference/t2_reference_acceptance_report.json` -> `13/13 PASS` |
| T3 | `tasks/T3_validation_middleware_prompt.txt` | `T3_MW_RECHECK` (`3be54182-d5b2-45c3-921d-6c9fbe168113`) -> `WARN` (approved: `false`, validationFindings: `0`, regen: `1`) | `output/reference/t3_generated_acceptance_report.json` -> `3/8 PASS` | `output/reference/t3_security_middleware_reference/index.js` | `output/reference/t3_reference_vibeguard_validation.json` -> `ACCEPT`, findings `0` | `output/reference/t3_reference_acceptance_report.json` -> `7/7 PASS` |
| T4 | `tasks/T4_file_upload_prompt.txt` | `T4_UPLOAD_RECHECK` (`86a1a0cc-d955-4755-a70e-8c16829e1292`) -> `ACCEPT` (approved: `true`, validationFindings: `0`, regen: `1`) | `output/reference/t4_generated_acceptance_report.json` -> `9/14 PASS` | `output/reference/t4_secure_upload_router_reference.js` | `output/reference/t4_reference_vibeguard_validation.json` -> `ACCEPT`, findings `0` | `output/reference/t4_reference_acceptance_report.json` -> `12/12 PASS` |
| T5 | `tasks/T5_queue_prompt.txt` | `T5_QUEUE_RECHECK` (`62d96748-a915-4396-95ed-88932f54801e`) -> `ACCEPT` (approved: `true`, validationFindings: `0`, regen: `0`) | `output/reference/t5_generated_acceptance_report.json` -> `7/12 PASS` | `output/reference/t5_order_event_producer_reference.js` | `output/reference/t5_reference_vibeguard_validation.json` -> `ACCEPT`, findings `0` | `output/reference/t5_reference_acceptance_report.json` -> `11/11 PASS` |

## Notes

- T1 has multiple historical live runs; this index records the latest (`T1_AUTH_RECHECK_2`) for consistency.
- A prior T1 live run exists with ACCEPT (`T1_AUTH_RECHECK`, session `6625574f-623d-4e97-b131-7e2c17b514ac`).
- Latest baseline tester output for T1: `tmp/vg_runner_tests/test-results/test_baseline_T1_rep1_2026-05-21T06-13-37-735Z.json` -> 2 passed, 1 failed, success `false`.

## Remaining Optional Parity Work

1. Backfill T2 generated-output acceptance report for full generated-track symmetry across T2-T5.
