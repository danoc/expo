import { CodedError, Platform, registerWebModule } from 'expo-modules-core';
import FontObserver from 'fontfaceobserver';

import { ExpoFontLoaderModule } from './ExpoFontLoader';
import { UnloadFontOptions } from './Font';
import { FontDisplay, FontResource } from './Font.types';

function getFontFaceStyleSheet(): CSSStyleSheet | null {
  if (!Platform.isDOMAvailable) {
    return null;
  }
  const styleSheet = getStyleElement();
  return styleSheet.sheet ? (styleSheet.sheet as CSSStyleSheet) : null;
}

type RuleItem = { rule: CSSFontFaceRule; index: number };

function getFontFaceRules(): RuleItem[] {
  const sheet = getFontFaceStyleSheet();
  if (sheet) {
    // @ts-ignore: rule iterator
    const rules = [...sheet.cssRules];

    const items: RuleItem[] = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule instanceof CSSFontFaceRule) {
        items.push({ rule, index: i });
      }
    }
    return items;
  }
  return [];
}

function getFontFaceRulesMatchingResource(
  fontFamilyName: string,
  options?: UnloadFontOptions
): RuleItem[] {
  const rules = getFontFaceRules();
  return rules.filter(({ rule }) => {
    return (
      rule.style.fontFamily === fontFamilyName &&
      (options && options.display ? options.display === (rule.style as any).fontDisplay : true)
    );
  });
}

const serverContext: Set<{ name: string; css: string; resourceId: string }> = new Set();

function getHeadElements(): {
  $$type: string;
  rel?: string;
  href?: string;
  as?: string;
  crossorigin?: string;
  children?: string;
  id?: string;
  type?: string;
}[] {
  const entries = [...serverContext.entries()];
  if (!entries.length) {
    return [];
  }
  const css = entries.map(([{ css }]) => css).join('\n');
  const links = entries.map(([{ resourceId }]) => resourceId);
  // TODO: Maybe return nothing if no fonts were loaded.
  return [
    {
      $$type: 'style',
      children: css,
      id: ID,
      type: 'text/css',
    },
    ...links.map((resourceId) => ({
      $$type: 'link',
      rel: 'preload',
      href: resourceId,
      as: 'font',
      crossorigin: '',
    })),
  ];
}

const ExpoFontLoader: Required<ExpoFontLoaderModule> = {
  async unloadAllAsync(): Promise<void> {
    if (!Platform.isDOMAvailable) return;

    const element = document.getElementById(ID);
    if (element && element instanceof HTMLStyleElement) {
      document.removeChild(element);
    }
  },

  async unloadAsync(fontFamilyName: string, options?: UnloadFontOptions): Promise<void> {
    const sheet = getFontFaceStyleSheet();
    if (!sheet) return;
    const items = getFontFaceRulesMatchingResource(fontFamilyName, options);
    for (const item of items) {
      sheet.deleteRule(item.index);
    }
  },

  getServerResources(): string[] {
    const elements = getHeadElements();

    return elements
      .map((element) => {
        switch (element.$$type) {
          case 'style':
            return `<style id="${element.id}">${element.children}</style>`;
          case 'link':
            return `<link rel="${element.rel}" href="${element.href}" as="${element.as}" crossorigin="${element.crossorigin}" />`;
          default:
            return '';
        }
      })
      .filter(Boolean);
  },

  resetServerContext() {
    serverContext.clear();
  },

  getLoadedFonts(): string[] {
    if (typeof window === 'undefined') {
      return [...serverContext.values()].map(({ name }) => name);
    }
    const rules = getFontFaceRules();
    return rules.map(({ rule }) => rule.style.fontFamily);
  },

  isLoaded(fontFamilyName: string, resource: UnloadFontOptions = {}): boolean {
    if (typeof window === 'undefined') {
      return !![...serverContext.values()].find((asset) => {
        return asset.name === fontFamilyName;
      });
    }
    return getFontFaceRulesMatchingResource(fontFamilyName, resource)?.length > 0;
  },

  // NOTE(vonovak): This is used in RN vector-icons to load fonts dynamically on web. Changing the signature is breaking.
  // NOTE(EvanBacon): No async keyword! This cannot return a promise in Node environments.
  loadAsync(fontFamilyName: string, resource: FontResource): Promise<void> {
    if (__DEV__ && typeof resource !== 'object') {
      // to help devving on web, where loadAsync interface is different from native
      throw new CodedError(
        'ERR_FONT_SOURCE',
        `Expected font resource of type \`object\` instead got: ${typeof resource}`
      );
    }
    if (typeof window === 'undefined') {
      serverContext.add({
        name: fontFamilyName,
        css: _createWebFontTemplate(fontFamilyName, resource),
        // @ts-expect-error: typeof string
        resourceId: resource.uri!,
      });
      return Promise.resolve();
    }

    const canInjectStyle = document.head && typeof document.head.appendChild === 'function';
    if (!canInjectStyle) {
      throw new CodedError(
        'ERR_WEB_ENVIRONMENT',
        `The browser's \`document.head\` element doesn't support injecting fonts.`
      );
    }

    const style = getStyleElement();
    document.head!.appendChild(style);

    const res = getFontFaceRulesMatchingResource(fontFamilyName, resource);
    if (!res.length) {
      _createWebStyle(fontFamilyName, resource);
    }

    if (!isFontLoadingListenerSupported()) {
      return Promise.resolve();
    }

    return new FontObserver(fontFamilyName, {
      // @ts-expect-error: TODO(@kitten): Typings indicate that the polyfill may not support this?
      display: resource.display,
    }).load(null, 6000);
  },
};

const isServer = Platform.OS === 'web' && typeof window === 'undefined';

function createExpoFontLoader() {
  return ExpoFontLoader;
}
const toExport = isServer
  ? ExpoFontLoader
  : // @ts-expect-error: registerWebModule calls `new` on the module implementation.
    // Normally that'd be a class but that doesn't work on server, so we use a function instead.
    // TS doesn't like that but we don't need it to be a class.
    registerWebModule(createExpoFontLoader, 'ExpoFontLoader');

export default toExport;

const ID = 'expo-generated-fonts';

function getStyleElement(): HTMLStyleElement {
  const element = document.getElementById(ID);
  if (element && element instanceof HTMLStyleElement) {
    return element;
  }
  const styleElement = document.createElement('style');
  styleElement.id = ID;

  return styleElement;
}

export function _createWebFontTemplate(fontFamily: string, resource: FontResource): string {
  return `@font-face{font-family:"${fontFamily}";src:url("${resource.uri}");font-display:${
    resource.display || FontDisplay.AUTO
  }}`;
}

function _createWebStyle(fontFamily: string, resource: FontResource): HTMLStyleElement {
  const fontStyle = _createWebFontTemplate(fontFamily, resource);

  const styleElement = getStyleElement();
  // @ts-ignore: TypeScript does not define HTMLStyleElement::styleSheet. This is just for IE and
  // possibly can be removed if it's unnecessary on IE 11.
  if (styleElement.styleSheet) {
    const styleElementIE = styleElement as any;
    styleElementIE.styleSheet.cssText = styleElementIE.styleSheet.cssText
      ? styleElementIE.styleSheet.cssText + fontStyle
      : fontStyle;
  } else {
    const textNode = document.createTextNode(fontStyle);
    styleElement.appendChild(textNode);
  }
  return styleElement;
}

function isFontLoadingListenerSupported(): boolean {
  const { userAgent } = window.navigator;
  // WebKit is broken https://github.com/bramstein/fontfaceobserver/issues/95
  const isIOS = !!userAgent.match(/iPad|iPhone/i);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  // Edge is broken https://github.com/bramstein/fontfaceobserver/issues/109#issuecomment-333356795
  const isEdge = userAgent.includes('Edge');
  // Internet Explorer
  const isIE = userAgent.includes('Trident');
  // Firefox
  const isFirefox = userAgent.includes('Firefox');
  return !isSafari && !isIOS && !isEdge && !isIE && !isFirefox;
}
