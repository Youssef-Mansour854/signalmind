import { AlertChannel, AlertEscalationBuilder, BrowserCheck, Frequency, RetryStrategyBuilder } from 'checkly/constructs'

new BrowserCheck('signal-mind-homepage-performance-0GR5YyII', {
  name: 'SignalMind - Homepage Performance',
  code: {
    entrypoint: './signal-mind-homepage-performance.spec.ts',
  },
  activated: true,
  locations: ['us-east-1', 'eu-west-1'],
  frequency: Frequency.EVERY_5M,
  alertChannels: [AlertChannel.fromId(314419)],
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, { amount: 0, interval: 5 }, { enabled: false, percentage: 10 }),
  retryStrategy: RetryStrategyBuilder.noRetries(),
})
