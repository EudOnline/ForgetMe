create view if not exists search_file_index as
select
  vf.id as file_id,
  vf.batch_id as batch_id,
  vf.file_name as file_name,
  vf.extension as extension,
  vf.duplicate_class as duplicate_class,
  vf.parser_status as parser_status,
  vf.deleted_at as deleted_at,
  fd.payload_json as payload_json
from vault_files vf
left join file_derivatives fd
  on fd.file_id = vf.id
  and fd.derivative_type = 'parsed_summary';
