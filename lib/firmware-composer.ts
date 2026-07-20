/**
 * 固件拼装器 —— 按画布模块拼装"经验证的代码片段",取代之前的名字匹配 + analogRead 兜底。
 *
 * 片段来源优先级:
 *   1. db      模块的 software.initCodeSnippet[lang] / sampleUsageSnippet[lang](数据库,A2 收割管线灌入)
 *      DB 片段为字符串,支持分段标记:@includes / @globals / @setup 之后的行归对应段,
 *      sampleUsageSnippet[lang] 整体作为 loop 段。
 *   2. builtin 内置参考库(lib/builtin-snippets.ts)
 *   3. todo    诚实占位 —— 明确说明缺片段,绝不再用 analogRead 冒充 I2C 驱动
 */
import { CanvasComponent } from '../types';
import { BUILTIN_SNIPPETS, matchBuiltinByHeuristic, Snippet } from './builtin-snippets';

export type SnippetSource = 'db' | 'builtin' | 'todo';
export interface ModuleCodeInfo { id: string; name: string; source: SnippetSource; libs: string[]; }
export interface ComposedFirmware { code: string; modules: ModuleCodeInfo[]; libs: string[]; }

function parseDbSnippet(init: string | undefined, usage: string | undefined): Snippet | null {
  if (!init && !usage) return null;
  const s: Snippet = { includes: [], globals: [], setup: [], loop: [], libs: [] };
  if (init) {
    let section: 'includes' | 'globals' | 'setup' = 'setup';
    for (const raw of init.split('\n')) {
      const line = raw.replace(/\r$/, '');
      const marker = line.trim().toLowerCase();
      if (marker.includes('@includes') || marker.includes('@imports')) { section = 'includes'; continue; }
      if (marker.includes('@globals')) { section = 'globals'; continue; }
      if (marker.includes('@setup')) { section = 'setup'; continue; }
      if (line.trim() === '') continue;
      // 无标记时的自动归类:include/import 行进 includes
      if (/^\s*(#include|import |from )/.test(line)) s.includes.push(line.trim());
      else s[section].push(line);
    }
  }
  if (usage) s.loop = usage.split('\n').filter(l => l.trim() !== '');
  if (!s.includes.length && !s.globals.length && !s.setup.length && !s.loop.length) return null;
  return s;
}

function resolveSnippet(c: CanvasComponent, lang: 'arduino' | 'micropython'): { snip: Snippet | null; source: SnippetSource } {
  // 1. 数据库片段
  const sw: any = c.software || {};
  const db = parseDbSnippet(sw.initCodeSnippet?.[lang], sw.sampleUsageSnippet?.[lang]);
  if (db) {
    const libs: string[] = Array.isArray(sw.requiredLibraries) ? sw.requiredLibraries : [];
    return { snip: { ...db, libs: db.libs.length ? db.libs : libs }, source: 'db' };
  }
  // 2. 内置参考
  const key = BUILTIN_SNIPPETS[c.id] ? c.id : matchBuiltinByHeuristic(c.name || '', c.electrical?.protocols);
  const builtin = key ? BUILTIN_SNIPPETS[key]?.[lang] : undefined;
  if (builtin) return { snip: builtin, source: 'builtin' };
  return { snip: null, source: 'todo' };
}

function todoBlock(c: CanvasComponent, lang: 'arduino' | 'micropython'): string[] {
  const cm = lang === 'arduino' ? '//' : '#';
  const protos = (c.electrical?.protocols || []).join('/') || '未知协议';
  return [
    `${cm} ⚠ [${c.name}] 暂无经验证的代码片段(${protos})`,
    `${cm}   请在右侧 AI 对话中让其为该模块生成驱动代码,或在模块库补充标准片段。`,
    `${cm}   本系统不再用占位代码(如 analogRead)冒充真实驱动。`,
  ];
}

export function composeFirmware(components: CanvasComponent[], lang: 'arduino' | 'micropython'): ComposedFirmware {
  const isMcuType = (t?: string) => t === 'mcu' || t === 'processor';
  const mcu = components.find(c => isMcuType(c.type));
  const peripherals = components.filter(c => !isMcuType(c.type));

  if (!mcu) {
    return { code: lang === 'arduino' ? '// 请先添加主控板' : '# 请先添加主控板', modules: [], libs: [] };
  }

  const includes: string[] = lang === 'arduino' ? ['#include <Arduino.h>', '#include <Wire.h>'] : ['import time', 'from machine import Pin, I2C'];
  const globals: string[] = [];
  const setup: string[] = [];
  const loops: string[][] = [];
  const libs: string[] = [];
  const modules: ModuleCodeInfo[] = [];

  for (const p of peripherals) {
    const { snip, source } = resolveSnippet(p, lang);
    modules.push({ id: p.id, name: p.name, source, libs: snip?.libs || [] });
    const header = (lang === 'arduino' ? `  // --- ${p.name} ---` : `        # --- ${p.name} ---`);
    if (snip) {
      includes.push(...snip.includes);
      globals.push(...snip.globals);
      setup.push(...snip.setup.map(l => '  ' + l));
      loops.push([header, ...snip.loop.map(l => (lang === 'arduino' ? '  ' : '        ') + l)]);
      libs.push(...snip.libs);
    } else {
      loops.push([header, ...todoBlock(p, lang).map(l => (lang === 'arduino' ? '  ' : '        ') + l)]);
    }
  }

  const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)));

  let code: string;
  if (lang === 'arduino') {
    code = [
      uniq(includes).join('\n'),
      '',
      '// --- 实例定义(来自各模块标准片段)---',
      uniq(globals).join('\n'),
      '',
      'void setup() {',
      '  Serial.begin(115200);',
      '  Wire.begin();',
      setup.join('\n'),
      '}',
      '',
      'void loop() {',
      loops.map(b => b.join('\n')).join('\n\n'),
      '  delay(2000);',
      '}',
    ].join('\n');
  } else {
    code = [
      uniq(includes).join('\n'),
      '',
      '# --- 实例定义(来自各模块标准片段)---',
      uniq(globals).join('\n'),
      '',
      'def main():',
      '    while True:',
      loops.map(b => b.join('\n')).join('\n\n'),
      '        time.sleep(2)',
      '',
      'if __name__ == "__main__":',
      '    main()',
    ].join('\n');
  }

  return { code, modules, libs: uniq(libs) };
}
