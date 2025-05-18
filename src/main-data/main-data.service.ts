import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { AccountsService } from '../accounts/accounts.service';
import { CategoryGroupsService } from '../category-groups/category-groups.service';
import { CategoriesService } from '../categories/categories.service';

@Injectable()
export class MainDataService {
    constructor(
        private readonly budgetsService: BudgetsService,
        private readonly accountsService: AccountsService,
        private readonly categoryGroupsService: CategoryGroupsService,
        private readonly categoriesService: CategoriesService
    ) {}

    async getMainData(budgetId: string, authToken: string, userId: string): Promise<MainDataResponse> {
        const [budget, accounts, categoryGroups, categories] = await Promise.all([
            this.budgetsService.findOne(budgetId, userId, authToken),
            this.accountsService.findAll(userId, authToken, budgetId),
            this.categoryGroupsService.findAll(budgetId, userId, authToken),
            this.categoriesService.findAllByBudget(budgetId, userId, authToken)
        ]);

        return {
           budget,
           accounts,
           categoryGroups,
           categories
        }
    }
}
