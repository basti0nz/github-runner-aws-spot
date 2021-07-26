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
  const spotPrice = await aws.getSpotPrice()
  core.info(`SpotPrice: ${spotPrice}`)
  const ec2InstanceId = await aws.startEc2Instance()
  await aws.waitForInstanceRunning(ec2InstanceId)
  await ghc.waitForRunnerRegistered()
  return ec2InstanceId
}

async function stopRunner(
  token: string,
  label: string,
  ec2InstanceId: string
): Promise<void> {
  core.info('Mode Stop: stop runner')
  const params: IEC2Params = {
    instanceId: ec2InstanceId
  }
  const aws = new awsClient(params)
  await aws.terminateEc2Instance()

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

    //core.debug(`Waiting ${ms} milliseconds ...`) // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true

    if (mode === 'start') {
      core.info('Mode Start:')
      const params: IEC2Params = {
        ec2ImageId: core.getInput('ec2-image-id'),
        ec2InstanceType: core.getInput('ec2-instance-type'),
        subnetId: core.getInput('subnet-id'),
        securityGroupId: core.getInput('security-group-id'),
        iamRoleName: core.getInput('iam-role-name'),
        tags: core.getInput('aws-resource-tags'),
        label: genLabel()
      }

      if (
        !params.ec2ImageId ||
        !params.ec2InstanceType ||
        !params.subnetId ||
        !params.securityGroupId
      ) {
        throw new Error(
          `Not all the required inputs are provided for the 'start' mode`
        )
      }

      const ec2InstanceId = await startRunner(ghToken, params)
      core.setOutput('label', params.label)
      core.setOutput('ec2-instance-id', ec2InstanceId)
      return
    } else if (mode === 'stop') {
      core.info('Mode Stop:')
      const label = core.getInput('label')
      const ec2InstanceId = core.getInput('ec2-instance-id')
      if (!label || !ec2InstanceId) {
        throw new Error(
          `Not all the required inputs are provided for the 'stop' mode`
        )
      }
      await stopRunner(ghToken, label, ec2InstanceId)
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
