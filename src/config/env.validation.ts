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
});