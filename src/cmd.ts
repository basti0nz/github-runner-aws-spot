import { IEC2Params } from './interfaces'
import * as core from '@actions/core'
import { gitHubClient } from './github'
import { awsClient } from './aws'
import { awsSpotClient } from './awsSpot'

export function genLabel(): string {
  return Math.random().toString(36).substr(2, 5)
}

export async function startRunner(
  token: string,
  params: IEC2Params
): Promise<string> {
  core.info(`Mode Start: start runner with label ${params.label}`)
  const ghc = new gitHubClient(token, params.label!)
  const ghToken = await ghc.getRegistrationToken()

  let ec2InstanceId: string | Promise<string>
  if (params.runnerType === 'spot') {
    const aws = new awsSpotClient(params, ghToken)
    const spotPrice = await aws.getSpotPrice()
    const ondemandPrice = await aws.getOnDemandPrice()
    core.info(`SpotPrice: ${spotPrice}`)
    ec2InstanceId =
      ondemandPrice > spotPrice
        ? await aws.startEc2SpotInstance(spotPrice)
        : startOnDemand(params, ghToken)
  } else {
    ec2InstanceId = startOnDemand(params, ghToken)
  }

  await ghc.waitForRunnerRegistered()
  return ec2InstanceId
}

export async function stopRunner(
  token: string,
  label: string,
  requestID: string,
  spot: boolean
): Promise<void> {
  core.info('Mode Stop: stop runner')

  const params: IEC2Params = {
    instanceId: requestID
  }

  if (spot) {
    core.info(`stop Spot Request ${requestID}`)
    const aws = new awsSpotClient(params)
    await aws.terminateSpotInstance()
  } else {
    const aws = new awsClient(params)
    core.info(`stop ec2InstanceId ${requestID}`)
    await aws.terminateEc2Instance()
  }
  const ghc = new gitHubClient(token, label)
  await ghc.removeRunner()
}

async function startOnDemand(
  params: IEC2Params,
  ghToken: string | undefined
): Promise<string> {
  const aws = new awsClient(params, ghToken)
  return await aws.startEc2Instance()
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
