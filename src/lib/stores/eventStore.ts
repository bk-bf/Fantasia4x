import { writable, derived } from 'svelte/store';
import type { GameEvent, EventLog } from '$lib/game/core/Events';

export const currentEvent = writable<GameEvent | null>(null);
export const eventLog = writable<EventLog[]>([]);
export const showEventModal = writable<boolean>(false);

// Derived store for recent events (last 10)
export const recentEvents = derived(eventLog, $eventLog => 
  $eventLog.slice(-10).reverse()
);

// Function to add event to log
export function addEventToLog(event: GameEvent, choiceMade?: string, outcome?: string) {
  const logEntry: EventLog = {
    id: crypto.randomUUID(),
    eventId: event.id,
    turn: 0, // Will be set by game state
    title: event.title,
    description: event.description,
    choiceMade,
    outcome: outcome || 'Auto-resolved',
    timestamp: new Date()
  };
  
  eventLog.update(log => [...log, logEntry]);
}

// Function to trigger event modal
export function triggerEvent(event: GameEvent) {
  currentEvent.set(event);
  showEventModal.set(true);
}

// Function to close event modal
export function closeEventModal() {
  currentEvent.set(null);
  showEventModal.set(false);
}