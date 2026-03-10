export async function mapWithConcurrency<TInput, TOutput>(
  values: readonly TInput[],
  concurrency: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (concurrency < 1) {
    throw new Error(`Concurrency must be at least 1. Received ${concurrency}.`);
  }

  const results = new Array<TOutput>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= values.length) {
        return;
      }

      results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function clampConcurrency(value: number | undefined, fallback: number, max = 32): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.trunc(value)));
}
