export type BenchmarkEntry = { label: string; ms: number };

export type PipelineBenchmark = {
  steps: BenchmarkEntry[];
  totalMs: number;
};

export async function timed<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  const ms = Math.round((performance.now() - t0) * 100) / 100;
  return { result, ms };
}

export function timedSync<T>(
  label: string,
  fn: () => T
): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  const ms = Math.round((performance.now() - t0) * 100) / 100;
  return { result, ms };
}

export function logBenchmark(tag: string, bench: PipelineBenchmark): void {
  const parts = bench.steps.map((s) => `${s.label}=${s.ms}ms`).join(' ');
  console.log(`[${tag}] ${parts} total=${bench.totalMs}ms`);
}
