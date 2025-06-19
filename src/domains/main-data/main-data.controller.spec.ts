import { Test, TestingModule } from '@nestjs/testing';
import { MainDataController } from './main-data.controller';
import { MainDataService } from './main-data.service';

describe('MainDataController', () => {
  let controller: MainDataController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MainDataController],
      providers: [MainDataService],
    }).compile();

    controller = module.get<MainDataController>(MainDataController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
