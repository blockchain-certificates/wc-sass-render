import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Renderer, { DEFAULT_OPTIONS } from '../SassRenderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE_DEFAULT = path.resolve(__dirname, './test.scss');
const INPUT_FILE_TEMPLATE = path.resolve(__dirname, '../test-templates/otherTemplate.js');
const INPUT_FILE_DELIM = path.resolve(__dirname, '../test-templates/otherDelim.js');
const INPUT_FILE_ESCAPE = path.resolve(__dirname, './test-escape-char.scss');

const OUTPUT_FILE_DEFAULT = path.resolve(__dirname, './test-css.js');
const OUTPUT_FILE_CUSTOM = path.resolve(__dirname, './test-styles.ts');
const OUTPUT_FILE_ESCAPE = path.resolve(__dirname, './test-escape-char.js');

const EXPECTED_IMPORT = "import {html} from '@polymer/lit-element';";

const OUTPUT_EXPECTED_DEFAULT = `${EXPECTED_IMPORT}
export default html\`<style>a{color:red}</style>\`;\n`;

const OUTPUT_EXPECTED_ESCAPE = `${EXPECTED_IMPORT}
export default html\`<style>.char-render{content:"line1\\\\aline2"}</style>\`;\n`;

const OUTPUT_EXPECTED_CUSTOM = `export default \`<style>a{color:red}</style>\`;\n`;
const OUTPUT_EXPECTED_LIB = `export default \`<style>a{background:blue}</style>\`;\n`;
const OUTPUT_EXPECTED_MULTI_LIB = `export default \`<style>a{background:blue}a{font-weight:bold}</style>\`;\n`;

const OUTPUT_FILES = [
    OUTPUT_FILE_DEFAULT,
    OUTPUT_FILE_CUSTOM,
    OUTPUT_FILE_ESCAPE,
];

async function fileExists(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return stats.isFile();
    } catch {
        return false;
    }
}

async function deleteIfExists(filePath) {
    try {
        await fs.unlink(filePath);
    } catch {
        // ignore missing file
    }
}

async function cleanupRenderedFiles() {
    await Promise.all(OUTPUT_FILES.map(deleteIfExists));
}

describe('SassRenderer', () => {
    beforeEach(async () => {
        await cleanupRenderedFiles();
    });

    afterAll(async () => {
        await cleanupRenderedFiles();
    });

    describe('Setup class', () => {
        it('creates a SassRenderer instance', () => {
            const r = new Renderer();
            expect(r).toBeInstanceOf(Renderer);
        });

        it('exposes the expected methods', () => {
            const r = new Renderer();
            expect(r.css).toBeTypeOf('function');
            expect(r.render).toBeTypeOf('function');
        });

        it('uses default options', () => {
            const r = new Renderer();

            for (const key of Object.keys(DEFAULT_OPTIONS)) {
                expect(r[key]).toEqual(DEFAULT_OPTIONS[key]);
            }
        });

        it('applies custom options', () => {
            const customOptions = {
                delim: /{{css}}/,
                include: ['./any'],
                template: '/customTemplate.js',
                suffix: '-styles.js',
                expandedOutput: true,
            };

            const r = new Renderer(customOptions);

            expect(r.delim).toEqual(customOptions.delim);
            expect(r.include).toEqual(customOptions.include);
            expect(r.template).toEqual(customOptions.template);
            expect(r.suffix).toEqual(customOptions.suffix);
            expect(r.expandedOutput).toEqual(customOptions.expandedOutput);
        });
    });

    describe('Rendering', () => {
        it('compiles sass to a string with css(src)', async () => {
            const r = new Renderer();
            const css = await r.css(INPUT_FILE_DEFAULT);
            expect(css).toBe('a{color:red}');
        });

        it('creates a new file with render(src)', async () => {
            const r = new Renderer();
            await r.render(INPUT_FILE_DEFAULT);

            expect(await fileExists(OUTPUT_FILE_DEFAULT)).toBe(true);
        });

        it('renders SASS into a new file with render(src)', async () => {
            const r = new Renderer();
            await r.render(INPUT_FILE_DEFAULT);

            const cssModule = await fs.readFile(OUTPUT_FILE_DEFAULT, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_DEFAULT);
        });

        it('renders SASS into a custom file with render(src, output)', async () => {
            const r = new Renderer();
            await r.render(INPUT_FILE_DEFAULT, OUTPUT_FILE_CUSTOM);

            expect(await fileExists(OUTPUT_FILE_CUSTOM)).toBe(true);
        });

        it('replaces CSS single escape characters with double escapes', async () => {
            const r = new Renderer();
            await r.render(INPUT_FILE_ESCAPE, OUTPUT_FILE_ESCAPE);

            const cssModule = await fs.readFile(OUTPUT_FILE_ESCAPE, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_ESCAPE);
        });
    });

    describe('Configuration', () => {
        it('renders with a custom template', async () => {
            const r = new Renderer({
                template: INPUT_FILE_TEMPLATE,
            });

            await r.render(INPUT_FILE_DEFAULT);

            const cssModule = await fs.readFile(OUTPUT_FILE_DEFAULT, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_CUSTOM);
        });

        it('renders with a custom delimiter', async () => {
            const r = new Renderer({
                template: INPUT_FILE_DELIM,
                delim: /{{styles}}/,
            });

            await r.render(INPUT_FILE_DEFAULT);

            const cssModule = await fs.readFile(OUTPUT_FILE_DEFAULT, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_CUSTOM);
        });

        it('throws if no template delimiter match is found', async () => {
            const r = new Renderer({
                template: INPUT_FILE_DELIM,
            });

            await expect(r.render(INPUT_FILE_DEFAULT)).rejects.toThrow(
                /Template file .* did not contain template delimiters/
            );
        });

        it('renders with a custom suffix', async () => {
            const r = new Renderer({
                suffix: '-styles.ts',
            });

            await r.render(INPUT_FILE_DEFAULT);

            const cssModule = await fs.readFile(OUTPUT_FILE_CUSTOM, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_DEFAULT);
        });

        it('renders with custom SASS include paths', async () => {
            const r = new Renderer({
                template: INPUT_FILE_TEMPLATE,
                include: [path.resolve(__dirname, '../test-templates')],
            });

            await r.render(
                path.resolve(__dirname, 'test-with-include.scss'),
                OUTPUT_FILE_DEFAULT
            );

            const cssModule = await fs.readFile(OUTPUT_FILE_DEFAULT, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_LIB);
        });

        it('renders with multiple custom SASS include paths', async () => {
            const r = new Renderer({
                template: INPUT_FILE_TEMPLATE,
                include: [
                    path.resolve(__dirname, '../test-templates'),
                    path.resolve(__dirname, '../test-templates/nested-include'),
                ],
            });

            await r.render(
                path.resolve(__dirname, 'test-with-multi-include.scss'),
                OUTPUT_FILE_DEFAULT
            );

            const cssModule = await fs.readFile(OUTPUT_FILE_DEFAULT, 'utf8');
            expect(cssModule).toBe(OUTPUT_EXPECTED_MULTI_LIB);
        });
    });
});
