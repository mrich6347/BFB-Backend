export enum AccountType {
    CASH = 'CASH',
    TRACKING = 'TRACKING'
}


export class Account {
    id: string;
    userId: string | null;
    budgetId: string | null;
    name: string;
    accountType: AccountType;
    accountBalance: number;
    clearedBalance: number;
    unclearedBalance: number;
    workingBalance: number;
    displayOrder: number;

    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
