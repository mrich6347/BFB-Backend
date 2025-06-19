import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { ReadyToAssignService } from '../ready-to-assign/ready-to-assign.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let supabaseService: SupabaseService;
  let readyToAssignService: ReadyToAssignService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
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
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    readyToAssignService = module.get<ReadyToAssignService>(ReadyToAssignService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
