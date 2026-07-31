import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
    PORT: Joi.number().default(3000),
    DATABASE_URL: Joi.string().required(),
    USE_CAPTCHA: Joi.boolean().default(false),
    USE_TOKEN_2FA: Joi.boolean().default(false),
    CAPTCHA_SECRET_KEY: Joi.string().when('USE_CAPTCHA', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional(),
    }),
    ALLOW_CONCURRENT_SESSIONS: Joi.boolean().default(true),
    MAIL_HOST: Joi.string().required(),
    MAIL_PORT: Joi.number().required(),
    MAIL_USER: Joi.string().required(),
    MAIL_PASS: Joi.string().required(),
    MAIL_FROM: Joi.string().required(),
    JWT_SECRET: Joi.string().required(),
    ENCRYPTION_KEY: Joi.string().required(),
    FRONT_URL: Joi.string().required(),
    HUME_API_KEY: Joi.string().required(),
    HUME_SECRET_KEY: Joi.string().required(),
    HUME_CONFIG_ID_INTERVIEW: Joi.string().required(),
    OPENAI_API_KEY: Joi.string().required(),
    MEDIA_PATH_PREFIX: Joi.string().default('media'),
    NUBARIUM_BASE_URL: Joi.string().required(),
    NUBARIUM_USERNAME: Joi.string().required(),
    NUBARIUM_PASSWORD: Joi.string().required(),
    NUBARIUM_TIMEOUT: Joi.number().required(),
    NUBARIUM_FIRMA_URL: Joi.string().required(),
    NUBARIUM_FIRMA_UBICACION: Joi.any()
        .custom((value, helpers) => {
            try {
                if (Array.isArray(value)) return value;
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
                return helpers.error('any.invalid');
            } catch (e) {
                return helpers.error('any.invalid');
            }
        }, 'JSON Array Parser')
        .required(),
    GUPSHUP_API_KEY: Joi.string().required(),
    GUPSHUP_BASE_URL: Joi.string().required(),
    GUPSHUP_SOURCE_PHONE: Joi.string().required(),
    GUPSHUP_APP_NAME: Joi.string().required(),
});