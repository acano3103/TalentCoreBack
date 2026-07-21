import { Test, TestingModule } from '@nestjs/testing';
import { InternalMovementsService } from './internal-movements.service';

describe('InternalMovementsService', () => {
  let service: InternalMovementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InternalMovementsService],
    }).compile();

    service = module.get<InternalMovementsService>(InternalMovementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
