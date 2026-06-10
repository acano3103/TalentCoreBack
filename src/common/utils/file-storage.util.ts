import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function saveFileLocal(file: Express.Multer.File, folder: string, fileName: string): Promise<string> {
    const uploadDir = join(process.cwd(), 'media', folder);
    await mkdir(uploadDir, { recursive: true });

    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, file.buffer);

    return `media/${folder}/${fileName}`;
}