# V1 RC Checklist

Use this checklist before calling the repository release-candidate ready.

## Verification Record

- Last verified: 2026-03-26
- Automated gate: PASS
- Dirty-data drill: PASS
- Memory workspace share drill: PASS
- Preservation drill: PASS

## Automated Gate

- Command: `npm run verify:release`
- Pass criteria:
  - typecheck exits with code `0`
  - unit tests exit with code `0`
  - release smoke suite exits with code `0`
  - production build exits with code `0`

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
