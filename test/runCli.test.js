import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();

const RendererMock = vi.fn(function (options) {
  this.options = options;
  this.render = renderMock;
});

const globMock = vi.fn();
const watchOnMock = vi.fn();
const watchMock = vi.fn(() => ({
  on: watchOnMock,
}));

function toAsyncIterable(items) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

vi.mock('../SassRenderer.js', () => ({
  default: RendererMock,
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...actual,
    glob: globMock,
  };
});

vi.mock('chokidar', () => ({
  default: {
    watch: watchMock,
  },
}));

describe('runCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    watchOnMock.mockImplementation(() => ({
      on: watchOnMock,
    }));
  });

  it('creates Renderer with default mapped options', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss']);

    expect(RendererMock).toHaveBeenCalledTimes(1);
    expect(RendererMock).toHaveBeenCalledWith({
      template: undefined,
      include: undefined,
      suffix: '-css.js',
      expandedOutput: false,
    });
  });

  it('parses and resolves include paths', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));

    const { runCli } = await import('../runCli.js');

    await runCli([
      'node',
      'cli.js',
      'src/**/*.scss',
      '--include',
      'node_modules, src/styles , ./theme',
      '--template',
      './template.js',
      '--suffix=-styles.js',
      '--expanded',
    ]);

    expect(RendererMock).toHaveBeenCalledTimes(1);

    const options = RendererMock.mock.calls[0][0];
    expect(options).toEqual({
      template: './template.js',
      include: [
        path.resolve(process.cwd(), 'node_modules'),
        path.resolve(process.cwd(), 'src/styles'),
        path.resolve(process.cwd(), './theme'),
      ],
      suffix: '-styles.js',
      expandedOutput: true,
    });
  });

  it('calls glob for each input pattern', async () => {
    globMock
        .mockReturnValueOnce(toAsyncIterable(['a.scss']))
        .mockReturnValueOnce(toAsyncIterable(['b.scss', 'c.scss']));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', 'theme/**/*.scss']);

    expect(globMock).toHaveBeenNthCalledWith(1, 'src/**/*.scss');
    expect(globMock).toHaveBeenNthCalledWith(2, 'theme/**/*.scss');
  });

  it('renders all matched files', async () => {
    globMock.mockReturnValue(toAsyncIterable(['a.scss', 'b.scss']));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss']);

    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock).toHaveBeenCalledWith('a.scss', undefined);
    expect(renderMock).toHaveBeenCalledWith('b.scss', undefined);
  });

  it('deduplicates matched files across patterns', async () => {
    globMock
        .mockReturnValueOnce(toAsyncIterable(['shared.scss', 'a.scss']))
        .mockReturnValueOnce(toAsyncIterable(['shared.scss', 'b.scss']));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'one/**/*.scss', 'two/**/*.scss']);

    expect(renderMock).toHaveBeenCalledTimes(3);
    expect(renderMock).toHaveBeenCalledWith('shared.scss', undefined);
    expect(renderMock).toHaveBeenCalledWith('a.scss', undefined);
    expect(renderMock).toHaveBeenCalledWith('b.scss', undefined);
  });

  it('passes output through to render', async () => {
    globMock.mockReturnValue(toAsyncIterable(['a.scss']));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli([
      'node',
      'cli.js',
      'src/test.scss',
      '--output',
      './dist/output.js',
    ]);

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledWith('a.scss', './dist/output.js');
  });

  it('throws when initial rendering fails', async () => {
    globMock.mockReturnValue(toAsyncIterable(['a.scss']));
    renderMock.mockRejectedValue(new Error('boom'));

    const { runCli } = await import('../runCli.js');

    await expect(
        runCli(['node', 'cli.js', 'src/**/*.scss'])
    ).rejects.toThrow('boom');
  });

  it('does nothing when no inputs are provided', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js']);

    expect(globMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
    expect(watchMock).not.toHaveBeenCalled();
  });

  it('prints help and exits early', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCli, getHelpText } = await import('../runCli.js');

    await runCli(['node', 'cli.js', '--help']);

    expect(logSpy).toHaveBeenCalledWith(getHelpText());
    expect(RendererMock).not.toHaveBeenCalled();
    expect(globMock).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('starts chokidar in watch mode', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', '--watch']);

    expect(watchMock).toHaveBeenCalledWith(
        ['src/**/*.scss'],
        { ignoreInitial: true }
    );
    expect(watchOnMock).toHaveBeenCalledWith('add', expect.any(Function));
    expect(watchOnMock).toHaveBeenCalledWith('change', expect.any(Function));
    expect(watchOnMock).toHaveBeenCalledWith('error', console.error);
  });

  it('renders watched add events', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', '--watch']);

    const addHandler = watchOnMock.mock.calls.find(
        ([eventName]) => eventName === 'add'
    )[1];

    await addHandler('new.scss');

    expect(renderMock).toHaveBeenCalledWith('new.scss', undefined);
  });

  it('renders watched change events', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));
    renderMock.mockResolvedValue(undefined);

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', '--watch']);

    const changeHandler = watchOnMock.mock.calls.find(
        ([eventName]) => eventName === 'change'
    )[1];

    await changeHandler('changed.scss');

    expect(renderMock).toHaveBeenCalledWith('changed.scss', undefined);
  });

  it('logs watch render errors instead of throwing', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));
    renderMock.mockRejectedValue(new Error('watch boom'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', '--watch']);

    const changeHandler = watchOnMock.mock.calls.find(
        ([eventName]) => eventName === 'change'
    )[1];

    await changeHandler('changed.scss');

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(errorSpy.mock.calls[0][0].message).toBe('watch boom');

    errorSpy.mockRestore();
  });

  it('logs during render when not quiet', async () => {
    globMock.mockReturnValue(toAsyncIterable(['a.scss']));
    renderMock.mockResolvedValue(undefined);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss']);

    expect(logSpy).toHaveBeenCalledWith('Rendering a.scss...');
    expect(logSpy).toHaveBeenCalledWith('Complete!');

    logSpy.mockRestore();
  });

  it('suppresses logs in quiet mode', async () => {
    globMock.mockReturnValue(toAsyncIterable(['a.scss']));
    renderMock.mockResolvedValue(undefined);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', '--quiet']);

    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('logs watch startup when not quiet', async () => {
    globMock.mockReturnValue(toAsyncIterable([]));
    renderMock.mockResolvedValue(undefined);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCli } = await import('../runCli.js');

    await runCli(['node', 'cli.js', 'src/**/*.scss', '--watch']);

    expect(logSpy).toHaveBeenCalledWith(
        'Watching src/**/*.scss for changes...'
    );

    logSpy.mockRestore();
  });

  it('rejects output with multiple input patterns', async () => {
    const { runCli } = await import('../runCli.js');

    await expect(
        runCli([
          'node',
          'cli.js',
          'src/**/*.scss',
          'theme/**/*.scss',
          '--output',
          './dist/out.js',
        ])
    ).rejects.toThrow('--output can only be used with a single input pattern');
  });
});
