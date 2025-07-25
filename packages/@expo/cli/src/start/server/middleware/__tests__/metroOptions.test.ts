import { env } from 'node:process';

import { createBundleUrlPath, getMetroDirectBundleOptions } from '../metroOptions';

describe(getMetroDirectBundleOptions, () => {
  it(`asserts unsupported options: using bytecode on web`, () => {
    expect(() =>
      getMetroDirectBundleOptions({
        bytecode: true,
        platform: 'web',
      })
    ).toThrow(/Cannot use bytecode with the web platform/);
  });
  it(`asserts unsupported options: using bytecode without hermes`, () => {
    expect(() =>
      getMetroDirectBundleOptions({
        bytecode: true,
      })
    ).toThrow(/Bytecode is only supported with the Hermes engine/);
  });

  it(`returns basic options`, () => {
    expect(
      getMetroDirectBundleOptions({
        mainModuleName: '/index.js',
        mode: 'development',
        platform: 'ios',
        baseUrl: '/foo/',
        isExporting: false,
      })
    ).toEqual({
      customResolverOptions: {},
      customTransformOptions: {
        baseUrl: '/foo/',
      },
      serializerOptions: {},
      dev: true,
      entryFile: '/index.js',
      inlineSourceMap: false,
      minify: false,
      platform: 'ios',
      unstable_transformProfile: 'default',
    });
  });
  it(`injects source url if serializer options are provided`, () => {
    expect(
      getMetroDirectBundleOptions({
        mainModuleName: '/index.js',
        mode: 'development',
        platform: 'ios',
        serializerIncludeMaps: true,
        isExporting: false,
        bytecode: false,
        reactCompiler: false,
      })
    ).toEqual({
      sourceUrl:
        'http://localhost:8081/index.js.bundle?platform=ios&dev=true&hot=false&serializer.map=true',
      customResolverOptions: {},
      customTransformOptions: {},
      serializerOptions: {
        includeSourceMaps: true,
      },
      sourceMapUrl:
        'http://localhost:8081/index.js.map?platform=ios&dev=true&hot=false&serializer.map=true',
      dev: true,
      entryFile: '/index.js',
      inlineSourceMap: false,
      minify: false,
      platform: 'ios',
      unstable_transformProfile: 'default',
    });
  });
  describe(`live bindings`, () => {
    afterEach(() => {
      delete env.EXPO_UNSTABLE_LIVE_BINDINGS;
    });
    it(`enables live bindings by default`, () => {
      expect(getMetroDirectBundleOptions({}).customTransformOptions?.liveBindings).toBeUndefined();
    });
    it(`enables live bindings by default`, () => {
      env.EXPO_UNSTABLE_LIVE_BINDINGS = 'true';
      expect(getMetroDirectBundleOptions({}).customTransformOptions?.liveBindings).toBeUndefined();
    });
    it(`enables live bindings by default`, () => {
      env.EXPO_UNSTABLE_LIVE_BINDINGS = '0';
      expect(getMetroDirectBundleOptions({}).customTransformOptions?.liveBindings).toBe('false');
    });
  });
});
describe(createBundleUrlPath, () => {
  it(`returns basic options`, () => {
    expect(
      createBundleUrlPath({
        mainModuleName: 'index',
        mode: 'development',
        platform: 'ios',
        isExporting: false,
      })
    ).toEqual('/index.bundle?platform=ios&dev=true&hot=false');
  });
  it(`returns basic options with baseUrl as a fully qualified URL`, () => {
    expect(
      createBundleUrlPath({
        mainModuleName: 'index',
        mode: 'development',
        platform: 'ios',
        baseUrl: 'https://localhost:8081/dist/',
        isExporting: false,
      })
    ).toEqual(
      '/index.bundle?platform=ios&dev=true&hot=false&transform.baseUrl=https%3A%2F%2Flocalhost%3A8081%2Fdist%2F'
    );
  });
  it(`disables lazy when exporting`, () => {
    expect(
      createBundleUrlPath({
        mainModuleName: 'index',
        mode: 'development',
        platform: 'ios',
        lazy: true,
        isExporting: true,
      })
    ).toEqual('/index.bundle?platform=ios&dev=true&hot=false&resolver.exporting=true');
  });
});
