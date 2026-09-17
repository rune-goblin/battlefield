import { mount } from 'svelte';
import App from './App.svelte';
import { blockPageZoom } from './app-root.js';
import './page.css';
import './app.css';

blockPageZoom();

mount(App, { target: document.getElementById('app')! });
