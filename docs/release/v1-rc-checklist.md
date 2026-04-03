# V1 RC Checklist

Use this checklist before calling the repository release-candidate ready.

## Verification Record

- Last verified: 2026-04-02
- Automated gate: PASS
- Dirty-data drill: PASS
- Memory workspace share drill: PASS
- Preservation drill: PASS
- Engineering convergence regression: PASS

## Automated Gate

- Command: `npm run verify:release`
- Pass criteria:
  - lint exits with code `0`
  - typecheck exits with code `0`
  - unit tests exit with code `0`
  - release smoke suite exits with code `0`
  - packaging smoke check exits with code `0`

## Engineering Convergence Regression

- Commands:
  - `npm run test:typecheck`
  - `npm run test:unit -- tests/unit/repo/engineeringConvergenceStructure.test.ts tests/unit/main/bootstrap/registerIpc.test.ts tests/unit/main/workspaceReviewModuleBoundaries.test.ts tests/unit/shared/schemaModuleBoundaries.test.ts tests/unit/preload/index.test.ts tests/unit/renderer/archiveApi.test.ts`
  - `npm run test:e2e -- tests/e2e/import-batch.spec.ts tests/e2e/memory-workspace-flow.spec.ts tests/e2e/review-workbench-single-item-flow.spec.ts tests/e2e/objective-workbench-operator-confirmation-flow.spec.ts`
- Pass criteria:
  - `AppShell`, preload modules, and bootstrap registration stay as the active structure
  - no deleted `src/main/ipc/*` or `src/shared/ipcSchemas.ts` surfaces reappear
  - review, workspace, and objective flows continue to work through the current module boundaries

## Packaging Smoke Check

- Command: `npm run pack`
- Pass criteria:
  - unpacked desktop artifact is emitted into `release/`
  - generated app still points at `out/main/index.js`
  - no builder validation errors are reported

## Formal macOS Release Inputs

- Check command: `npm run release:doctor`
- Strict release command: `npm run dist:release`
- Signing credentials available:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - optional `CSC_NAME` if signing from a local keychain identity
- Notarization credentials available:
  - either `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Pass criteria:
  - hardened runtime remains enabled in `electron-builder.yml`
  - entitlements files are present under `build/`
  - `npm run release:doctor` reports both signing and notarization as ready
  - release `dist` runs with a real Developer ID signature instead of ad-hoc fallback
  - notarization is attempted in credentialed environments and does not report a missing-options skip

## Preservation Drill

- Command: `npm run test:e2e -- tests/e2e/preservation-export-restore-flow.spec.ts`
- Pass criteria:
  - export completes without crashing
  - restore into an empty target succeeds
  - integrity or drill checks report a successful result

## Dirty-Data Drill

- Command: `npm run test:e2e -- tests/e2e/import-batch-dirty-data.spec.ts`
- Pass criteria:
  - the mixed batch imports without aborting the full run
  - successful files remain visible in batch detail
  - duplicate and skipped files remain inspectable

## Memory Workspace Share Drill

- Command: `npm run test:e2e -- tests/e2e/memory-workspace-approved-draft-hosted-share-link-flow.spec.ts`
- Pass criteria:
  - hosted share create works from a published draft
  - hosted share revoke works from the same workspace flow
  - replay stays read-only while existing share access remains inspectable

## Manual Large-Batch Responsiveness Drill

- Steps:
  - import a representative large batch
  - open recent batches and batch detail
  - navigate between import, search, and review surfaces
- Pass criteria:
  - import completes without renderer hangs or crashes
  - recent batches and batch detail remain responsive
  - duplicate or skipped states remain visible when present
- Notes to record:
  - approximate file count
  - whether any noticeable stalls exceeded a few seconds

## Manual Export / Restore Sanity Drill

- Steps:
  - create a fresh export from a non-empty archive
  - restore into a new empty target directory
  - spot-check imported files, people, and memory workspace flows
- Pass criteria:
  - export completes without fatal errors
  - restore target is empty before recovery starts
  - restored archive opens and core flows still work
- Notes to record:
  - export source path
  - restore target path
  - any mismatches or follow-up actions
