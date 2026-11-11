import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class KioskJwtAuthGuard extends AuthGuard('kiosk-jwt') {}
