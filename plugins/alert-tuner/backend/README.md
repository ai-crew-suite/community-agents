# Alert Fatigue Tuner (Backend)

AI Core backend module that reduces alert fatigue. It reads a bounded window of
alert firing history, statistically isolates alert definitions that fire
repeatedly and clear themselves without human action, correlates each candidate
against real incidents to rule out genuine signal, locates the threshold
expression in the owning Infrastructure-as-Code file, and computes a **capped**
threshold/duration patch published as a reviewable proposal artifact.

- Workflow ID: `alert-tuning`
- Agent ID: `alert-ai-tuner`
- Artifact kind: `alert-tuning-proposal`

## Deterministic by construction

Every decision that could affect infrastructure is arithmetic, not inference:

- `workflow/noise.ts` computes the verdict from percentiles, not means, so a
  single long outage cannot mask a run of short self-clears. A high paged share
  is a hard brake — an alert that pages a human is human-actioned by definition.
- `workflow/correlate.ts` flips the verdict to `real_signal` whenever a firing
  overlaps a real incident, which removes the patch path entirely.
- `workflow/patch.ts` derives capped values (`maxThresholdIncreasePct`,
  `maxDurationMultiplier`, and a floor above any observed metric peak) and emits
  a unified diff anchored to the located assignment lines. A diff that would
  touch an unmatched or drifted line is rejected rather than emitted.
- The model is only ever asked for prose. No code path lets model output reach
  the diff, the verdict, or any numeric value.

## Workflow

1. **observe** — validate the request, read `incident.alert.history` over the
   clamped window, normalize entries into `fire-N` firing samples. Below
   `noise.minSamples` the run terminates as `insufficient_evidence` with no
   repository read and no model call.
2. **analyze** — compute the `NoiseScore` (auto-resolve ratio, median and p90
   self-clear, paged ratio) and the fixed verdict.
3. **correlate** — suppress false candidates using `incident.incident.list`,
   recording the suppressing `inc-N` evidence IDs.
4. **locate** — resolve the IaC file through `vcs.repository.get_metadata`,
   `vcs.repository.search`, and `vcs.repository.read_file`, then extract the
   `ThresholdAnchor`. Zero or multiple matches are terminal `anchor_not_found`.
5. **patch** — derive capped changes, optionally floored by
   `observability.metrics.query` headroom, and emit the validated anchored diff
   inside an `alert-tuning-proposal` artifact.

Outcomes are first-class, explained states rather than errors: `noisy`,
`partial`, `not_noisy`, `insufficient_evidence`, and `anchor_not_found`.

## Weekly sweep

`sweep.enabled` (default **false**) registers one global scheduler task that
dispatches authenticated propose-only runs to `/agents/alert-ai-tuner/runs`. It
is bounded by `maxSweepAlerts`, guarded by an in-flight mutex, and respects a
per-target `cooldownDays`. Sweep requests always carry `publish: false`: a
machine identity holds no approval authority, so an autonomous pull request is
impossible by design.

## Current limitations

This milestone is **read-only, propose-only, and advisory**. Three shared
contracts named in the implementation plan do not exist yet and were not
fabricated:

- `vcs.pull_request.create` (`effect: 'write'`) — no write-capable VCS tool
  exists, so `vcs.branch.create`/`vcs.pull_request.create` are absent from the
  agent allow-list and the workflow terminates at the proposal artifact. Setting
  `publish.enabled: true` records a limitation on the proposal rather than
  faking an approval gate or attempting a repository mutation.
- `kubernetes.workload.get_timeline` deploy correlation — gated on shared
  Kubernetes diagnostics; its absence is recorded as a limitation and caps
  `confidence` at `low`.
- `CatalogEntityResolver` — until it lands, an explicit `repoUrl` is required;
  annotation-based repository resolution reports `anchor_not_found`.

## Configuration

```yaml
ai:
  agents:
    alertAiTuner:
      model: alert-tuner
```

See `config.d.ts` for every optional field and its default.

## 🐳 Production Deployment & Docker Guardrails

This plugin utilizes **`web-tree-sitter`**, a pure WebAssembly (WASM) parser execution runtime, to parse HCL files securely without requiring native C/C++ host compilers. By default the plugin dynamically resolves the pre-compiled `.wasm` binaries directly from the filesystem inside `node_modules` at runtime.

### Aggressive `node_modules` Pruning in Dockerfiles

If your organization utilizes a highly strict CI/CD Docker pipeline that aggressively strips, deletes, or flattens `node_modules` during the deployment phase (e.g., standardizing on an `esbuild` monobundle and wiping the surrounding folders), the initialization will throw a runtime file exception because the `.wasm` asset was discarded.

#### How to Remediate:

If your deployment pipeline drops or cleans up the package asset tree, implement one of these two fixes:

1. **Docker Layer Intervention:** Update your production `Dockerfile` to manually pull the required `.wasm` binary into the final deployment layer right after your production dependency install step:

```dockerfile
COPY --from=build-stage /app/node_modules/@tree-sitter-grammars/tree-sitter-hcl/tree-sitter-hcl.wasm /app/node_modules/@tree-sitter-grammars/tree-sitter-hcl/tree-sitter-hcl.wasm
```

2. **Local Asset Mirroring:** If your environment completely blocks referencing files inside `node_modules` post-build, copy the `tree-sitter-hcl.wasm` file out of the package once, store it in your plugin's internal static `assets/` or `dist/` directory, commit it to your repository, and adjust the runtime filepath path resolution to point locally.
