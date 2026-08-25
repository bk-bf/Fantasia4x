export interface WorldTile {
  x: number;
  y: number;
  type: 'land' | 'water' | 'mountain' | 'forest';
  discovered: boolean;
  ascii: string;
  terrainType: string;
  subType: string;
  density: number;
  moisture: number;
  temperature: number | undefined;
  movementCost: number;
  walkable: boolean;
  floor?: { speed: number; dryness: number };
  blocksSight?: boolean;
  resources: Record<string, number>;
  resourceCooldowns?: Record<string, number>;
  growth?: Record<string, number>;
  fertilityWear?: number;
  snow?: number;
  ice?: number;
  territoryOwner: string;
  gCost?: number;
  hCost?: number;
  fCost?: number;
  parent?: { x: number; y: number } | null;
}
