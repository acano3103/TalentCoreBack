import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync } from 'fs';
import { Response } from 'express';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':id')
  async getProfile(@Param('id') id: string) {
    try {
      return await this.profileService.getProfile(Number(id));
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id')
  async updateProfile(@Param('id') id: string, @Body() data: any) {
    try {
      return await this.profileService.updateProfile(Number(id), data);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /api/v2/profile/:id/avatar
   * Accepts a multipart/form-data file with field name "avatar".
   * Saves it as {username}.jpg in src/media/avatars/, overwriting any existing file.
   */
  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: join(process.cwd(), 'src', 'media', 'avatars'),
        filename: (_req, _file, cb) => {
          // Temp name — will be renamed to {username}.jpg in the handler
          cb(null, `tmp_${Date.now()}${extname(_file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|webp)$/i;
        if (!allowed.test(file.originalname)) {
          return cb(
            new HttpException(
              'Solo se permiten imágenes (jpg, jpeg, png, webp)',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    }),
  )
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) {
        throw new HttpException('No se recibió ningún archivo', HttpStatus.BAD_REQUEST);
      }

      const avatarUrl = await this.profileService.saveAvatar(Number(id), file);
      return { avatarUrl };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Error al subir el avatar',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/v2/profile/avatar/:username
   * Serves the avatar image file directly.
   */
  @Get('avatar/:username')
  async getAvatar(@Param('username') username: string, @Res() res: Response) {
    const avatarsDir = join(process.cwd(), 'src', 'media', 'avatars');
    const filePath = join(avatarsDir, `${username}.jpg`);

    if (!existsSync(filePath)) {
      throw new HttpException('Avatar not found', HttpStatus.NOT_FOUND);
    }

    return res.sendFile(filePath);
  }
}
