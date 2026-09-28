/** The words of the one Close prompt, which the app's modal and the hex pick's dialog share. */
export const CLOSE_PROMPT = {
  title: (site: string) => `Close the battle at hex ${site}?`,
  body: 'This battle has changes that are not saved. Closing it ends the session for every player.',
  save: 'Save and close',
  discard: 'Close without saving',
  cancel: 'Cancel',
} as const;

/** The GM's ruling on a battle the rules have not settled. */
export const RULINGS = [
  { winner: 'attacker', label: 'Attacker' },
  { winner: 'defender', label: 'Defender' },
  { winner: 'draw', label: 'Draw' },
] as const;
