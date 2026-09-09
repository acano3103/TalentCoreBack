import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { MobileAuthService } from './mobile-auth.service';
import { MobileLoginDto } from './dto/login.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MobileVerifyTokenDto } from './dto/verify-token.dto';
import { MobileResendTokenDto } from './dto/resend-token.dto';
import { MobileJwtAuthGuard } from './guards/mobile-jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@ApiTags('Mobile Auth')
@Controller('mobile/auth')
export class MobileAuthController {
    constructor(private readonly mobileAuthService: MobileAuthService) { }

    // Login from mobile app
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Log in from the mobile app', description: 'Validate user credentials and return session/token data.', })
    @ApiResponse({ status: 200, description: 'Login successful', })
    @ApiResponse({ status: 401, description: 'Invalid credentials', })
    async login(@Body() loginDto: MobileLoginDto) {
        return this.mobileAuthService.login(loginDto);
    }

    // Verify 2FA code for mobile app
    @Post('verify-token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify 2FA code for mobile app', description: 'Validate 2FA code for mobile app', })
    @ApiResponse({ status: 200, description: 'Verify 2FA code successful', })
    @ApiResponse({ status: 401, description: 'Invalid credentials', })
    async verifyToken(@Body() verifyTokenDto: MobileVerifyTokenDto) {
        return this.mobileAuthService.verifyToken(verifyTokenDto);
    }

    // Resend 2FA code for mobile app
    @Post('resend-token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Resend 2FA code for mobile app', description: 'Resend 2FA code for mobile app', })
    @ApiResponse({ status: 200, description: 'Resend 2FA code successful', })
    @ApiResponse({ status: 401, description: 'Invalid credentials', })
    async resendToken(@Body() resendTokenDto: MobileResendTokenDto) {
        return this.mobileAuthService.resendToken(resendTokenDto);
    }

    // Logout from mobile app
    @Post('logout')
    @UseGuards(MobileJwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Close session from the mobile app', description: 'Close session from the mobile app', })
    @ApiResponse({ status: 200, description: 'Logout successful', })
    @ApiResponse({ status: 401, description: 'Invalid credentials', })
    logout(@GetActiveUser() activeUser: ActiveUserDto) {
        return this.mobileAuthService.logout(activeUser);
    }
}
