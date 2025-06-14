import { AccountResponse } from "../../accounts/DTO/account.dto";
import { BudgetResponse } from "../../budgets/DTO/budget.dto";
import { CategoryGroupResponse } from "../../category-groups/dto/category-group.dto";
import { CategoryResponse } from "../../categories/dto/category.dto";
import { CategoryBalanceResponse } from "../../category-balances/dto/category-balance.dto";
import { TransactionResponse } from "../../transactions/dto/transaction.dto";
import { AutoAssignConfigurationSummary } from "../../auto-assign/dto/auto-assign.dto";

export class MainDataResponse {
    budget: BudgetResponse;
    accounts: AccountResponse[];
    categoryGroups: CategoryGroupResponse[];
    categories: CategoryResponse[];
    categoryBalances: CategoryBalanceResponse[];
    transactions: TransactionResponse[];
    readyToAssign: number;
    autoAssignConfigurations: AutoAssignConfigurationSummary[];
}