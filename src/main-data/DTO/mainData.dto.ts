import { AccountResponse } from "../../accounts/DTO/account.dto";
import { BudgetResponse } from "../../budgets/DTO/budget.dto";
import { CategoryGroupResponse } from "../../category-groups/dto/category-group.dto";
import { CategoryResponse } from "../../categories/dto/category.dto";

export class MainDataResponse {
    budget: BudgetResponse;
    accounts: AccountResponse[];
    categoryGroups: CategoryGroupResponse[];
    categories: CategoryResponse[];
}