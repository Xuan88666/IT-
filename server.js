import('./server.mjs').catch((error) => {
  console.error('服务启动失败:', error.message);
  process.exitCode = 1;
});
