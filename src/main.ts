import * as core from '@actions/core'
import { awsClient } from './aws'
import { gitHubClient } from './github'
import { IEC2Params } from './interfaces'

function genLabel(): string {
  return Math.random().toString(36).substr(2, 5)
}

async function startRunner(token: string, params: IEC2Params): Promise<string> {
  core.info(`Mode Start: start runner with label ${params.label}`)
  const ghc = new gitHubClient(token, params.label!)
  const ghToken = await ghc.getRegistrationToken()
  const aws = new awsClient(params, ghToken)
  let ec2InstanceId: string
  if (params.runnerType === 'spot') {
    const spotPrice = await aws.getSpotPrice()
    const ondemandPrice = await aws.getOnDemandPrice()
    core.info(`SpotPrice: ${spotPrice}`)
    ec2InstanceId =
      ondemandPrice > spotPrice
        ? await aws.startEc2SpotInstance(spotPrice)
        : await aws.startEc2Instance()
  } else {
    ec2InstanceId = await aws.startEc2Instance()
  }

  await ghc.waitForRunnerRegistered()
  return ec2InstanceId
}

async function stopRunner(
  token: string,
  label: string,
  requestID: string,
  spot: boolean
): Promise<void> {
  core.info('Mode Stop: stop runner')

  const params: IEC2Params = {
    instanceId: requestID
  }
  const aws = new awsClient(params)
  if (spot) {
    core.info(`stop Spot Request ${requestID}`)
    await aws.terminateSpotInstance()
  } else {
    core.info(`stop ec2InstanceId ${requestID}`)
    await aws.terminateEc2Instance()
  }
  const ghc = new gitHubClient(token, label)
  await ghc.removeRunner()
}

async function run(): Promise<void> {
  try {
    const mode = core.getInput('mode')
    if (!mode) {
      throw new Error(`The 'mode' input is not specified`)
    }

    const ghToken: string = core.getInput('github-token')
    if (!ghToken) {
      throw new Error(`The 'github-token' input is not specified`)
    }

    //core.debug(`debug ...`) // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true

    if (mode === 'start') {
      let runnerCounter = 1
      if (!isNaN(Number(core.getInput('runner-count')))) {
        const num = Math.floor(Number(core.getInput('runner-count')))
        if (num > 0 && num <= 10) {
          runnerCounter = num
        }
      }

      let awsRegion = core.getInput('region')
      if (!awsRegion) {
        awsRegion = 'us-east1'
      }

      core.info('Mode Start:')
      const params: IEC2Params = {
        ec2ImageId: core.getInput('ec2-image-id'),
        ec2InstanceType: core.getInput('ec2-instance-type'),
        subnetId: core.getInput('subnet-id'),
        securityGroupId: core.getInput('security-group-id'),
        iamRoleName: core.getInput('iam-role-name'),
        tags: core.getInput('aws-resource-tags'),
        label: genLabel(),
        runnerType: core.getInput('runner-type'),
        runnerCount: runnerCounter,
        region: awsRegion
      }

      if (
        !params.ec2ImageId ||
        !params.runnerType ||
        !params.ec2InstanceType ||
        !params.subnetId ||
        !params.securityGroupId
      ) {
        throw new Error(
          `Not all the required inputs are provided for the 'start' mode`
        )
      }
      const responseID = await startRunner(ghToken, params)
      core.setOutput('label', params.label)
      if (core.getInput('runner-type') === `spot`) {
        core.setOutput('ec2-spot-request-id', responseID)
        core.setOutput('ec2-instance-id', 'none')
      } else {
        core.setOutput('ec2-instance-id', responseID)
        core.setOutput('ec2-spot-request-id', 'none')
      }
      return
    } else if (mode === 'stop') {
      core.info('Mode Stop:')
      const label = core.getInput('label')
      let requestId = core.getInput('ec2-instance-id')
      let spot = false
      if (requestId === 'none') {
        requestId = core.getInput('c2-spot-request-id')
        spot = true
      }
      if (!label || !requestId) {
        throw new Error(
          `Not all the required inputs are provided for the 'stop' mode`
        )
      }
      await stopRunner(ghToken, label, requestId, spot)
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
