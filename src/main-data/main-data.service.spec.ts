import { Test, TestingModule } from '@nestjs/testing';
import { MainDataService } from './main-data.service';

describe('MainDataService', () => {
  let service: MainDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MainDataService],
    }).compile();

    service = module.get<MainDataService>(MainDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
