import { mount } from 'svelte';
import { browserStoreClient } from '../adapters/browser/storeClient.js';
import App from './App.svelte';
import { blockPageZoom } from './app-root.js';
import { bindClient } from './game.svelte.js';
import { applyLaunchChoice } from './launch.js';
import './page.css';
import './app.css';

applyLaunchChoice();
bindClient(browserStoreClient());
blockPageZoom();

mount(App, { target: document.getElementById('app')! });
