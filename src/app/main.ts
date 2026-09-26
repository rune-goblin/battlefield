import { mount } from 'svelte';
import { browserStoreClient } from '../adapters/browser/storeClient.js';
import App from './App.svelte';
import { blockPageZoom } from './app-root.js';
import { bindClient } from './game.svelte.js';
import { applyLaunchChoice } from './launch.js';
import { bindRecovery } from './store-recovery.js';
import './page.css';
import './app.css';

applyLaunchChoice();
const { client, recovery } = browserStoreClient();
bindClient(client);
bindRecovery(recovery);
blockPageZoom();

mount(App, { target: document.getElementById('app')! });
