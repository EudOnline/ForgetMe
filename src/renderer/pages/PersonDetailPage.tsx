import { useEffect, useMemo, useState } from 'react'
import type { PersonDossier } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { PersonDossierView } from '../components/PersonDossierView'

export function PersonDetailPage(props: { canonicalPersonId: string | null; onOpenEvidenceFile?: (fileId: string) => void }) {
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [dossier, setDossier] = useState<PersonDossier | null>(null)

  useEffect(() => {
    if (!props.canonicalPersonId) {
      setDossier(null)
      return
    }

    void archiveApi.getPersonDossier(props.canonicalPersonId).then(setDossier)
  }, [archiveApi, props.canonicalPersonId])

  return <PersonDossierView dossier={dossier} onOpenEvidenceFile={props.onOpenEvidenceFile} />
}
