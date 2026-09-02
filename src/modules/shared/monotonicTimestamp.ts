/**
 * Per-child monotonic millisecond timestamp allocator.
 *
 * One child table may receive concurrent events with the same millisecond
 * timestamp; TDengine keys rows by timestamp, so a same-millisecond second row
 * would silently overwrite the first. This allocator guarantees strictly
 * increasing timestamps per child table within the current process:
 * each request is advanced to at least `previous + 1`.
 *
 * This covers the documented single-instance deployment. Before multiple
 * application replicas, replace with a distributed monotonic allocator,
 * nanosecond timestamps, or a verified TDengine composite-key solution.
 */
export class MonotonicTimestampAllocator {
  private readonly lastTimestampByTable = new Map<string, number>();

  next(tableKey: string, requestedTimestamp: number): number {
    const previousTimestamp = this.lastTimestampByTable.get(tableKey) ?? 0;
    const timestamp = Math.max(requestedTimestamp, previousTimestamp + 1);
    this.lastTimestampByTable.set(tableKey, timestamp);
    return timestamp;
  }
}
