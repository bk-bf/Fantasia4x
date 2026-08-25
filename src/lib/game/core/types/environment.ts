export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type WeatherType = string;

export interface WeatherState {
  type: WeatherType;
  intensity: number;
  precip?: string;
  windLevel?: string;
  turnsRemaining: number;
  windTurns?: number;
  wind?: number;
  windDir?: number;
  phase?: 'rising' | 'falling';
}
