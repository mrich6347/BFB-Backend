export class Category {
  id: string;

  name: string;

  category_group_id: string;

  budget_id: string;

  user_id: string;

  assigned: number;

  activity: number;

  available: number;

  display_order: number;

  is_credit_card_payment: boolean;

  linked_account_id: string | null;

  created_at: Date;

  updated_at: Date;
}
