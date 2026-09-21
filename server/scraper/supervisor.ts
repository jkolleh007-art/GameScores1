import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

class ScraplingSupervisor {
  private child: ChildProcess | null = null;
  private isRestarting = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private canSpawnPython = true;

  async start(): Promise<void> {
    const isHealthy = await this.checkHealth();
    if (isHealthy) {
      console.log('[Supervisor] Scrapling service is already running on port ' + config.scraplingPort);
      this.monitorHealth();
      return;
    }

    const pythonBin = this.findPythonBinary();
    if (!pythonBin) {
      console.log('[Supervisor] Python Scrapling environment not detected. Native TypeScript Flashscore engine is active.');
      this.canSpawnPython = false;
      return;
    }

    console.log(`[Supervisor] Spawning Python Scrapling Service using ${pythonBin}...`);
    this.spawnProcess(pythonBin);
    this.monitorHealth();
  }

  private findPythonBinary(): string | null {
    const candidates = [
      '/opt/scrapling_venv/bin/python',
      '/opt/scrapling_venv/bin/python3',
      process.env.PYTHON_BIN || '',
    ].filter(Boolean);

    for (const bin of candidates) {
      try {
        if (fs.existsSync(bin)) return bin;
      } catch {}
    }
    return null;
  }

  private spawnProcess(pythonBin: string): void {
    if (this.child) {
      try {
        this.child.kill();
      } catch (e) {}
      this.child = null;
    }

    const scriptPath = path.resolve(process.cwd(), 'scraper/scrapling_service.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[Supervisor] Python scraper script not found at ${scriptPath}`);
      this.canSpawnPython = false;
      return;
    }

    try {
      this.child = spawn(pythonBin, [scriptPath], {
        env: {
          ...process.env,
          SCRAPLING_PORT: String(config.scraplingPort),
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Crucial: attach error listener immediately to prevent unhandled 'error' event crashing Node
      this.child.on('error', (err) => {
        console.warn(`[Supervisor] Python process spawn error: ${err.message}. Operating with native TypeScript scraper.`);
        this.child = null;
        this.canSpawnPython = false;
      });

      this.child.stdout?.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text) console.log(`[Python Scrapling] ${text}`);
      });

      this.child.stderr?.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text) console.log(`[Python Scrapling] ${text}`);
      });

      this.child.on('exit', (code, signal) => {
        console.warn(`[Supervisor] Python Scrapling service exited with code ${code}, signal ${signal}`);
        this.child = null;
        if (!this.isRestarting && this.canSpawnPython) {
          setTimeout(() => this.restart(), 3000);
        }
      });
    } catch (err: any) {
      console.warn('[Supervisor] Failed to spawn Python process:', err?.message);
      this.canSpawnPython = false;
    }
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const resp = await fetch(`${config.scraplingUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const data = await resp.json();
        return data.service === 'python_scrapling';
      }
    } catch (e) {}
    return false;
  }

  private monitorHealth(): void {
    if (!this.canSpawnPython) return;
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = setInterval(async () => {
      const ok = await this.checkHealth();
      if (!ok && this.canSpawnPython) {
        console.warn('[Supervisor] Health check failed, restarting Scrapling service...');
        this.restart();
      }
    }, 20000);
  }

  async restart(): Promise<void> {
    if (this.isRestarting || !this.canSpawnPython) return;
    const pythonBin = this.findPythonBinary();
    if (!pythonBin) return;

    this.isRestarting = true;
    console.log('[Supervisor] Restarting Scrapling service...');
    this.spawnProcess(pythonBin);
    setTimeout(() => {
      this.isRestarting = false;
    }, 4000);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.child) {
      console.log('[Supervisor] Stopping Python Scrapling service child process...');
      this.child.kill('SIGTERM');
      this.child = null;
    }
  }
}

export const scraplingSupervisor = new ScraplingSupervisor();
