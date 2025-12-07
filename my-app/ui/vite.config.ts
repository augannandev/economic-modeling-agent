import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Parse CLI arguments for dynamic configuration (local dev only)
const parseCliArgs = () => {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const apiUrlIndex = args.indexOf('--api-url');
  const firebaseAuthPortIndex = args.indexOf('--firebase-auth-port');
  const useFirebaseEmulatorIndex = args.indexOf('--use-firebase-emulator');
  
  return {
    port: portIndex !== -1 ? parseInt(args[portIndex + 1]) : 5173,
    // Only use CLI arg if provided, otherwise let Vite use env vars naturally
    apiUrl: apiUrlIndex !== -1 ? args[apiUrlIndex + 1] : null,
    firebaseAuthPort: firebaseAuthPortIndex !== -1 ? args[firebaseAuthPortIndex + 1] : '5503',
    useFirebaseEmulator: useFirebaseEmulatorIndex !== -1 ? args[useFirebaseEmulatorIndex + 1] : 'false'
  };
};

const { port, apiUrl, firebaseAuthPort, useFirebaseEmulator } = parseCliArgs();

// Build define object - only override if CLI args provided
const viteDefines: Record<string, string> = {};

// Only set VITE_API_URL if explicitly passed via CLI (for local dev)
// In production (Vercel), the env var will be used directly
if (apiUrl) {
  viteDefines['import.meta.env.VITE_API_URL'] = `"${apiUrl}"`;
}
viteDefines['import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT'] = `"${firebaseAuthPort}"`;
viteDefines['import.meta.env.VITE_USE_FIREBASE_EMULATOR'] = `"${useFirebaseEmulator}"`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: port
  },
  define: viteDefines,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  }
})
