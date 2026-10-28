import { MODE_INFO } from '../model/game';
import type { Mode } from '../model/game';
import { Copy } from './ui';

export function GameRules({ mode }: { mode: Mode }) {
  return (
    <>
      {MODE_INFO[mode].rules.map((rule) => (
        <Copy key={rule}>• {rule}</Copy>
      ))}
      <Copy>Time by feel. Don’t count aloud.</Copy>
    </>
  );
}
