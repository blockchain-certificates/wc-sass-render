import path from 'node:path';
import process from 'node:process';
import { glob } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import chokidar from 'chokidar';
import Renderer from './SassRenderer.js';

export function getHelpText() {
    return [
        'Usage:',
        '  sass-renderer [input...] [options]',
        '',
        'Options:',
        '  -o, --output <path>      Output file path',
        '  -t, --template <path>    Template file to use',
        '  -w, --watch              Watch files for changes and render automatically',
        '  -e, --expanded           Output CSS in expanded format',
        '  -i, --include <paths>    Comma-separated include directories for @imports',
        '      --suffix <suffix>    Suffix for the rendered file (default: -css.js)',
        '  -q, --quiet              Suppress logs',
        '  -h, --help               Show this help message',
    ].join('\n');
}

export function getCliArgs(argvInput = process.argv) {
    const { values, positionals } = parseArgs({
        args: argvInput.slice(2),
        allowPositionals: true,
        strict: true,
        options: {
            output: {
                type: 'string',
                short: 'o',
            },
            template: {
                type: 'string',
                short: 't',
            },
            watch: {
                type: 'boolean',
                short: 'w',
                default: false,
            },
            expanded: {
                type: 'boolean',
                short: 'e',
                default: false,
            },
            help: {
                type: 'boolean',
                short: 'h',
                default: false,
            },
            include: {
                type: 'string',
                short: 'i',
            },
            suffix: {
                type: 'string',
                default: '-css.js',
            },
            quiet: {
                type: 'boolean',
                short: 'q',
                default: false,
            },
        },
    });

    if (values.output && positionals.length > 1) {
        throw new Error('--output can only be used with a single input pattern');
    }

    return { values, positionals };
}

export async function runCli(argvInput = process.argv) {
    const { values, positionals } = getCliArgs(argvInput);

    if (values.help) {
        console.log(getHelpText());
        return;
    }

    const include = values.include
        ? values.include
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => path.resolve(process.cwd(), entry))
        : undefined;

    const renderer = new Renderer({
        template: values.template,
        include,
        suffix: values.suffix,
        expandedOutput: values.expanded,
    });

    const log = (...args) => {
        if (!values.quiet) {
            console.log(...args);
        }
    };

    const render = async (filePath) => {
        log(`Rendering ${filePath}...`);
        await renderer.render(filePath, values.output);
        log('Complete!');
    };

    const renderSafe = async (filePath) => {
        try {
            await render(filePath);
        } catch (error) {
            console.error(error);
        }
    };

    const inputs = positionals;
    if (inputs.length === 0) {
        return;
    }

    const matchedFiles = new Set();

    for (const pattern of inputs) {
        for await (const filePath of glob(pattern)) {
            matchedFiles.add(filePath);
        }
    }

    const initialResults = await Promise.allSettled(
        [...matchedFiles].map((filePath) => render(filePath))
    );

    const failed = initialResults.find((result) => result.status === 'rejected');
    if (failed) {
        throw failed.reason;
    }

    if (values.watch) {
        log(`Watching ${inputs.join(', ')} for changes...`);

        const dirs = [...new Set(
            inputs.map(p => path.resolve(process.cwd(), p.split('**')[0]))
        )];

        const isScss = (file) => file.endsWith('.scss');

        chokidar
            .watch(dirs, { ignoreInitial: true })
            .on('all', (event, filePath) => {
                if (!isScss(filePath)) return;

                if (event === 'add' || event === 'change') {
                    renderSafe(filePath);
                }
            })
            .on('error', console.error);
    }
}
