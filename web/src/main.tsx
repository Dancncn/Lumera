import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 不用 StrictMode：避免开发期 effect 双调用干扰 AI 驱动循环。
createRoot(document.getElementById('root')!).render(<App />);
