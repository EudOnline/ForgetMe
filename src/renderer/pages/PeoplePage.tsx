import { useEffect, useMemo, useState } from 'react'
import type { CanonicalPersonSummary } from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'
import { PersonList } from '../components/PersonList'

export function PeoplePage(props: { onSelectPerson?: (canonicalPersonId: string) => void }) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [people, setPeople] = useState<CanonicalPersonSummary[]>([])

  useEffect(() => {
    void archiveApi.listCanonicalPeople().then(setPeople)
  }, [archiveApi])

  return (
    <section>
      <h1>{t('people.title')}</h1>
      <PersonList people={people} onSelect={props.onSelectPerson} />
    </section>
  )
}
