import { defineConfig } from 'checkly'

export default defineConfig({
  projectName: 'SignalMind',
  logicalId: 'signalmind',
  checks: {
    locations: ['us-east-1', 'eu-west-1'],
    checkMatch: '**/*.check.ts',
    browserChecks: { testMatch: '**/*.spec.ts' },
  },
})
