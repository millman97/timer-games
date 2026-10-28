// Fully local unit-test adapters. No browser, server, storage service, or network.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const mocks = {
  'expo-audio': `export const createAudioPlayer=(...args)=>globalThis.__testAudio.createAudioPlayer(...args); export const setAudioModeAsync=(...args)=>globalThis.__testAudio?.setAudioModeAsync(...args) || Promise.resolve();`,
  'react-native': `import React from 'react';
    const element = (tag) => (props) => {
      globalThis.__testNativeElements?.push(props);
      const {children, accessibilityRole, accessibilityLabel, testID, disabled, scrollEnabled, value} = props;
      return React.createElement(tag, {
      'aria-label': accessibilityLabel, role: accessibilityRole, 'data-testid': testID,
      disabled, 'data-scroll-enabled': scrollEnabled, ...(tag === 'input' ? {defaultValue:value} : {}),
    }, children); };
    export const View=element('div'), Text=element('span'), Pressable=element('button'), ScrollView=element('main'), TextInput=element('input'), KeyboardAvoidingView=element('div');
    export const Modal=({visible,children})=>visible ? React.createElement('section',{role:'dialog'},children) : null;
    export const Platform={get OS(){return globalThis.__testPlatform || 'ios';}};
    export const useWindowDimensions=()=>globalThis.__testDimensions || {width:390,height:844,fontScale:1,scale:3};
    export const StyleSheet={create:v=>v};`,
  'react-native-safe-area-context': `export {View as SafeAreaView} from 'react-native';`,
  'expo-router': `export const router={push(){},replace(){},back(){}}; export const useLocalSearchParams=()=>globalThis.__testParams || ({});`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(mocks, specifier)) return { url: `mock:${specifier}`, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = new URL(specifier, context.parentURL);
      for (const extension of ['.ts', '.tsx']) {
        const url = new URL(base.href + extension);
        if (existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return next(
      specifier,
      context.parentURL?.startsWith('mock:') ? { ...context, parentURL: import.meta.url } : context,
    );
  },
  load(url, context, next) {
    if (url.startsWith('mock:'))
      return { format: 'module', source: mocks[url.slice(5)], shortCircuit: true };
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/'))
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText,
      };
    return next(url, context);
  },
});
