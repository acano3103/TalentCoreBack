import { pbkdf2Sync } from 'pbkdf2';

export class DjangoPasswordHasher {
    static verify(password: string, djangoHash: string): boolean {
        try {
            const parts = djangoHash.split('$');
            if (parts.length !== 4) return false;

            const [algorithm, iterations, salt, hash] = parts;

            if (algorithm !== 'pbkdf2_sha256') {
                throw new Error(`Algoritmo no soportado: ${algorithm}`);
            }

            const derivedKey = pbkdf2Sync(
                password,
                salt,
                parseInt(iterations, 10),
                32,
                'sha256'
            );

            return derivedKey.toString('base64') === hash;
        } catch (error) {
            return false;
        }
    }

    static hash(password: string): string {
        const iterations = 720000;
        const salt = require('crypto').randomBytes(12).toString('base64');
        const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');

        return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
    }
}