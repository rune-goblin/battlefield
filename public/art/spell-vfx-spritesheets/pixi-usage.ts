import { AnimatedSprite, Assets, Particle, ParticleContainer } from 'pixi.js';

// Load one atlas. Pixi creates 16 Texture views that share one GPU source.
const blastSheet = await Assets.load('blast.json');

// Best for one complete spell animation.
const blast = new AnimatedSprite(blastSheet.animations.blast);
blast.anchor.set(0.5);
blast.animationSpeed = 0.4; // 24 fps when the ticker runs at 60 fps
blast.loop = false;
blast.play();

// Best when many lightweight particles select frames from the same atlas.
const particles = new ParticleContainer({
  dynamicProperties: { position: true, rotation: true, color: true },
});
const textures = blastSheet.animations.blast;
const particle = new Particle({ texture: textures[0], x: 0, y: 0 });
particles.addParticle(particle);

// Advance a Particle manually in your update loop:
// particle.texture = textures[Math.min(15, Math.floor(normalizedAge * 16))];
