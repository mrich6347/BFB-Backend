import { AccountResponse } from "../../accounts/dto/create-account.dto";
import { BudgetResponse } from "../../budgets/DTO/budget.dto";
export class MainDataResponse {
    budget: BudgetResponse;
    accounts: AccountResponse[];
}