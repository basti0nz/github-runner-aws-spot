export interface IEC2Params {
  instanceId?: string
  ec2ImageId?: string
  ec2InstanceType?: string
  subnetId?: string
  securityGroupId?: string
  iamRoleName?: string
  tags?: string
  githubOwner?: string
  githubRepo?: string
  label?: string
  githubRegistrationToken?: string
  runnerType?: string
  runnerCount?: number
  region?: string
}

export interface AWSWorker {
  startEc2Instance(): Promise<string>
  waitForInstanceRunning(id: string): void
  terminateEc2Instance(): void
  getUserData(): string[]
}

export interface AWSSpotWorker {
  terminateSpotInstance(): void
}

export interface GitHubWorker {
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  getRegistrationToken(): Promise<any>
  getRunner(): Promise<null | any>
  removeRunner(): void
  waitForRunnerRegistered(): void
}
