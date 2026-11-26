/** 推送 dev + v0.26.0（重试 8 次 × 12s） */
import { execSync } from 'node:child_process';

const URL = 'https://github.com/linemarsun/xiyou01.git';
const REFS = ['dev', 'v0.26.0'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const ref of REFS) {
  let done = false;
  for (let i = 1; i <= 8 && !done; i++) {
    try {
      console.log(`[push ${ref}] 第 ${i} 次尝试…`);
      const out = execSync(`git push ${URL} ${ref}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      console.log(out.trim() || '(ok)');
      done = true;
    } catch (e) {
      const msg = String(e.stderr || e.message).trim().split('\n').slice(-2).join(' | ');
      console.log(`  失败: ${msg}`);
      if (i < 8) await sleep(12000);
    }
  }
  console.log(done ? `[push ${ref}] ✓ 成功` : `[push ${ref}] ✗ 8 次均失败`);
  if (!done) process.exit(1);
}
console.log('ALL PUSHED');
