import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { CAPABILITY_KEY } from '../capabilities/require-capability.decorator';
import { StaffClassificationController } from './staff-classification.controller';

describe('StaffClassificationController', () => {
    it('el listado se lee con la sesión de la empresa y la escritura pide CFG_PERMISOS', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, StaffClassificationController)).toEqual([
            JwtAuthGuard,
            CompanyTenantGuard,
        ]);
        expect(Reflect.getMetadata(CAPABILITY_KEY, StaffClassificationController.prototype.listar)).toBeUndefined();
        expect(Reflect.getMetadata(GUARDS_METADATA, StaffClassificationController.prototype.crear)).toEqual([
            CommsCapabilityGuard,
        ]);
        expect(Reflect.getMetadata(CAPABILITY_KEY, StaffClassificationController.prototype.crear)).toEqual(['CFG_PERMISOS']);
        expect(Reflect.getMetadata(CAPABILITY_KEY, StaffClassificationController.prototype.actualizar)).toEqual([
            'CFG_PERMISOS',
        ]);
    });
});
