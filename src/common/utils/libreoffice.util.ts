
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    access,
    mkdir,
    mkdtemp,
    readFile,
    rm,
} from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const execFileAsync = promisify(execFile);

function getLibreOfficeExecutable(): string {
    const configuredPath = process.env.LIBREOFFICE_PATH;

    if (configuredPath) {
        return configuredPath;
    }

    if (process.platform === 'win32') {
        return 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
    }

    return 'soffice';
}

export async function convertDocxToPdf(
    inputPath: string,
): Promise<Buffer> {
    const tempRoot = await mkdtemp(
        path.join(tmpdir(), 'talentcore-document-'),
    );

    const outputDir = path.join(tempRoot, 'output');
    const profileDir = path.join(tempRoot, 'lo-profile');

    try {
        await mkdir(outputDir, { recursive: true });
        await mkdir(profileDir, { recursive: true });

        const executable = getLibreOfficeExecutable();
        const profileUrl = pathToFileURL(profileDir).href;

        await execFileAsync(
            executable,
            [
                '--headless',
                '--nologo',
                '--nodefault',
                '--nolockcheck',
                `-env:UserInstallation=${profileUrl}`,
                '--convert-to',
                'pdf:writer_pdf_Export',
                '--outdir',
                outputDir,
                inputPath,
            ],
            {
                timeout: 120_000,
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            },
        );

        const outputPath = path.join(
            outputDir,
            `${path.parse(inputPath).name}.pdf`,
        );

        await access(outputPath);

        const buffer = await readFile(outputPath);

        if (!buffer.length) {
            throw new Error('LibreOffice generó un PDF vacío.');
        }

        return buffer;
    } finally {
        await rm(tempRoot, {
            recursive: true,
            force: true,
        }).catch(() => undefined);
    }
}