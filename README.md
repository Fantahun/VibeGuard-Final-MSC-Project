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
   └──────────────────► ACCEPT ──► repository / CI
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
│   ├── llm/          llmConnector.js     — OpenAI / Anthropic client
│   ├── validator/    validationEngine.js — Semgrep + ESLint static analysis
│   ├── policy/       policyEngine.js     — accept / regenerate / warn logic
│   ├── logger/       provenanceLogger.js — session and metrics persistence
│   ├── orchestrator/ orchestrator.js     — end-to-end session coordinator
│   └── experiment/   runner.js           — automated experiment execution
├── config/
│   ├── default.js        — environment-based configuration
│   └── securityRules.js  — risk patterns and enrichment templates
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

### Run all five experimental tasks

```bash
node src/experiment/runner.js
```

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

Each task is run in both `baseline` and `vibeguard` mode. Results are written to
`logs/provenance.jsonl` and `logs/metrics.jsonl` for quantitative analysis.

---

## Output metrics

Each session produces:

- `vulnerabilityDensity` — security findings per 1000 LOC
- `criticalFindings` — ERROR-level findings count
- `warningFindings` — WARNING-level findings count
- `durationMs` — total session duration
- `regenerationCount` — how many retries were needed
- `approved` — whether the output passed the policy gate

---

## Scope and limitations

- Prototype level; not production-ready
- Static analysis only (Semgrep + ESLint-security)
- Node.js JavaScript only
- Findings bounded by tool false-positive / false-negative rates
- Tested with GPT-4o and Claude 3.5 Sonnet (model versions as of 2025)
