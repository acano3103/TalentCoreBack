import { NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { resolve, sep } from 'path';
import { joinPackagePath } from './scorm-manifest.util';

// Resuelve un archivo dentro de la carpeta del paquete. Rechaza ../ y %2e%2e (Zip Slip / path traversal).
export function resolvePackageFile(carpeta: string, filePath: string): string {
    const raiz = resolve(carpeta);
    try {
        const relativo = joinPackagePath(decodeURIComponent(filePath || '')).replace(/[?#].*$/, '');
        const absoluto = resolve(raiz, ...relativo.split('/'));
        if (absoluto.startsWith(raiz + sep)) return absoluto;
    } catch {
        // decodeURIComponent o joinPackagePath: la ruta no es un archivo del paquete
    }
    throw new NotFoundException('Archivo no encontrado.');
}

// Express atiende Range (audio y video de Captivate) cuando el archivo se manda con sendFile.
export function sendPackageFile(absoluto: string, res: Response, cacheControl: string): Promise<void> {
    return new Promise((ok, fail) => {
        res.sendFile(absoluto, { dotfiles: 'deny', headers: { 'Cache-Control': cacheControl } }, (err) => (err ? fail(err) : ok()));
    });
}
