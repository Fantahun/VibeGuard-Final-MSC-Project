'use strict';
const interceptor = require('../src/interceptor/promptInterceptor');

describe('PromptInterceptor', () => {
    test('captures and trims prompt', () => {
        const result = interceptor.capture('  hello world  ');
        expect(result.prompt).toBe('hello world');
        expect(result.length).toBe('hello world'.length);
        expect(typeof result.capturedAt).toBe('number');
    });

    test('throws on empty prompt', () => {
        expect(() => interceptor.capture('   ')).toThrow();
    });

    test('throws on non-string prompt', () => {
        expect(() => interceptor.capture(null)).toThrow();
    });
});
