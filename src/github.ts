import * as github from '@actions/github'
import * as core from '@actions/core'
import _ from 'lodash'
import {GitHubWorker} from './interfaces'

export class gitHubClient implements GitHubWorker {
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  octokit: any
  label: string
  githubToken: string
  owner: string
  repo: string
  githubContext: object

  constructor(token: string, label: string, context: any) {
    this.octokit = github.getOctokit(token)
    this.githubToken = token
    this.label = label
    this.owner = context.repo.owner
    this.repo = context.repo.repo
    this.githubContext = {
      owner: context.repo.owner,
      repo: context.repo.repo
    }

    core.debug(`github: ${this.owner} / ${this.repo}`) // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true
  }

  async getRegistrationToken(): Promise<any> {
    try {
      const response = await this.octokit.request(
        'POST /repos/{owner}/{repo}/actions/runners/registration-token',
        this.githubContext
      )
      core.info('GitHub Registration Token is received')
      return response.data.token
    } catch (error) {
      core.error('GitHub Registration Token receiving error')
      throw error
    }
  }

  async getRunner(): Promise<null | any> {
    try {
      const runners = await this.octokit.paginate(
        'GET /repos/{owner}/{repo}/actions/runners',
        this.githubContext
      )
      const foundRunners = _.filter(runners, {labels: [{name: this.label}]})
      return foundRunners.length > 0 ? foundRunners[0] : null
    } catch (error) {
      return null
    }
  }

  async removeRunner(): Promise<void> {
    const runner = await this.getRunner()
    if (!runner) {
      core.info(
        `GitHub self-hosted runner with label ${this.label} is not found, so the removal is skipped`
      )
      return
    }
    try {
      await this.octokit.request(
        'DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}',
        _.merge(this.githubContext, {runner_id: runner.id})
      )
      core.info(`GitHub self-hosted runner ${runner.name} is removed`)
      return
    } catch (error) {
      core.error('GitHub self-hosted runner removal error')
      throw error
    }
  }

  async waitForRunnerRegistered(): Promise<void> {
    const timeoutMinutes = 5
    const retryIntervalSeconds = 10
    const quietPeriodSeconds = 30
    let waitSeconds = 0

    core.info(
      `Waiting ${quietPeriodSeconds}s for the AWS EC2 instance to be registered in GitHub as a new self-hosted runner`
    )
    await new Promise(r => setTimeout(r, quietPeriodSeconds * 1000))
    core.info(
      `Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runner is registered`
    )

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const runner = await this.getRunner()

        if (waitSeconds > timeoutMinutes * 60) {
          core.error('GitHub self-hosted runner registration error')
          clearInterval(interval)
          reject(
            new Error(
              `A timeout of ${timeoutMinutes} minutes is exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`
            )
          )
        }

        if (runner && runner.status === 'online') {
          core.info(
            `GitHub self-hosted runner ${runner.name} is registered and ready to use`
          )
          clearInterval(interval)
          resolve()
        } else {
          waitSeconds += retryIntervalSeconds
          core.info('Checking...')
        }
      }, retryIntervalSeconds * 1000)
    })
  }
}
