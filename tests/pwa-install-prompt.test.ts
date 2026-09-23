import assert from 'node:assert/strict';
import test from 'node:test';

test('beforeinstallprompt is retained for the guide and consumed only once', async () => {
  const browserWindow = new EventTarget();
  (globalThis as unknown as { window: EventTarget }).window = browserWindow;
  try {
    const { canPromptPwaInstall, requestPwaInstall } = await import('../utils/pwaInstallPrompt.ts');
    assert.equal(canPromptPwaInstall(), false);

    let promptCalls = 0;
    const installEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
    };
    installEvent.prompt = async () => { promptCalls += 1; };
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    browserWindow.dispatchEvent(installEvent);

    assert.equal(installEvent.defaultPrevented, true);
    assert.equal(canPromptPwaInstall(), true);
    assert.equal(await requestPwaInstall(), 'accepted');
    assert.equal(canPromptPwaInstall(), false);
    assert.equal(await requestPwaInstall(), 'unavailable');
    assert.equal(promptCalls, 1);
  } finally {
    delete (globalThis as unknown as { window?: EventTarget }).window;
  }
});
