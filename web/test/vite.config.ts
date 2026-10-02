import { mergeConfig } from 'vite';
import config from '../vite.config';

// Tests control navigation and time; development reloads would invalidate them.
export default mergeConfig(config, { server: { open: false, hmr: false, watch: null } });
