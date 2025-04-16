import { AccountResponse } from "../../accounts/DTO/create-account.dto";
import { BudgetResponse } from "../../budgets/DTO/budget.dto";
export class MainDataResponse {
    budget: BudgetResponse;
    accounts: AccountResponse[];
}