process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "commonjs",
  moduleResolution: "node",
});

// This wrapper exists specifically to bootstrap the TypeScript harness in Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("ts-node/register/transpile-only");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./rate-limit-failover-harness");
