import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// A trackpad pinch reaches the page as a ctrl-wheel, and outside the canvas Chrome answers it
// by zooming the whole document — the panel, the radial menu and the board's own canvas along
// with it, and the zoom sticks across reloads. Only the board scales here; ⌘+/− still works.
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

mount(App, { target: document.getElementById('app')! });
