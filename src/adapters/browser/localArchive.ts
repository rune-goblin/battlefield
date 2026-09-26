import type { BattleArchive } from '../../runtime/ports.js';
import { archiveStore, createJsonArchive } from '../json-store.js';
import { webCell, type WebStorage } from './localRepository.js';

export const ARCHIVE_KEY = 'battlefield.archive.v1';

export const createLocalArchive = (storage: WebStorage = globalThis.localStorage): BattleArchive =>
  createJsonArchive(archiveStore(webCell(storage, ARCHIVE_KEY)));
