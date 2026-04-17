import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { ResendTokenDto } from './dto/resend-token.dto';

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
}
