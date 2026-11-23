import { BadRequestException, ForbiddenException, RequestMethod, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { FiltroCursosQuery } from './dto/filtro-cursos.query';
import { MobileTrainingController } from './mobile-training.controller';

describe('MobileTrainingController', () => {
    it('agrupa los endpoints en Mobile Training y exige token móvil más empresa del tenant', () => {
        expect(Reflect.getMetadata('swagger/apiUseTags', MobileTrainingController)).toEqual(['Mobile Training']);
        expect(Reflect.getMetadata(PATH_METADATA, MobileTrainingController)).toBe('mobile/companies/:companyId/training/courses');
        expect(Reflect.getMetadata(GUARDS_METADATA, MobileTrainingController)).toEqual(
            expect.arrayContaining([MobileJwtAuthGuard, CompanyTenantGuard]),
        );

        const proto = MobileTrainingController.prototype;
        const rutas = ['listar', 'detalle', 'progreso', 'actividad', 'material', 'sesionScorm', 'commitScorm'].map((nombre) => ({
            nombre,
            path: Reflect.getMetadata(PATH_METADATA, proto[nombre]),
            method: Reflect.getMetadata(METHOD_METADATA, proto[nombre]),
        }));

        expect(rutas).toEqual([
            { nombre: 'listar', path: '/', method: RequestMethod.GET },
            { nombre: 'detalle', path: ':sessionId', method: RequestMethod.GET },
            { nombre: 'progreso', path: ':sessionId/lessons/:lessonId/progress', method: RequestMethod.POST },
            { nombre: 'actividad', path: ':sessionId/activity', method: RequestMethod.POST },
            { nombre: 'material', path: ':sessionId/materials/:archivo', method: RequestMethod.GET },
            { nombre: 'sesionScorm', path: ':sessionId/scorm/session', method: RequestMethod.POST },
            { nombre: 'commitScorm', path: ':sessionId/scorm/commit', method: RequestMethod.POST },
        ]);
    });

    it('un tenant ajeno recibe 403 del CompanyTenantGuard', async () => {
        const prisma = { catEmpresas: { findFirst: jest.fn().mockResolvedValue(null) } };
        const guard = new CompanyTenantGuard(prisma as any);
        const contexto = {
            switchToHttp: () => ({
                getRequest: () => ({ user: { idTenant: 1 }, params: { companyId: '9' } }),
            }),
        };

        await expect(guard.canActivate(contexto as any)).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.catEmpresas.findFirst).toHaveBeenCalledWith({
            where: { idEmpresa: 9, idTenant: 1 },
            select: { idEmpresa: true },
        });
    });

    it('rechaza un filtro que no existe', async () => {
        const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
        await expect(
            pipe.transform({ filtro: 'otro' }, { type: 'query', metatype: FiltroCursosQuery, data: undefined }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
