import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_OPTIONS = {
    delim: /<%\s*content\s*%>/,
    include: [path.resolve(process.cwd(), 'node_modules')],
    template: path.resolve(__dirname, 'template.js'),
    suffix: '-css.js',
    expandedOutput: false,
};

export default class SassRenderer {
    constructor(options = {}) {
        const settings = { ...DEFAULT_OPTIONS };

        if (options.delim !== undefined) settings.delim = options.delim;
        if (options.include !== undefined) settings.include = options.include;
        if (options.template !== undefined) settings.template = options.template;
        if (options.suffix !== undefined) settings.suffix = options.suffix;
        if (options.expandedOutput !== undefined) settings.expandedOutput = options.expandedOutput;

        Object.assign(this, settings);
    }

    async css(sassFile) {
        const result = await sass.compileAsync(sassFile, {
            loadPaths: this.include,
            style: this.expandedOutput ? 'expanded' : 'compressed',
        });

        return result.css.replace(/\\/g, '\\\\');
    }

    async render(source, output) {
        const { delim, template, suffix } = this;

        const tmp = await fs.readFile(template, 'utf8');
        const match = delim.exec(tmp);

        if (!match) {
            throw new Error(`Template file ${template} did not contain template delimiters`);
        }

        const newContent = tmp.replace(delim, await this.css(source));

        const parsed = path.parse(source);
        const destination =
            output ?? path.join(parsed.dir, `${parsed.name}${suffix}`);

        await fs.writeFile(destination, newContent, 'utf8');
    }
}
