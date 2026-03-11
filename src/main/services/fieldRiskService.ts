const HIGH_RISK_FIELD_KEYS = new Set([
  'full_name',
  'national_id_number',
  'address',
  'birth_date',
  'license_number',
  'vehicle_class',
  'valid_until',
  'school_name',
  'student_name',
  'major_name',
  'score_value',
  'gpa_value',
  'participant_fragment',
  'phone_number',
  'license_plate'
])

export function classifyFieldRisk(input: { fieldKey: string }) {
  return HIGH_RISK_FIELD_KEYS.has(input.fieldKey) ? 'high' as const : 'low' as const
}
