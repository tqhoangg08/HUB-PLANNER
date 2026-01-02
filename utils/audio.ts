// Simple UI Click Sound
const CLICK_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';

export const playClick = () => {
  try {
    const audio = new Audio(CLICK_SOUND_URL);
    audio.volume = 0.4; // Keep it subtle
    audio.currentTime = 0;
    audio.play().catch(() => {
        // Ignore autoplay policy errors or network issues
    });
  } catch (e) {
    console.error("Audio play failed", e);
  }
};