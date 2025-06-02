import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { AccountsService } from '../accounts/accounts.service';
import { CategoryGroupsService } from '../category-groups/category-groups.service';
import { CategoriesService } from '../categories/categories.service';
import { CategoryBalancesService } from '../category-balances/category-balances.service';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class MainDataService {
    constructor(
        private readonly budgetsService: BudgetsService,
        private readonly accountsService: AccountsService,
        private readonly categoryGroupsService: CategoryGroupsService,
        private readonly categoriesService: CategoriesService,
        private readonly categoryBalancesService: CategoryBalancesService,
        private readonly readyToAssignService: ReadyToAssignService,
        private readonly transactionsService: TransactionsService
    ) {}

    async getMainData(budgetId: string, authToken: string, userId: string, year?: number, month?: number): Promise<MainDataResponse> {
        const [budget, accounts, categoryGroups, categories, categoryBalances, transactions, readyToAssign] = await Promise.all([
            this.budgetsService.findOne(budgetId, userId, authToken),
            this.accountsService.findAll(userId, authToken, budgetId),
            this.categoryGroupsService.findAll(budgetId, userId, authToken),
            this.categoriesService.findAllByBudgetWithoutBalances(budgetId, userId, authToken),
            this.categoryBalancesService.findAllByBudget(budgetId, userId, authToken),
            this.transactionsService.findAllByBudget(budgetId, userId, authToken),
            this.readyToAssignService.calculateReadyToAssign(budgetId, userId, authToken)
        ]);

        console.log('Transactions found:', transactions?.length || 0);

        return {
           budget,
           accounts,
           categoryGroups,
           categories,
           categoryBalances,
           transactions,
           readyToAssign
        }
    }
}
