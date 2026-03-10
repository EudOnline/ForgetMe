# ForgetMe

ForgetMe is a desktop-first private archive vault for preserving chat logs, images, and documents as traceable personal evidence.

## MVP Scope

- Import chat, image, and document files in batches
- Freeze originals into a local content-addressed vault
- Record batch metadata, duplicate classification, parsed summaries, people anchors, relations, and audit logs in SQLite
- Search by keyword and file kind
- Perform logical delete with audit logging
- Generate person merge candidates into a review queue
- Approve, reject, and undo review decisions with journal history
- Browse approved canonical people, person timelines, and relationship graphs

## Local Setup

```bash
npm install
npm run dev
```

## Test Commands

```bash
npm run test:unit
npm run test:e2e -- tests/e2e/import-batch.spec.ts
npm run test:e2e -- tests/e2e/person-review-flow.spec.ts
npm run build
```

## App Data Directory

- Development default: `.local-dev/forgetme`
- End-to-end test override: `FORGETME_E2E_USER_DATA_DIR`
- Production default: Electron `userData`

## Supported Import Formats

- Chat: `.json`, `.txt`
- Images: `.jpg`, `.jpeg`, `.png`, `.heic`
- Documents: `.pdf`, `.docx`, `.txt`

## Deletion Semantics

The MVP only implements logical delete:

- batch and file metadata are marked deleted in SQLite
- originals on disk remain untouched
- an audit entry is written with action `delete.logical`

## Phase Two Review Model

- Candidate understanding never mutates the formal person view directly
- Pending merge and event-cluster candidates land in the review queue first
- Approved formal views only read approved canonical people, approved event clusters, and approved graph edges
- Every approve / reject / undo action writes a journal entry
- Approved merge decisions remain undoable and restore prior memberships
- Manual relationship labels are stored as approved graph annotations
