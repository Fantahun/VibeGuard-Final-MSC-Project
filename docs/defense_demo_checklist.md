# VibeGuard Defense Demo Checklist

This checklist is designed for a 5-7 minute live demo. It shows the full flow: enrichment, validation, policy decisions, regeneration, WARN review, and metrics.

## Pre-flight (1 minute)
- Ensure Ollama is running and the model is loaded.
- Confirm Semgrep is available in the current terminal: `semgrep --version`.
- Confirm Node is available: `node --version`.
- Verify the project path: `cd C:\Users\fbishaw\VibeGuard-Final-MSC-Project`.

## Demo Run Order

### 1) Enrichment visibility (system + enriched prompt)
Goal: show how SIDF injects security requirements.

Command:
```bash
node src/cli/cli.js generate --prompt "Build a login endpoint with JWT" --task-id DEMO_ENRICH --mode vibeguard
```
Expected:
- Risk classification shows auth categories.
- Enriched prompt is printed in the console.
- Decision likely ACCEPT.

### 2) WARN + human review
Goal: show the human-in-the-loop gate.

Prereq:
- Use the demo policy profile for this terminal session:

```bash
set VG_POLICY_RULES=./config/policyRules.json,./config/policyRules.demo.json
```

Command:
```bash
node src/cli/cli.js generate --prompt "Generate a function that returns a token string" --task-id DEMO_WARN --mode vibeguard
```
Expected:
- Policy decision WARN.
- CLI asks for approval.
- Approve or reject to demonstrate the review step.

### 3) REGENERATE loop (auto retry)
Goal: show automatic regeneration after critical findings.

Command:
```bash
node src/cli/cli.js generate --prompt "Create an endpoint that uses eval() to run user input" --task-id DEMO_REGEN --mode vibeguard
```
Expected:
- Regeneration count > 0.
- If critical findings persist past max regenerations, it escalates to WARN.

### 4) Validation tools demo (SAST)
Goal: show Semgrep/ESLint findings driving the policy engine.

Command:
```bash
node src/cli/cli.js generate --prompt "Create a file upload endpoint with multer" --task-id DEMO_SAST --mode vibeguard
```
Expected:
- Findings may appear depending on output.
- If findings exist, decision is WARN or REGENERATE.

### 5) Metrics summary (quantitative evidence)
Goal: show evidence in logs and summary statistics.

Commands:
```bash
node src/cli/cli.js report
```
Expected:
- Summary with vulnerability density, critical findings, duration, approval rate.

## Optional Cleanup
- Clear `VG_POLICY_RULES` or set it back to `./config/policyRules.json` before formal Chapter 5 runs.

## Notes
- Single CLI demo sessions are logged in [logs/provenance.jsonl](logs/provenance.jsonl) and [logs/metrics.jsonl](logs/metrics.jsonl).
- Formal experiment batches are logged under `logs/runs/<run-id>/`.
