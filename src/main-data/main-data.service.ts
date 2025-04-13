import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { MainDataResponse } from './DTO/mainData.dto';
import { AccountsService } from '../accounts/accounts.service';
@Injectable()
export class MainDataService {
    constructor(private readonly budgetsService: BudgetsService, private readonly accountsService: AccountsService) {}

    async getMainData(budgetId: string, authToken: string, userId: string): Promise<MainDataResponse> {
        const budget = await this.budgetsService.findOne(budgetId, userId, authToken);
        const accounts = await this.accountsService.findAll(userId, authToken);
        return {
           budget,
           accounts
        }
    }
}
