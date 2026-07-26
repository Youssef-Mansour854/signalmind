import { AlertChannel, AlertEscalationBuilder, ApiCheck, AssertionBuilder, Frequency, RetryStrategyBuilder } from 'checkly/constructs'

new ApiCheck('signal-mind-api-portfolio-stats-ysy0rnyq', {
  name: 'SignalMind - API Portfolio Stats',
  degradedResponseTime: 5000,
  maxResponseTime: 20000,
  activated: true,
  locations: ['us-east-1', 'eu-west-1'],
  frequency: Frequency.EVERY_5M,
  alertChannels: [AlertChannel.fromId(314419)],
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, { amount: 0, interval: 5 }, { enabled: false, percentage: 10 }),
  retryStrategy: RetryStrategyBuilder.noRetries(),
  request: {
    url: 'https://signalmind-three.vercel.app/api/portfolio/stats',
    method: 'GET',
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.headers('content-type').contains('application/json'),
      AssertionBuilder.responseTime().lessThan(5000),
    ],
  },
})
