import { Budget } from "../../budgets/entities/budget.entity";
import { Account } from "../../accounts/entities/account.entity";
export class MainDataResponse {
    budget: Budget;
    accounts: Account[];
}