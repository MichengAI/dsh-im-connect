export interface UserQuestionOption {
    label: string;
    description?: string;
}
export interface UserQuestionItem {
    id: string;
    question: string;
    detail?: string;
    header?: string;
    options?: UserQuestionOption[];
    multiSelect?: boolean;
    intent?: {
        kind: string;
        approve?: string;
    };
}
export interface UserQuestionAnswerItem {
    id: string;
    selected: string[];
    custom?: string;
}
export interface UserQuestionAnswer {
    answers: UserQuestionAnswerItem[];
}
export interface QuestionReplyResult {
    handled: boolean;
    waitingPresentation?: boolean;
    completed?: boolean;
    next?: {
        question: UserQuestionItem;
        index: number;
        total: number;
    };
}
export declare function validUserQuestion(question: unknown): question is UserQuestionItem;
export declare function formatUserQuestion(question: UserQuestionItem, index: number, total: number, options?: {
    requiresMention?: boolean;
}): string;
export declare function answerUserQuestion(question: UserQuestionItem, input: string): UserQuestionAnswerItem;
export declare class QuestionBroker {
    private readonly pending;
    has(key: string): boolean;
    current(key: string): {
        question: UserQuestionItem;
        index: number;
        total: number;
    } | undefined;
    signal(key: string): AbortSignal | undefined;
    begin(key: string, questions: UserQuestionItem[], signal?: AbortSignal): Promise<UserQuestionAnswer> | undefined;
    activate(key: string): boolean;
    answer(key: string, text: string): QuestionReplyResult;
    cancel(key: string, reason?: unknown): boolean;
    dispose(): void;
    private cleanup;
}
//# sourceMappingURL=question.d.ts.map