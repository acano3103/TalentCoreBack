import { Test, TestingModule } from '@nestjs/testing';
import { InternalMovementsController } from './internal-movements.controller';
import { InternalMovementsService } from './internal-movements.service';

describe('InternalMovementsController', () => {
  let controller: InternalMovementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalMovementsController],
      providers: [InternalMovementsService],
    }).compile();

    controller = module.get<InternalMovementsController>(InternalMovementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
