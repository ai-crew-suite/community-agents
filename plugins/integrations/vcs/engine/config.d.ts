/*
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
export interface Config {
  /**
   * AI Crew Suite integration configuration.
   */
  ai?: {
    /**
     * Third-party integration modules.
     */
    integrations?: {
      /**
       * Version control system integration configuration.
       */
      vcs?: {
        /**
         * Selected VCS provider. Supported values: github, gitlab, bitbucket, azuredevops.
         */
        provider: 'github' | 'gitlab' | 'bitbucket' | 'azuredevops';
        /**
         * GitHub provider configuration.
         */
        github?: {
          /**
           * GitHub host. Defaults to `github.com`.
           */
          host?: string;
          /**
           * Optional API base URL override for GitHub Enterprise.
           */
          apiBaseUrl?: string;
        };
        /**
         * GitLab provider configuration.
         */
        gitlab?: {
          /**
           * GitLab host. Defaults to `gitlab.com`.
           */
          host?: string;
          /**
           * Optional API base URL override for self-hosted GitLab.
           */
          apiBaseUrl?: string;
        };
        /**
         * Bitbucket provider configuration.
         */
        bitbucket?: {
          /**
           * Bitbucket host. Defaults to `bitbucket.org`.
           */
          host?: string;
          /**
           * Optional API base URL override for Bitbucket Server.
           */
          apiBaseUrl?: string;
        };
        /**
         * Azure DevOps provider configuration.
         */
        azuredevops?: {
          /**
           * Azure DevOps organization URL, such as `https://dev.azure.com/my-org`.
           */
          host?: string;
          /**
           * Optional API base URL override.
           */
          apiBaseUrl?: string;
        };
      };
    };
  };
}