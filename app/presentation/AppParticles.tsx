import Particles from 'react-particles';
import { loadSlim } from 'tsparticles-slim';
import type { Engine, ISourceOptions } from 'tsparticles-engine';

const APP_PARTICLE_OPTIONS: ISourceOptions = {
    fullScreen: { enable: true, zIndex: 0 },
    fpsLimit: 60,
    particles: {
        number: { value: 18, density: { enable: true, area: 900 } },
        color: { value: ['#FFC0CB', '#FF69B4', '#FFD700', '#FFFF00'] },
        shape: { type: 'circle' },
        opacity: {
            value: { min: 0.12, max: 0.36 },
            animation: { enable: true, speed: 0.35 },
        },
        size: { value: { min: 2, max: 4 } },
        move: {
            enable: true,
            speed: { min: 0.6, max: 1.3 },
            direction: 'bottom-right',
            random: true,
            straight: false,
            outModes: 'out',
        },
        wobble: { enable: true, distance: 3, speed: 3 },
    },
    detectRetina: true,
};

const initializeParticles = async (engine: Engine) => {
    await loadSlim(engine);
};

export const AppParticles = () => (
    <Particles
        id="app-particles"
        init={initializeParticles}
        options={APP_PARTICLE_OPTIONS}
        className="absolute inset-0 z-0 pointer-events-none"
    />
);
