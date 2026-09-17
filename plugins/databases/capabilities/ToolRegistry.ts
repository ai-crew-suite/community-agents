/**
 * Copyright 2024 Larder Software Limited
 * Copyright 2026 The AI Crew Suite Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { LoggerService } from '@backstage/backend-plugin-api';
import { ConflictError } from '@backstage/errors';
import { Tool, ToolRegistry } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Enterprise-grade in-memory Tool Registry providing runtime immutability gates.
 * Aligns with SOC-2/FINRA isolation tracks by preventing post-boot modifications.
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private isFrozen = false;

  public constructor(private readonly logger: LoggerService) {}

  /**
   * Permanently locks the registration pool post-boot.
   * Invoked within the lifecycle init step before opening ports.
   */
  public freeze(): void {
    this.isFrozen = true;
    this.logger.info('Tool Registry has been frozen. Capability maps are locked.', {
      totalRegisteredTools: this.tools.size,
    });
  }

  /**
   * Registers a tool instance before the boot freeze phase.
   * Throws ConflictError if an extension attempts a double registration.
   */
  public register(tool: Tool): void {
    if (this.isFrozen) {
      throw new ConflictError(`Access Denied: Cannot register tool '${tool.id}'. The registry boundary is frozen.`);
    }
    if (this.tools.has(tool.id)) {
      throw new ConflictError(`Registration Failure: Tool capability identifier '${tool.id}' already exists.`);
    }

    this.tools.set(tool.id, tool);
    this.logger.debug('Tool capability successfully mapped to registry pool', { toolId: tool.id });
  }

  /**
   * Looks up a single tool by id.
   * Emits structured context parameters for auditable search tracking.
   */
  public get(id: string): Tool | undefined {
    const tool = this.tools.get(id);
    if (!tool) {
      this.logger.warn('Requested tool capability search returned empty', { targetToolId: id });
    }
    return tool;
  }

  /**
   * Returns all registered tools in insertion order.
   */
  public list(): Tool[] {
    return [...this.tools.values()];
  }
}
