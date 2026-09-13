import { allItemDefs } from './items';
import type { MaterialProperty } from '../types';

let _materialProps: Record<string, MaterialProperty> | null = null;
function materialProps(): Record<string, MaterialProperty> {
  if (_materialProps) return _materialProps;
  const props: Record<string, MaterialProperty> = {};
  for (const def of allItemDefs()) {
    if (def.material) props[def.id] = def.material;
  }
  return (_materialProps = props);
}

export function getMaterialProperty(itemId: string): MaterialProperty | undefined {
  return materialProps()[itemId];
}

export function isMaterialWithProps(itemId: string): boolean {
  return itemId in materialProps();
}
