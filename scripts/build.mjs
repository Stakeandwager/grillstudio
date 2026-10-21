import config from "../vite.config.js";
import { build } from "vite";

// Load the repository's real Vite config directly. This avoids Vite's config
// bundler traversing protected ancestor directories in restricted Windows
// workspaces while preserving the configured plugins and build behavior.
await build({ ...config, configFile: false });
