import raycastConfig from "@raycast/eslint-config";

export default [
  {
    ignores: ["raycast-env.d.ts", "node_modules/**"],
  },
  ...raycastConfig.flat(),
];
