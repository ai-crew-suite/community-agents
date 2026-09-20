# Cloud Providers Notes

Missing providers to consider adding:

## VMware vSphere / VMware Cloud (`vmware`)

Many enterprise organizations run split-architecture hybrids. They place heavy transactional workloads, databases, or legacy backend software inside **on-premises private data centers** powered by VMware infrastructure.

- **Agentic Use Case**: Downstream plugins like `scaffolder-ai-drift-detector` can poll your driver to scan ESXi host cluster allocations, check storage datastores, or inspect virtual machine resource limits to track hybrid topologies.
- **Implementation Strategy**: Consume the official **`@vmware/vsphere-automation-sdk`** npm package, or write a lightweight client mapping to the vCenter REST API endpoints.

## Multi-Cloud Database & AI Data Warehousing

### Snowflake (`snowflake`)

Enterprise data architectures are rarely contained within a single cloud provider's boundary. Clients frequently aggregate raw transactional metrics, user identities, and cost monitoring data inside **Snowflake Data Clouds**.

- **Agentic Use Case**: Your `scaffolder-ai-shadow-detective` plugin can poll Snowflake query history, storage volumes, and compute warehouse scaling metadata to calculate analytics costs or identify unoptimized AI models.
- **Implementation Strategy**: Integrate using the native **`snowflake-sdk`** package to cleanly execute telemetry queries against billing and information schemas.

## Alternative Hyperscalers & Developer Platforms

### Oracle Cloud Infrastructure (`oci`)

Enterprises often turn to Oracle Cloud Infrastructure (OCI) to host large enterprise resource planning (ERP) systems, specialized database clusters, or high-performance computing (HPC) environments.

- **Agentic Use Case**: The driver exposes OCI compartment structures and Compute/Autonomous Database resources to allow `catalog-ai-insights` or `oncall-ai-handover-assistant` to inspect deployment topologies during service incidents.
- **Implementation Strategy**: Leverage the official **`oci-sdk`** client library bundles to inherit OCI API key identities or instance principal authentication properties natively from the environment.
