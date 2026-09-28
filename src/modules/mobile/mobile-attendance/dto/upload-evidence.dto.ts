import { ApiProperty } from '@nestjs/swagger';

export class UploadEvidenceDto {
    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'Selfie en JPEG o PNG. Máximo 3 MB. Se sube antes del check (D6).',
    })
    file: Express.Multer.File;
}
