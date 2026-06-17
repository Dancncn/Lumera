import { createRoot } from 'react-dom/client';
import App from './App';
import { startHeartbeat } from './net/telemetry';
import './styles.css';

// 不用 StrictMode：避免开发期 effect 双调用干扰 AI 驱动循环。
createRoot(document.getElementById('root')!).render(<App />);

startHeartbeat(); // 心跳上报「当前在线」（含本机）

