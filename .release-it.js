export default {
  git: {
    commitMessage: "release: v${version}",
    tagName: "v${version}",
    requireCleanWorkingDir: true,
    requireUpstream: true,
    requireBranch: "main",
    tag: true,
    commit: true,
  },
  github: {
    release: true,
  },
  npm: {
    publish: true,
  },
  hooks: {
    "before:init": [
      "yarn prettier . --check",
      "yarn tsc --noEmit",
      "yarn eslint .",
      "yarn test",
    ],
    "after:bump": "yarn build",
  },
};
