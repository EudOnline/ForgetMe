import path from 'node:path'
import type { AppPaths } from '../../../services/appPaths'
import {
  listAgentMemories,
  listAgentPolicyVersions
} from '../../../services/governancePersistenceService'
import {
  createObjectiveRuntimeService,
  type ObjectiveRuntimeDependencies
} from '../../../services/objectiveRuntimeService'
import { createFacilitatorAgentService } from '../../../services/agents/facilitatorAgentService'
import { createRoleAgentRegistryService } from '../../../services/agents/roleAgentRegistryService'
import { createExternalVerificationBrokerService } from '../../../services/externalVerificationBrokerService'
import { createExternalWebSearchService } from '../../../services/externalWebSearchService'
import { createSubagentRegistryService } from '../../../services/subagentRegistryService'
import { openDatabase, runMigrations } from '../../../services/db'
import type {
  ConfirmAgentProposalInput,
  CreateAgentObjectiveInput,
  GetAgentObjectiveInput,
  GetAgentThreadInput,
  ListAgentObjectivesInput,
  RespondToAgentProposalInput
} from '../../../../shared/objectiveRuntimeContracts'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function openArchiveDatabase(appPaths: AppPaths) {
  const db = openDatabase(databasePath(appPaths))
  runMigrations(db)

  return db
}

function createObjectiveRuntimeDefaults(): Omit<ObjectiveRuntimeDependencies, 'db'> {
  const externalWebSearch = createExternalWebSearchService()
  return {
    facilitator: createFacilitatorAgentService(),
    externalVerificationBroker: createExternalVerificationBrokerService({
      searchWeb: externalWebSearch.searchWeb,
      openSourcePage: externalWebSearch.openSourcePage
    }),
    subagentRegistry: createSubagentRegistryService(),
    roleAgentRegistry: createRoleAgentRegistryService()
  }
}

function createObjectiveRuntimeSession(
  appPaths: AppPaths,
  overrides: Partial<Omit<ObjectiveRuntimeDependencies, 'db'>> = {}
) {
  const db = openArchiveDatabase(appPaths)
  const runtime = createObjectiveRuntimeService({
    db,
    ...createObjectiveRuntimeDefaults(),
    ...overrides
  })
  return {
    db,
    runtime
  }
}

export function createObjectiveModule(appPaths: AppPaths) {
  return {
    createRuntimeSession(
      overrides: Partial<Omit<ObjectiveRuntimeDependencies, 'db'>> = {}
    ) {
      const { db, runtime } = createObjectiveRuntimeSession(appPaths, overrides)

      return {
        db,
        runtime,
        close() {
          db.close()
        }
      }
    },
    async withArchiveDatabase<T>(
      work: (db: ReturnType<typeof openArchiveDatabase>) => Promise<T> | T
    ) {
      const db = openArchiveDatabase(appPaths)

      try {
        return await work(db)
      } finally {
        db.close()
      }
    },
    async withArchiveObjectiveRuntime<T>(
      work: (runtime: ReturnType<typeof createObjectiveRuntimeService>) => Promise<T> | T,
      overrides: Partial<Omit<ObjectiveRuntimeDependencies, 'db'>> = {}
    ) {
      const { db, runtime } = createObjectiveRuntimeSession(appPaths, overrides)

      try {
        return await work(runtime)
      } finally {
        db.close()
      }
    },
    async createObjective(input: CreateAgentObjectiveInput) {
      return this.withArchiveObjectiveRuntime(async (runtime) => {
        const started = await runtime.startObjective({
          title: input.title,
          objectiveKind: input.objectiveKind,
          prompt: input.prompt,
          initiatedBy: input.initiatedBy
        })
        const detail = runtime.getObjectiveDetail({
          objectiveId: started.objective.objectiveId
        })
        if (!detail) {
          throw new Error(`objective not found after creation: ${started.objective.objectiveId}`)
        }

        return detail
      })
    },
    async refreshObjectiveTriggers() {
      return this.withArchiveObjectiveRuntime((runtime) => runtime.refreshObjectiveTriggers())
    },
    async listObjectives(input: ListAgentObjectivesInput) {
      return this.withArchiveObjectiveRuntime((runtime) => runtime.listObjectives(input))
    },
    async getObjectiveDetail(input: GetAgentObjectiveInput) {
      return this.withArchiveObjectiveRuntime((runtime) => runtime.getObjectiveDetail(input))
    },
    async getThreadDetail(input: GetAgentThreadInput) {
      return this.withArchiveObjectiveRuntime((runtime) => runtime.getThreadDetail(input))
    },
    async respondToAgentProposal(input: RespondToAgentProposalInput) {
      return this.withArchiveObjectiveRuntime((runtime) => runtime.respondToAgentProposal(input))
    },
    async confirmAgentProposal(input: ConfirmAgentProposalInput) {
      return this.withArchiveObjectiveRuntime((runtime) => runtime.confirmAgentProposal(input))
    },
    async listMemories(input: Parameters<typeof listAgentMemories>[1]) {
      return this.withArchiveDatabase((db) => listAgentMemories(db, input))
    },
    async listPolicyVersions(input: Parameters<typeof listAgentPolicyVersions>[1]) {
      return this.withArchiveDatabase((db) => listAgentPolicyVersions(db, input))
    }
  }
}
