// Estructuras JSON del contenido de un curso Online Asíncrono.
// Las llaves van en inglés porque son las mismas que usa SimuPro (así el reproductor se porta sin cambios).

export interface QuizQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
}

export interface GeneratedLesson {
    title: string;
    objective: string;
    content: string;
    keyPoints: string[];
    quiz: QuizQuestion[];
}

export interface GeneratedModule {
    title: string;
    objective: string;
    lessons: GeneratedLesson[];
}

export interface GeneratedCourse {
    title: string;
    description: string;
    targetAudience: string;
    level: string;
    modules: GeneratedModule[];
}

export interface Slide {
    index: number;
    title: string;
    body: string;
    type: 'intro' | 'content' | 'keypoint' | 'summary';
}
