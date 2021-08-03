import AWS from 'aws-sdk'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  TagSpecificationList,
  TagSpecification,
  TagList,
  Tag,
  CancelSpotInstanceRequestsRequest
} from 'aws-sdk/clients/ec2'
import { AWSWorker, IEC2Params } from './interfaces'
import { onDemandPriceDB } from './ondemand'

export class awsClient implements AWSWorker {
  ec2: AWS.EC2
  params: IEC2Params
  owner: string
  repo: string
  ghToken?: string

  constructor(params: IEC2Params, token?: string) {
    this.ec2 = new AWS.EC2()
    this.params = params
    this.owner = github.context.repo.owner
    this.repo = github.context.repo.repo
    this.ghToken = token
  }

  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async terminateSpotInstance(): Promise<void> {
    core.info('Terminate Spot Instance')
    if (this.params.instanceId === undefined) {
      core.error('AWS Spot request ID is undefined')
      throw new Error('ec2SpotRequestId is undefined')
    }
    const params: CancelSpotInstanceRequestsRequest = {
      SpotInstanceRequestIds: [this.params.instanceId]
    }
    try {
      await this.ec2.cancelSpotInstanceRequests(params).promise()
      core.info(`AWS  SpotRequest ${this.params.instanceId} is terminated`)
      return
    } catch (error) {
      core.error(`AWS SpotRequest ${this.params.instanceId} termination error`)
      throw error
    }
  }

  async terminateEc2Instance(): Promise<void> {
    core.info('Treminate EC2 Instance')
    if (this.params.instanceId === undefined) {
      core.error('AWS EC2 instance ID is undefined')
      throw new Error('ec2InstanceId is undefined')
    }
    const params = {
      InstanceIds: [this.params.instanceId]
    }
    try {
      await this.ec2.terminateInstances(params).promise()
      core.info(`AWS EC2 instance ${this.params.instanceId} is terminated`)
      return
    } catch (error) {
      core.error(`AWS EC2 instance ${this.params.instanceId} termination error`)
      throw error
    }
  }

  async getOnDemandPrice(): Promise<string> {
    if (this.params.ec2InstanceType !== undefined) {
      const instancedb = onDemandPriceDB.get(this.params.ec2InstanceType)
      if (instancedb !== undefined) return instancedb[0].price
    }
    return '9.99'
  }

  async getSpotPrice(): Promise<string> {
    const end = new Date(Date.now())
    const start = new Date(end.getTime() - 30 * 60 * 1000)
    const paramsSpot = {
      InstanceTypes: [this.params.ec2InstanceType!],
      ProductDescriptions: ['Linux/UNIX (Amazon VPC)'],
      StartTime: start,
      EndTime: end
    }
    try {
      const result = await this.ec2
        .describeSpotPriceHistory(paramsSpot)
        .promise()
      let maxPrice = 0

      for (const item of result.SpotPriceHistory!) {
        const price: number = +item.SpotPrice!
        if (price > maxPrice) {
          maxPrice = price
        }
      }
      return `${maxPrice}`
    } catch (error) {
      core.error(`AWS EC2 Spot instance price history has error`)
      throw error
    }
  }

  async startEc2SpotInstance(spotPrice: string): Promise<string> {
    try {
      const request: AWS.EC2.RequestSpotInstancesRequest = {
        SpotPrice: spotPrice,
        InstanceCount: this.params.runnerCount,
        Type: 'one-time',
        TagSpecifications: getTagSpecification(this.params.tags!, true)
      }

      const userData = this.getUserData()
      request.LaunchSpecification = {
        ImageId: this.params.ec2ImageId!,
        InstanceType: this.params.ec2InstanceType!,
        UserData: Buffer.from(userData.join('\n')).toString('base64'),
        SubnetId: this.params.subnetId!,
        SecurityGroupIds: [this.params.securityGroupId!],
        IamInstanceProfile: { Name: this.params.iamRoleName! }
      }
      const spotReq = await this.requestSpot(request)
      if (spotReq !== undefined) {
        await this.waitForSpotInstanceRunning(spotReq)
        const SpotInstanceRequestId =
          spotReq.SpotInstanceRequests![0].SpotInstanceRequestId
        if (SpotInstanceRequestId !== undefined) {
          return SpotInstanceRequestId
        }
      }
      core.error('AWS EC2 spot instance request is undefined')
      throw new Error('ec2SpotInstanceRequest is undefined')
    } catch (error) {
      core.error('AWS EC2 instance starting error')
      throw error
    }
  }

  async requestSpot(
    request: AWS.EC2.RequestSpotInstancesRequest
  ): Promise<AWS.EC2.RequestSpotInstancesResult | undefined> {
    return new Promise((resolve, reject) => {
      this.ec2.requestSpotInstances(request, function (error, data) {
        if (error) {
          core.error(`AWS Spot EC2 instance starting error: ${error}`)
          reject(error)
        }
        resolve(data)
      })
    })
  }

  async waitForSpotInstanceRunning(
    spotResult: AWS.EC2.RequestSpotInstancesResult
  ): Promise<void> {
    core.info('waiting for spot instance running')
    if (spotResult === undefined) {
      core.error('AWS EC2 spot instance request is undefined')
      throw new Error('ec2SpotInstanceRequest is undefined')
    }

    const SpotInstanceRequestId =
      spotResult.SpotInstanceRequests![0].SpotInstanceRequestId !== undefined
        ? spotResult.SpotInstanceRequests![0].SpotInstanceRequestId
        : ''

    const params = {
      SpotInstanceRequestIds: [SpotInstanceRequestId]
    }
    let exit = false
    let timeout = 10
    while (!exit) {
      this.ec2.describeSpotInstanceRequests(params, function (error, data) {
        if (error) {
          core.error(`AWS Spot EC2 instance starting error: ${error}`)
          throw new Error('ec2SpotInstanceRequest ${error}')
        }
        if (data.SpotInstanceRequests![0].State === `active`) {
          core.info(
            `spot instance  ${
              data.SpotInstanceRequests![0].InstanceId
            } is running `
          )
          exit = true
          return
        }
      })
      await this.delay(15 * 1000)
      timeout = timeout - 1
      if (timeout < 0) {
        exit = true
        break
      }
      core.info(`timeout for waiting spot instance is  ${timeout * 15} secs`)
    }
  }

  async startEc2Instance(): Promise<string> {
    core.info(`Userdata: with label ${this.params.label}`)
    const userData = this.getUserData()
    const Ec2Params = {
      ImageId: this.params.ec2ImageId!,
      InstanceType: this.params.ec2InstanceType!,
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userData.join('\n')).toString('base64'),
      SubnetId: this.params.subnetId!,
      SecurityGroupIds: [this.params.securityGroupId!],
      IamInstanceProfile: { Name: this.params.iamRoleName! },
      TagSpecifications: getTagSpecification(this.params.tags!, false)
    }

    try {
      const result = await this.ec2.runInstances(Ec2Params).promise()
      core.info('Ec2 runInstances is started')
      const ec2InstanceId = result.Instances![0].InstanceId
      this.params.ec2ImageId = ec2InstanceId
      core.info(`AWS EC2 instance ${ec2InstanceId} is started`)
      if (ec2InstanceId === undefined) {
        core.error('AWS EC2 instance starting error')
        throw new Error('ec2InstanceId is undefined')
      }
      await this.waitForInstanceRunning(ec2InstanceId)
      return String(ec2InstanceId)
    } catch (error) {
      core.error('AWS EC2 instance starting error')
      throw error
    }
  }

  async waitForInstanceRunning(id: string): Promise<void> {
    core.info('waiting for instance running')
    if (id === undefined) {
      core.error('AWS EC2 instance ID is undefined')
      throw new Error('ec2InstanceId is undefined')
    }
    const params = {
      InstanceIds: [id]
    }
    try {
      await this.ec2.waitFor('instanceRunning', params).promise()
      core.info(`AWS EC2 instance ${this.params.instanceId} is up and running`)
      return
    } catch (error) {
      core.error(
        `AWS EC2 instance ${this.params.instanceId} initialization error`
      )
      throw error
    }
  }

  getUserData(): string[] {
    return [
      '#!/bin/bash',
      'mkdir actions-runner && cd actions-runner',
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      'curl -O -L https://github.com/actions/runner/releases/download/v2.278.0/actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
      'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
      'export RUNNER_ALLOW_RUNASROOT=1',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      `./config.sh --url https://github.com/${this.owner}/${this.repo} --token ${this.ghToken} --labels ${this.params.label}`,
      './run.sh'
    ]
  }
}

/*
function spotRequest(params: type) {
  //https://docs.aws.amazon.com/sdk-for-net/v2/developer-guide/getting-started-spot-instances-net.html
  let ec2 = new AWS.EC2()
  ec2.requestSpotInstances
  //ec2 RequestSpotLaunchSpecification

}
*/

function getTagSpecification(
  param: string,
  spot: boolean
): TagSpecificationList {
  core.info('generate TagSpecification')
  const tagSpecifications: TagSpecificationList = []
  const tagsJSON = JSON.parse(param)
  if (tagsJSON.length > 0) {
    const tagList: TagList = []
    for (const t of tagsJSON) {
      const tag: Tag = {
        Key: t['Key'],
        Value: t['Value']
      }
      tagList.push(tag)
    }
    let tagS: TagSpecification
    if (spot) {
      tagS = {
        ResourceType: 'spot-instances-request',
        Tags: tagList
      }
    } else {
      tagS = {
        ResourceType: 'instance',
        Tags: tagList
      }
    }

    tagSpecifications.push(tagS)
  }
  return tagSpecifications
}
