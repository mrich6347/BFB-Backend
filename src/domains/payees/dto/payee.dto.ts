export class PayeeResponse {
  id: string;
  user_id: string;
  budget_id: string;
  name: string;
  normalized_name: string;
  last_category_id?: string | null;
  last_used_at?: string | null;
  is_transfer: boolean;
  created_at: string;
  updated_at: string;
}

export class UpsertPayeeDto {
  budget_id: string;
  name: string;
  last_category_id?: string | null;
  is_transfer?: boolean;
}

