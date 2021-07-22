
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
}

export interface AWSWorker {
	startEc2Instance(): Promise<string>
	waitForInstanceRunning(instanceId: string): void
	terminateEc2Instance(): void
}

export interface GitHubWorker {
	getRegistrationToken(): Promise<any>
	getRunner(): Promise<null | any>
	removeRunner(): void
	waitForRunnerRegistered(label: string): void

}
