export class HealthResponseDto {
  status!: 'healthy' | 'unhealthy';
  timestamp!: string;
}
