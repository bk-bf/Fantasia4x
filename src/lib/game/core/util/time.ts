export const TICKS_PER_SECOND = 60;

export const SECONDS_PER_TICK = 1 / TICKS_PER_SECOND;

export const ticksFromSeconds = (seconds: number): number => seconds * TICKS_PER_SECOND;

export const perTick = (perSecond: number): number => perSecond * SECONDS_PER_TICK;
