# VibeGuard

**Security-Integrated Development Framework (SIDF) for Node.js Microservices**

MSc Thesis Prototype — Addis Ababa University, Department of Computer Science  
Thesis: *Design and Evaluation of a Security-Integrated Vibe Coding Framework for Node.js Microservices*  
Author: Fantahun Bishaw Hailu  

---

## What VibeGuard does

VibeGuard intercepts developer natural-language prompts, classifies their security risk,
enriches them with secure coding requirements, invokes a large language model, validates
the generated Node.js code using static analysis (Semgrep + ESLint-security), applies a
policy-based acceptance gate, and logs the full session as a structured provenance record.

It also supports policy rule enforcement (custom rules beyond SAST), explicit human review
for WARN outcomes, and optional integration output for approved artifacts.

The framework replaces the direct prompt-to-LLM-to-clipboard workflow with a governed,
auditable, security-integrated pipeline specifically designed for Node.js microservice development.

---

## Architecture overview

```
Developer
   │
   ▼
[Prompt Interceptor]
   │
   ▼
[Risk Classifier]     ──────────────────────────────┐
   │                                                 │
   ▼ (security-sensitive)     (non-sensitive) ───────┤
[Prompt Enricher]                                    │
   │                                                 │
   ▼                                                 │
[LLM Connector] ◄────────────────────────────────────┘
   │ (generated code)
   ▼
[Validation Engine]  (Semgrep + ESLint-security)
   │ (findings)
   ▼
[Policy Engine]  ──► REGENERATE ──► Corrective enrichment ──► [LLM Connector]
   │              │
   │              └──► WARN  ──► developer review required
   │
   └──────────────────► ACCEPT ──► repository / CI / integration output
   │
   ▼
[Provenance Logger]  →  logs/provenance.jsonl + logs/metrics.jsonl
```

---

## Project structure

```
vibeguard/
├── src/
│   ├── cli/          cli.js              — command-line interface
│   ├── classifier/   riskClassifier.js   — prompt risk classification
│   ├── enricher/     promptEnricher.js   — security-aware prompt enrichment
│   ├── interceptor/  promptInterceptor.js — prompt capture and normalization
│   ├── integration/  repoIntegration.js  — approved artifact integration output
│   ├── llm/          llmConnector.js     — OpenAI / Anthropic client
│   ├── validator/    validationEngine.js — Semgrep + ESLint static analysis
│   ├── policy/       policyEngine.js     — accept / regenerate / warn logic
│   ├── policy/       policyStore.js      — static policy rule evaluation
│   ├── logger/       provenanceLogger.js — session and metrics persistence
│   ├── orchestrator/ orchestrator.js     — end-to-end session coordinator
│   ├── orchestrator/ sessionManager.js   — session lifecycle helper
│   └── experiment/   runner.js           — automated experiment execution
├── config/
│   ├── default.js        — environment-based configuration
│   └── securityRules.js  — risk patterns and enrichment templates
│   └── policyRules.json   — custom policy rules (regex-based)
├── tasks/                — experimental task prompts (T1–T5)
├── tests/                — Jest unit tests
├── logs/                 — provenance.jsonl, metrics.jsonl (git-ignored)
├── .env.example          — environment variable template
├── .github/workflows/    — GitHub Actions CI pipeline
└── package.json
```

---

## Setup

### Prerequisites

- Node.js 18 or 20
- npm
- Semgrep CLI (`pip install semgrep`)
- OpenAI API key OR Anthropic API key

### Install

```bash
git clone <repo-url>
cd vibeguard
npm install
cp .env.example .env
# Edit .env and add your API key
```

### Configure

```bash
# .env — minimum required
VG_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

To use a local Ollama endpoint:

```bash
VG_LLM_PROVIDER=ollama
VG_OLLAMA_URL=http://localhost:11434
VG_OLLAMA_MODEL=llama3.1:8b
```

Before running, pull the model and verify the endpoint:

```bash
ollama pull llama3.1:8b
curl http://localhost:11434/api/tags
```

Optional environment variables:

```bash
# Validation and policy
VG_SEMGREP_ENABLED=true
VG_ESLINT_ENABLED=true
VG_SEMGREP_RULES=p/security-audit,p/javascript,p/owasp-top-ten
VG_POLICY_RULES=./config/policyRules.json

# Integration output (approved artifacts)
VG_INTEGRATION_ENABLED=false
VG_INTEGRATION_DIR=./integrations/approved

# Experiment test execution
VG_RUN_TESTS=false
VG_TEST_COMMAND="npm test -- --json --outputFile"
VG_EXPERIMENT_REPETITIONS=1
```

---

## Usage

### Single secure session

```bash
node src/cli/cli.js generate \
  --prompt "Create a JWT authentication endpoint for Node.js Express" \
  --task-id T1 \
  --mode vibeguard \
  --output ./output/auth.js
```

Record development time and test results for the session:

```bash
node src/cli/cli.js generate \
   --prompt "Create a JWT authentication endpoint for Node.js Express" \
   --task-id T1 \
   --mode vibeguard \
   --dev-time-ms 180000 \
   --test-passed 8 \
   --test-failed 2 \
   --test-duration-ms 1200 \
   --test-failure
```

WARN outcomes require explicit human approval in the CLI before output is shown or saved.

### Run all five experimental tasks

```bash
node src/experiment/runner.js
```

Run a formal Chapter 5 batch with three repetitions per task and a stable run ID:

```bash
node src/experiment/runner.js --repetitions 3 --run-id ch5-formal-run-01
```

Run with tests enabled and custom test command:

```bash
node src/experiment/runner.js --run-tests --test-command "npm test -- --json --outputFile"
```

Each experiment invocation writes a clean run folder under `logs/runs/<run-id>/` containing
`provenance.jsonl`, `metrics.jsonl`, `environment.json`, `summary.json`, `summary.csv`,
`task_deltas.csv`, and optional raw test output under `test-results/`.

Reminder: ensure your LLM API key is set in `.env` before running experiments. Baseline mode
is reserved for the experiment runner; the CLI `generate` command always runs the VibeGuard path.

### View metrics summary

```bash
node src/cli/cli.js report
```

### Run unit tests

```bash
npm test
```

---

## Experimental tasks (T1–T5)

| ID | Scenario                   | Security focus          |
|----|----------------------------|-------------------------|
| T1 | Authentication service     | Auth, JWT, bcrypt       |
| T2 | CRUD Customer API          | SQL injection, input    |
| T3 | Validation middleware      | Input sanitization      |
| T4 | Secure file upload         | Path traversal, MIME    |
| T5 | Message queue producer     | PII logging, amqplib    |

Each task is run in both `baseline` and `vibeguard` mode by the experiment runner. Results are written
to a run-specific folder under `logs/runs/` for quantitative analysis.

---

## Output metrics

Each session produces:

- `vulnerabilityDensity` — security findings per 1000 LOC
- `criticalFindings` — ERROR-level findings count
- `warningFindings` — WARNING-level findings count
- `policyFindings` — custom policy-rule findings count
- `validationToolErrors` — validation tools that failed to run or parse
- `responseNormalized` — whether model output needed fence/prose cleanup
- `durationMs` — total session duration
- `developmentTimeMs` — optional development time (if provided)
- `regenerationCount` — how many retries were needed
- `approved` — whether the output passed the policy gate
- `testPassRate` — derived from test results when enabled

When experiment tests are enabled, raw test output JSON is stored under:

```
logs/runs/<run-id>/test-results/
```

---

## Policy rules (tuning)

Formal evaluation policy rules live in `config/policyRules.json` and are evaluated in addition to
Semgrep and ESLint-security. Each rule is a regex with a severity (ERROR → regenerate,
WARNING → review).

Demo-only rules live in `config/policyRules.demo.json` and are opt-in. For a defense demo that needs
forced WARN/REGENERATE behavior, load both files:

```bash
set VG_POLICY_RULES=./config/policyRules.json,./config/policyRules.demo.json
```

Do not use the demo profile for formal Chapter 5 evaluation runs.

To tune:

- Add or remove rules under `rules`.
- Adjust severity to `ERROR` or `WARNING`.
- Point to a different rule file, or comma-separated rule files, with `VG_POLICY_RULES`.

Keep rules focused on clear, enforceable constraints (e.g., disallow hardcoded secrets, insecure
hashes, or shell execution APIs).

---

## Troubleshooting

### Semgrep not found

If Semgrep is not installed or not on PATH, disable it or install it:

```bash
# Disable Semgrep
set VG_SEMGREP_ENABLED=false

# Or install (requires Python)
pip install semgrep
```

### Jest not found

If `npm test` fails with "jest is not recognized", install dependencies:

```bash
npm install
```

### Windows notes

- The validation temp directory uses the OS temp folder by default. Override with:

```bash
set VG_TEMP_DIR=C:\temp\vibeguard_scan
```

- If Semgrep is installed but not found, ensure the Python Scripts folder is on PATH, or run:

```bash
py -m semgrep --version
```

---

## Scope and limitations

- Prototype level; not production-ready
- Static analysis only (Semgrep + ESLint-security)
- Node.js JavaScript only
- Findings bounded by tool false-positive / false-negative rates
- Tested with GPT-4o and Claude 3.5 Sonnet (model versions as of 2025)
