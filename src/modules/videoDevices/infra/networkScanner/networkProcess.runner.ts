import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { ProcessResult } from './networkScanner.types';

@Injectable()
export class NetworkProcessRunner {
  run(
    executable: string,
    args: string[],
    timeout: number,
    maxBuffer: number,
    signal?: AbortSignal,
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        args,
        { shell: false, timeout, maxBuffer, encoding: 'utf8', signal },
        (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        },
      );
    });
  }
}
