# Scaffolder AI Shadow Detective (Frontend)

Backstage UI for the report-only shadow resource reconciliation milestone.

- Starts and replays bounded cloud-to-catalog scans.
- Displays orphan inventory, catalog-resolved owner evidence, and human-click claim links.
- Explicitly distinguishes unknown ownership from verified owner-tag evidence.

The current backend does not support scheduled scans, cursors, dedupe, approval, or
outreach. This UI deliberately contains no controls for those unavailable actions.
