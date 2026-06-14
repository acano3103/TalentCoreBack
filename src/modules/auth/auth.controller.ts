import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { ResendTokenDto } from './dto/resend-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetActiveUser } from './decorators/active-user.decorator';
import { ActiveUserDto } from './dto/active-user.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @ApiOperation({ summary: 'User login', description: 'Authenticates a user and returns an access token.' })
    @ApiResponse({ status: 201, description: 'User successfully logged in.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('verify-token')
    @ApiOperation({ summary: 'Verify token', description: 'Verifies a token and returns an access token.' })
    @ApiResponse({ status: 201, description: 'Token successfully verified.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid token.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    verify(@Body() verifyDto: VerifyTokenDto) {
        return this.authService.verifyToken(verifyDto);
    }

    @Post('resend-token')
    @ApiOperation({ summary: 'Resend token', description: 'Resends a token to the user.' })
    @ApiResponse({ status: 201, description: 'Token successfully resent.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid token.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    resendToken(@Body() resetTokenDto: ResendTokenDto) {
        return this.authService.resendToken(resetTokenDto);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'User logout', description: 'Invalidates the current session and purges it from the persistent storage.' })
    @ApiResponse({ status: 201, description: 'Session successfully purged from database.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid or expired token.' })
    logout(@GetActiveUser() activeUser: ActiveUserDto) {
        return this.authService.logout(activeUser);
    }
}
