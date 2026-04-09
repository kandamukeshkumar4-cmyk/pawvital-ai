/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Node v24 + Windows workaround
 * 
 * Node v24 changed readlink to return EISDIR (instead of EINVAL) on
 * non-symlink files under Windows. Webpack's enhanced-resolve calls
 * readlink and expects EINVAL, causing the build to crash.
 * 
 * This preload script translates EISDIR → EINVAL so webpack works.
 * Loaded via NODE_OPTIONS=--require so all child workers inherit the patch.
 */
const fs = require("node:fs");

// Patch fs.readlinkSync
const origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function patchedReadlinkSync(...args) {
  try {
    return origReadlinkSync.apply(fs, args);
  } catch (err) {
    if (err && err.code === "EISDIR") {
      err.code = "EINVAL";
      err.errno = -4071;
    }
    throw err;
  }
};

// Patch fs.readlink (callback)
const origReadlink = fs.readlink;
fs.readlink = function patchedReadlink(...args) {
  const cb = args[args.length - 1];
  if (typeof cb !== "function") {
    return origReadlink.apply(fs, args);
  }
  const newArgs = [...args.slice(0, -1), (err, linkString) => {
    if (err && err.code === "EISDIR") {
      err.code = "EINVAL";
      err.errno = -4071;
    }
    cb(err, linkString);
  }];
  return origReadlink.apply(fs, newArgs);
};

// Patch fs.promises.readlink
const origPromisesReadlink = fs.promises.readlink;
fs.promises.readlink = async function patchedPromisesReadlink(...args) {
  try {
    return await origPromisesReadlink.apply(fs.promises, args);
  } catch (err) {
    if (err && err.code === "EISDIR") {
      err.code = "EINVAL";
      err.errno = -4071;
    }
    throw err;
  }
};

// Patch fs.lstatSync to not follow junctions that don't exist
const origLstatSync = fs.lstatSync;
fs.lstatSync = function patchedLstatSync(...args) {
  try {
    return origLstatSync.apply(fs, args);
  } catch (err) {
    if (err && err.code === "EISDIR") {
      err.code = "EINVAL";
      err.errno = -4071;
    }
    throw err;
  }
};
