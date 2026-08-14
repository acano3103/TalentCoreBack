import { Test, TestingModule } from '@nestjs/testing';
import { InternalMovementsController } from './internal-movements.controller';
import { InternalMovementsService } from './internal-movements.service';

jest.mock('../../prisma/prisma.service', () => ({
  __esModule: true,
  PrismaService: jest.fn(),
}));

jest.mock('../notifications/notification.dispatcher', () => ({
  NotificationDispatcher: jest.fn(),
}));

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';

describe('InternalMovementsController', () => {
  let controller: InternalMovementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalMovementsController],
      providers: [
        InternalMovementsService,
        { provide: PrismaService, useValue: {} },
        { provide: NotificationDispatcher, useValue: { notify: jest.fn() } },
      ],
    }).compile();

    controller = module.get<InternalMovementsController>(
      InternalMovementsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
