export enum AccountType {
    CASH = 'CASH',
    CREDIT = 'CREDIT',
    LOAN = 'LOAN',
    TRACKING = 'TRACKING'
}


export class Account {
    id: string;
    userId: string | null;
    name: string;
    accountType: AccountType;
    clearedBalance: number;
    unclearedBalance: number;
    workingBalance: number;
    displayOrder: number;
    interestRate: number | null;
    minimumMonthlyPayment: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
