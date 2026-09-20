# plugin-ai-core-backend-module-llm-aws — Aggregated Roadmap Items

No blocking items reported by the 18 agentic workflow plugins. The model/store contracts are consumed through AI Core extension points and satisfy the workflow plans (provider-neutral `ModelExecutor` resolution, runtime stores for runs/checkpoints/artifacts, vector stores behind the retrieval pipeline).

## Watch items (not blockers)

- Real-model evaluation suites are opt-in per workflow plugin (`AI_EVAL_MODEL_REF`); provider modules only need to keep model metadata/request IDs exposed where available so evaluation telemetry can record them.
