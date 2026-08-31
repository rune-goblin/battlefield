import { AnimatedSprite, Assets } from 'pixi.js';

const sheet = await Assets.load('blast.json');
const effect = new AnimatedSprite(sheet.animations.blast);
effect.anchor.set(0.5);
effect.animationSpeed = 0.2; // 12 fps on a 60 fps Pixi ticker
effect.loop = false;
effect.play();
