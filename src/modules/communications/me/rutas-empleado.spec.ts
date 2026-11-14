import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { KioskJwtAuthGuard } from 'src/modules/kiosks/kiosk-auth/guards/kiosk-jwt-auth.guard';
import { MobileJwtAuthGuard } from 'src/modules/mobile/mobile-auth/guards/mobile-jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { KioskCommsController } from '../kiosk-comms/kiosk-comms.controller';
import { LinkThrottleGuard } from '../public-links/link-throttle.guard';
import { PublicLinksController } from '../public-links/public-links.controller';
import { contextoCliente } from './cliente-http';
import { MeCommsController } from './me-comms.controller';
import { MobileCommsController } from './mobile-comms.controller';

describe('rutas de CA7', () => {
    it('la bandeja web exige sesión y empresa, sin capacidad de publicador', () => {
        const guards = Reflect.getMetadata(GUARDS_METADATA, MeCommsController);
        expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, CompanyTenantGuard]));
        expect(guards).not.toContain(CommsCapabilityGuard);
    });

    it('el alias móvil usa el token de la app', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, MobileCommsController)).toEqual(
            expect.arrayContaining([MobileJwtAuthGuard, CompanyTenantGuard]),
        );
    });

    it('el enlace público no lleva JWT de usuario y el kiosco usa el suyo', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, PublicLinksController)).toEqual([LinkThrottleGuard]);
        expect(Reflect.getMetadata(GUARDS_METADATA, KioskCommsController)).toEqual([KioskJwtAuthGuard]);
    });

    it('X-Client mobile registra el canal APP y la ruta móvil lo fuerza', () => {
        expect(contextoCliente({ headers: { 'x-client': 'mobile' } }).canal).toBe('APP');
        expect(contextoCliente({ headers: {} }).canal).toBe('WEB');
        expect(contextoCliente({ headers: {} }, true).canal).toBe('APP');
    });
});
