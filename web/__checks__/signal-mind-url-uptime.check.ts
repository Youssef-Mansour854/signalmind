import { AlertChannel, AlertEscalationBuilder, Frequency, RetryStrategyBuilder, UrlMonitor } from 'checkly/constructs'

new UrlMonitor('signal-mind-url-uptime-sJlMtCPI', {
  name: 'SignalMind - URL Uptime',
  activated: true,
  locations: ['us-east-1', 'eu-west-1'],
  frequency: Frequency.EVERY_5M,
  alertChannels: [AlertChannel.fromId(314419)],
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, { amount: 0, interval: 5 }, { enabled: false, percentage: 10 }),
  retryStrategy: RetryStrategyBuilder.noRetries(),
  degradedResponseTime: 3000,
  maxResponseTime: 5000,
  request: {
    url: 'https://signalmind-three.vercel.app/',
    ipFamily: 'IPv4',
  },
})
