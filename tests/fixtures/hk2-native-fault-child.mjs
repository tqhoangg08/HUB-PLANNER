/** Deterministic IPC faults: do not load Miniflare before simulating SDK failure. */
process.on('message', () => {
  if (process.env.HK2_NATIVE_TEST_FAULT === 'exit') process.exit(19);
  // hang intentionally keeps the IPC connection open without replying
});
process.on('disconnect', () => process.exit(0));
