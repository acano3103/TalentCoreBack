
export interface HumeEviConfigBody {
    name: string;
    evi_version: string;
    prompt: { text: string };
    language_model: {
        model_provider: 'OPEN_AI';
        model_resource: 'gpt-4o-mini' | 'gpt-4o';
    };
}