// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var __electron_vite_injected_dirname = "F:\\Projects\\POS\\desktop_POS";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts")
        }
      }
    },
    resolve: {
      alias: {
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@main": resolve(__electron_vite_injected_dirname, "src/main")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        }
      }
    },
    resolve: {
      alias: {
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared")
      }
    }
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    },
    resolve: {
      alias: {
        "@renderer": resolve(__electron_vite_injected_dirname, "src/renderer/src"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src")
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
export {
  electron_vite_config_default as default
};
