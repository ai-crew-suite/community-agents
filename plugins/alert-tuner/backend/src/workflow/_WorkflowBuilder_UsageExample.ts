import { createAgentWorkflow } from './WorkflowBuilder';
import { z } from 'zod';

const AppState = z.object({
  clusterId: z.string().default(''),
  patchDiff: z.string().optional(),
  retryCount: z.number().default(0),
});

const AppInput = z.object({
  serviceRef: z.string(),
});

export const deployOrchestration = createAgentWorkflow({
  id: 'enterprise-deploy-workflow',
  stateSchema: AppState,
  inputSchema: AppInput,
})
  .useHelpers({
    calculateDiffMetrics: (ctx, diff: string) => diff.length * 2,
  })
  .addStep('analyzeInfrastructure', async (state, ctx) => {
    // 100% Type-Safe Autocomplete here!
    ctx.logger.info(`Scanning component target: ${ctx.input.serviceRef}`);

    // Deeply frozen access preventing side-effects. This fails compilation: state.retryCount = 5;
    const diffLength = ctx.helpers.calculateDiffMetrics(state.patchDiff ?? '');

    return { clusterId: 'us-east-1-prod' }; // Must match partial z.infer<typeof AppState>
  })
  .addChoice('evaluateRisk', (state) => {
    return state.retryCount > 3 ? 'abortDeployment' : 'executeScaffolder';
  })
  .setTerminalOutcome('abortDeployment', (state, ctx) => {
    ctx.logger.error('Deployment aborted via programmatic policy rule constraint.');
  });
