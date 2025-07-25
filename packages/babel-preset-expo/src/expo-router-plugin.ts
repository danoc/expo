/**
 * Copyright © 2024 650 Industries.
 */
import type { ConfigAPI, PluginObj, NodePath, types as t } from '@babel/core';
import nodePath from 'node:path';
import resolveFrom from 'resolve-from';

import { getExpoRouterAbsoluteAppRoot, getPossibleProjectRoot, getAsyncRoutes } from './common';

const debug = require('debug')('expo:babel:router');

function getExpoRouterAppRoot(projectRoot: string, appFolder: string) {
  // TODO: We should have cache invalidation if the expo-router/entry file location changes.
  const routerEntry = resolveFrom(projectRoot, 'expo-router/entry');

  const appRoot = nodePath.relative(nodePath.dirname(routerEntry), appFolder);

  debug('routerEntry', routerEntry, appFolder, appRoot);
  return appRoot;
}

/**
 * Inlines environment variables to configure the process:
 *
 * EXPO_PROJECT_ROOT
 * EXPO_ROUTER_ABS_APP_ROOT
 * EXPO_ROUTER_APP_ROOT
 * EXPO_ROUTER_IMPORT_MODE
 */
export function expoRouterBabelPlugin(api: ConfigAPI & typeof import('@babel/core')): PluginObj {
  const { types: t } = api;
  const possibleProjectRoot = api.caller(getPossibleProjectRoot);
  const asyncRoutes = api.caller(getAsyncRoutes);
  const routerAbsoluteRoot = api.caller(getExpoRouterAbsoluteAppRoot);

  function isFirstInAssign(path: NodePath<t.MemberExpression>) {
    return t.isAssignmentExpression(path.parent) && path.parent.left === path.node;
  }

  return {
    name: 'expo-router',
    visitor: {
      MemberExpression(path: any, state: any) {
        const projectRoot = possibleProjectRoot || state.file.opts.root || '';

        if (path.get('object').matchesPattern('process.env')) {
          const key = path.toComputedKey();
          if (t.isStringLiteral(key) && !isFirstInAssign(path)) {
            // Used for log box on web.
            if (key.value.startsWith('EXPO_PROJECT_ROOT')) {
              path.replaceWith(t.stringLiteral(projectRoot));
            } else if (key.value.startsWith('EXPO_ROUTER_IMPORT_MODE')) {
              path.replaceWith(t.stringLiteral(asyncRoutes ? 'lazy' : 'sync'));
            }

            if (
              // Skip loading the app root in tests.
              // This is handled by the testing-library utils
              process.env.NODE_ENV !== 'test'
            ) {
              if (key.value.startsWith('EXPO_ROUTER_ABS_APP_ROOT')) {
                path.replaceWith(t.stringLiteral(routerAbsoluteRoot));
              } else if (key.value.startsWith('EXPO_ROUTER_APP_ROOT')) {
                path.replaceWith(
                  t.stringLiteral(getExpoRouterAppRoot(projectRoot, routerAbsoluteRoot))
                );
              }
            }
          }
        }
      },
    },
  };
}
