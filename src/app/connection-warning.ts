import { hasGroundConnection, type Board } from '../engine/index.js';

export interface GroundRouteWarning { title: string; message: string }

export function groundRouteWarning(board: Board | null): GroundRouteWarning | null {
  if (!board || hasGroundConnection(board)) return null;
  // proto: wording
  return {
    title: 'No ground route between the armies',
    message: 'Water, cliffs or walls cut every walking route between the deployment zones. Keep this battlefield, paint a crossing, or generate a new map.',
  };
}
