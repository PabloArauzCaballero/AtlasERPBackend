import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import type { Response } from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HealthController } from '../src/modules/health/health.controller';
import { HealthService } from '../src/modules/health/health.service';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            health: jest
              .fn()
              .mockReturnValue({ status: 'ok', service: 'atlas-integrated-backend' }),
            ready: jest.fn().mockResolvedValue({ status: 'ready', database: 'ok' }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health devuelve estado operativo normalizado', async () => {
    if (!app) {
      throw new Error('Aplicación Nest no inicializada.');
    }

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response: Response) => {
        expect(response.body).toEqual({
          success: true,
          data: {
            status: 'ok',
            service: 'atlas-integrated-backend',
          },
        });
      });
  });

  it('GET /api/v1/ready valida dependencia de base de datos', async () => {
    if (!app) {
      throw new Error('Aplicación Nest no inicializada.');
    }

    await request(app.getHttpServer())
      .get('/api/v1/ready')
      .expect(200)
      .expect((response: Response) => {
        expect(response.body).toEqual({
          success: true,
          data: {
            status: 'ready',
            database: 'ok',
          },
        });
      });
  });
});
