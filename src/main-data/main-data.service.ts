import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { MainDataResponse } from '../budgets/dto/main-data/main-data.dto';

@Injectable()
export class MainDataService {
    constructor(private readonly budgetsService: BudgetsService) {}

    async getMainData(budgetId: string, authToken: string): Promise<MainDataResponse> {
        const budget = await this.budgetsService.findOne(budgetId, authToken);
        return {
           budget
        }
    }
}
