import { Test, TestingModule } from '@nestjs/testing';
import { CategoryReadService } from './services/read/category-read.service';
import { CategoryWriteService } from './services/write/category-write.service';
import { CategoryMoneyMovementWriteService } from './services/write/category-money-movement-write.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';
import { CreditCardDebtService } from '../credit-card-debt/credit-card-debt.service';

describe('Category Services', () => {
  let categoryReadService: CategoryReadService;
  let categoryWriteService: CategoryWriteService;
  let categoryMoneyMovementWriteService: CategoryMoneyMovementWriteService;
  let supabaseService: SupabaseService;
  let readyToAssignService: ReadyToAssignService;
  let creditCardDebtService: CreditCardDebtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryReadService,
        CategoryWriteService,
        CategoryMoneyMovementWriteService,
        {
          provide: SupabaseService,
          useValue: {
            getAuthenticatedClient: jest.fn().mockReturnValue({
              from: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              insert: jest.fn().mockReturnThis(),
              update: jest.fn().mockReturnThis(),
              delete: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              order: jest.fn().mockReturnThis(),
              single: jest.fn().mockReturnValue({ data: {}, error: null }),
            }),
          },
        },
        {
          provide: ReadyToAssignService,
          useValue: {
            calculateReadyToAssign: jest.fn().mockResolvedValue(1000),
          },
        },
        {
          provide: CreditCardDebtService,
          useValue: {
            handleCreditCardLogicForAssignments: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    categoryReadService = module.get<CategoryReadService>(CategoryReadService);
    categoryWriteService = module.get<CategoryWriteService>(CategoryWriteService);
    categoryMoneyMovementWriteService = module.get<CategoryMoneyMovementWriteService>(CategoryMoneyMovementWriteService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    readyToAssignService = module.get<ReadyToAssignService>(ReadyToAssignService);
    creditCardDebtService = module.get<CreditCardDebtService>(CreditCardDebtService);
  });

  it('should be defined', () => {
    expect(categoryReadService).toBeDefined();
    expect(categoryWriteService).toBeDefined();
    expect(categoryMoneyMovementWriteService).toBeDefined();
  });
});
