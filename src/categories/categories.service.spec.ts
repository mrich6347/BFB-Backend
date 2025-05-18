import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let supabaseService: SupabaseService;

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
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
