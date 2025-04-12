import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';

@Injectable()
export class MainDataService {
    constructor(private readonly budgetsService: BudgetsService) {}

    async getMainData(budgetId: string, authToken: string): Promise<any> {
        const budget = await this.budgetsService.findOne(budgetId, authToken);
        return budget;
    }
}
