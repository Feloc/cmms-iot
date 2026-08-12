import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type AttemptWindow = { failures: number; resetAt: number };

@Injectable()
export class LoginAttemptsService {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly maxFailures = 5;
  private readonly windowMs = 15 * 60 * 1000;

  key(tenant: string, email: string): string {
    return `${tenant.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
  }

  assertAllowed(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry) return;
    if (entry.resetAt <= now) {
      this.attempts.delete(key);
      return;
    }
    if (entry.failures >= this.maxFailures) {
      throw new HttpException('Demasiados intentos. Intenta nuevamente más tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  failure(key: string): void {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      this.attempts.set(key, { failures: 1, resetAt: now + this.windowMs });
      return;
    }
    entry.failures += 1;
  }

  success(key: string): void {
    this.attempts.delete(key);
  }
}
